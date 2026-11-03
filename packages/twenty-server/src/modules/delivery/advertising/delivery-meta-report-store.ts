import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type EntityManager } from 'typeorm';
import { z } from 'zod';
import {
  type MetaConnection,
  type MetaReport,
  type MetaReporting,
} from 'src/modules/delivery/advertising/delivery-meta.types';
import { DeliveryMetaReportEntity } from 'src/modules/delivery/advertising/entities/delivery-meta-report.entity';
import { metaSuccessfulChecks } from 'src/modules/delivery/advertising/delivery-meta-schedule';

export const metaReportFilterSchema = z
  .object({
    selectedId: z.uuid().optional(),
    archive: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
    accountId: z
      .string()
      .regex(/^\d{5,30}$/)
      .optional(),
    fromDate: z.iso.date().optional(),
    throughDate: z.iso.date().optional(),
    status: z.enum(['REVIEW', 'APPROVED', 'CHANGES_REQUESTED']).optional(),
    after: z.string().max(1000).optional(),
  })
  .strict()
  .refine(
    (input) =>
      !input.fromDate ||
      !input.throughDate ||
      input.fromDate <= input.throughDate,
  );
export type MetaReportFilter = z.infer<typeof metaReportFilterSchema>;
export type MetaReportScope = {
  workspaceId: string;
  memberId: string;
  isAdmin: boolean;
  isManager: boolean;
  projectIds: string[];
};
export type StoredMetaReport = {
  report: MetaReport;
  position: string;
  archivedAt: string | null;
  lastCheckedAt: string;
  hasNewerVersion: boolean;
  adCount: number;
};

// Legacy rows stay readable until an authorized write migrates the whole workspace atomically.
export const META_REPORTS_SQL = `WITH client_routes AS NOT MATERIALIZED (
  SELECT item->>'id' AS id, item->>'projectId' AS "projectId", item->>'companyId' AS "companyId",
    item->'advertising'->>'managerId' AS "managerId", item->'advertising'->>'marketerId' AS "marketerId"
  FROM core."deliveryOperations" operations,
    jsonb_array_elements(COALESCE(operations.state->'clients'->'engagements','[]'::jsonb)) item
  WHERE operations."workspaceId"=$1 AND item->'advertising'->>'channel'='META'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(item->'services') service
      WHERE regexp_replace(lower(trim(service)), '[_-]+', ' ', 'g')='performance marketing')
), reports AS NOT MATERIALIZED (
  SELECT id, position, "accountId", date, "projectId", "managerId", "marketerId", status,
    report, "archivedAt", "checkedAt"
  FROM core."deliveryMetaReport" WHERE "workspaceId"=$1
  UNION ALL
  SELECT (item.value->>'id')::uuid, item.ordinality, item.value->>'accountId',
    (item.value->>'date')::date, (item.value->>'projectId')::uuid,
    (item.value->>'managerId')::uuid, (item.value->>'marketerId')::uuid,
    item.value->>'status', item.value, NULL::timestamptz,
    (item.value->>'fetchedAt')::timestamptz
  FROM core."deliveryOperations" operations,
    jsonb_array_elements(COALESCE(operations.state->'metaReporting'->'reports', '[]'::jsonb)) WITH ORDINALITY item
  WHERE operations."workspaceId"=$1 AND NOT EXISTS (
    SELECT 1 FROM core."deliveryMetaReport" stored WHERE stored."workspaceId"=$1 AND stored.id=(item.value->>'id')::uuid
  )
)`;
export const META_REPORT_SCOPE_SQL = `($2::boolean OR CASE WHEN r.report->>'engagementId' IS NOT NULL THEN
  EXISTS (SELECT 1 FROM client_routes route JOIN core."deliveryProject" project ON project."workspaceId"=$1 AND project.id=r."projectId" AND project."companyId"::text=route."companyId" WHERE route.id=r.report->>'engagementId'
    AND route."projectId"=r."projectId"::text AND route."managerId"<>route."marketerId"
    AND (($3::boolean AND route."managerId"=$4::text)
      OR (route."marketerId"=$4::text AND r."projectId"=ANY($5::uuid[]))))
  ELSE (($3::boolean AND r."managerId"=$4::uuid)
    OR (r.status='APPROVED' AND r."marketerId"=$4::uuid AND r."projectId"=ANY($5::uuid[]))) END)`;
export const metaReportScopeValues = (scope: MetaReportScope) => [
  scope.workspaceId,
  scope.isAdmin,
  scope.isManager,
  scope.memberId,
  scope.projectIds,
];
const SUMMARY = `r.report - 'ads' || jsonb_build_object('ads', '[]'::jsonb)`;
export const META_REPORT_NEWER_MATCH_SQL = `newer.position > r.position
    AND newer.report->>'engagementId' IS NOT DISTINCT FROM r.report->>'engagementId'
    AND newer."accountId"=r."accountId" AND newer.date=r.date
    AND newer."projectId" IS NOT DISTINCT FROM r."projectId"
    AND newer."managerId" IS NOT DISTINCT FROM r."managerId"
    AND newer."marketerId" IS NOT DISTINCT FROM r."marketerId"
    AND newer.report->>'currency'=r.report->>'currency'
    AND newer.report->>'timezone'=r.report->>'timezone'`;
const FRESHNESS = `r.position::text AS position, r."archivedAt"::text AS "archivedAt",
  r."checkedAt"::text AS "lastCheckedAt", jsonb_array_length(r.report->'ads') AS "adCount",
  EXISTS (SELECT 1 FROM reports newer WHERE ${META_REPORT_NEWER_MATCH_SQL}) AS "hasNewerVersion"`;

export const insertMetaReport = async (
  manager: EntityManager,
  workspaceId: string,
  report: MetaReport,
  checkedAt = report.fetchedAt,
) => {
  await manager.getRepository(DeliveryMetaReportEntity).insert({
    workspaceId,
    id: report.id,
    accountId: report.accountId,
    date: report.date,
    projectId: report.projectId,
    managerId: report.managerId,
    marketerId: report.marketerId,
    status: report.status,
    report,
    checkedAt: new Date(checkedAt),
    archivedAt: null,
  });
};

export const migrateLegacyMetaReports = async (
  manager: EntityManager,
  workspaceId: string,
  state: MetaReporting,
) => {
  if (!state.reports.length) return;
  if (
    new Set(state.reports.map((report) => report.id)).size !==
    state.reports.length
  )
    throw new ConflictException(
      'Legacy report IDs conflict. No history was removed.',
    );
  const checks = new Map(
    state.connections.flatMap((connection) =>
      [...metaSuccessfulChecks(connection, state.reports).values()].map(
        (check) => [check.reportId, check.checkedAt] as const,
      ),
    ),
  );
  for (const report of state.reports) {
    const [existing]: { matches: boolean }[] = await manager.query(
      'SELECT report=$3::jsonb AS matches FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND id=$2',
      [workspaceId, report.id, JSON.stringify(report)],
    );
    if (existing && !existing.matches)
      throw new ConflictException(
        'Stored report differs from legacy history. No history was removed.',
      );
    if (!existing)
      await insertMetaReport(
        manager,
        workspaceId,
        report,
        checks.get(report.id),
      );
  }
  const [verified]: { count: number }[] = await manager.query(
    `SELECT count(*)::int AS count FROM jsonb_array_elements($2::jsonb) item
    JOIN core."deliveryMetaReport" stored ON stored."workspaceId"=$1 AND stored.id=(item->>'id')::uuid AND stored.report=item`,
    [workspaceId, JSON.stringify(state.reports)],
  );
  if (verified.count !== state.reports.length)
    throw new ConflictException(
      'Report history verification failed. No history was removed.',
    );
  state.reports = [];
  for (const connection of state.connections) delete connection.checks;
};

export const getMetaReport = async (
  manager: EntityManager,
  workspaceId: string,
  id: string,
): Promise<MetaReport | null> => {
  const rows: { report: MetaReport }[] = await manager.query(
    `${META_REPORTS_SQL} SELECT report FROM reports WHERE id=$2::uuid`,
    [workspaceId, id],
  );
  return rows[0]?.report ?? null;
};

export const latestMetaReport = async (
  manager: EntityManager,
  workspaceId: string,
  accountId: string,
  date: string,
) => {
  const rows: { report: MetaReport }[] = await manager.query(
    `${META_REPORTS_SQL} SELECT report FROM reports WHERE "accountId"=$2 AND date=$3::date ORDER BY position DESC LIMIT 1`,
    [workspaceId, accountId, date],
  );
  return rows[0]?.report ?? null;
};

export const metaReportChecks = async (
  manager: EntityManager,
  workspaceId: string,
  connection: MetaConnection,
  fromDate: string,
  throughDate: string,
) => {
  const rows: { date: string; reportId: string; checkedAt: string }[] =
    await manager.query(
      `${META_REPORTS_SQL}
    SELECT DISTINCT ON (date) date::text, id::text AS "reportId", "checkedAt"::text AS "checkedAt" FROM reports
    WHERE "accountId"=$2 AND date BETWEEN $3::date AND $4::date
      AND "projectId" IS NOT DISTINCT FROM $5::uuid AND "managerId" IS NOT DISTINCT FROM $6::uuid
      AND "marketerId" IS NOT DISTINCT FROM $7::uuid AND report->>'currency'=$8 AND report->>'timezone'=$9
      AND report->>'engagementId' IS NOT DISTINCT FROM $10::text
    ORDER BY date, position DESC`,
      [
        workspaceId,
        connection.accountId,
        fromDate,
        throughDate,
        connection.projectId,
        connection.managerId,
        connection.marketerId,
        connection.currency,
        connection.timezone,
        connection.engagementId ?? null,
      ],
    );
  const checks = new Map(
    rows.map((row) => [
      row.date,
      { ...row, checkedAt: new Date(row.checkedAt).toISOString() },
    ]),
  );
  for (const check of connection.checks ?? [])
    if (checks.get(check.date)?.reportId === check.reportId)
      checks.set(check.date, check);
  return checks;
};

export const listMetaReports = async (
  manager: EntityManager,
  scope: MetaReportScope,
  filter: MetaReportFilter,
) => {
  const { after, selectedId: _selectedId, ...criteria } = filter;
  const signature = createHash('sha256')
    .update(JSON.stringify([scope.workspaceId, scope.memberId, criteria]))
    .digest('hex');
  let cursorId: string | null = null;
  if (after) {
    try {
      const cursor = z
        .object({ id: z.uuid(), signature: z.string() })
        .strict()
        .parse(JSON.parse(Buffer.from(after, 'base64url').toString()));
      if (cursor.signature !== signature) throw new Error();
      cursorId = cursor.id;
    } catch {
      throw new BadRequestException(
        'Refresh the report list before changing pages.',
      );
    }
  }
  const values = [
    ...metaReportScopeValues(scope),
    filter.archive,
    filter.accountId ?? null,
    filter.fromDate ?? null,
    filter.throughDate ?? null,
    filter.status ?? null,
  ];
  const WHERE = `${META_REPORT_SCOPE_SQL} AND ($6='ALL' OR ($6='ACTIVE' AND r."archivedAt" IS NULL) OR ($6='ARCHIVED' AND r."archivedAt" IS NOT NULL))
    AND ($7::text IS NULL OR r."accountId"=$7) AND ($8::date IS NULL OR r.date >= $8::date)
    AND ($9::date IS NULL OR r.date <= $9::date) AND ($10::text IS NULL OR r.status=$10)`;
  let position: string | null = null;
  if (cursorId) {
    const cursors: { position: string }[] = await manager.query(
      `${META_REPORTS_SQL} SELECT r.position::text FROM reports r WHERE ${META_REPORT_SCOPE_SQL} AND r.id=$6::uuid`,
      [...metaReportScopeValues(scope), cursorId],
    );
    if (!cursors[0])
      throw new ConflictException('Report access changed. Refresh the list.');
    position = cursors[0].position;
  }
  const rows: StoredMetaReport[] = await manager.query(
    `${META_REPORTS_SQL} SELECT ${SUMMARY} AS report, ${FRESHNESS} FROM reports r
    WHERE ${WHERE} AND ($11::bigint IS NULL OR r.position < $11::bigint) ORDER BY r.position DESC LIMIT 21`,
    [...values, position],
  );
  const [total]: { count: number }[] = await manager.query(
    `${META_REPORTS_SQL} SELECT count(*)::int AS count FROM reports r WHERE ${WHERE}`,
    values,
  );
  const page = rows.slice(0, 20);
  return {
    reports: page.map(({ report, ...metadata }) => ({
      ...report,
      ...metadata,
      lastCheckedAt: new Date(metadata.lastCheckedAt).toISOString(),
    })),
    total: total.count,
    nextCursor:
      rows.length > 20
        ? Buffer.from(
            JSON.stringify({ id: page[page.length - 1].report.id, signature }),
          ).toString('base64url')
        : null,
  };
};

export const readMetaReportPage = async (
  manager: EntityManager,
  scope: MetaReportScope,
  id: string,
  offset: number,
  pageSize = 50,
) => {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50)
    throw new BadRequestException('Choose a supported advertising page size.');
  const rows: StoredMetaReport[] = await manager.query(
    `${META_REPORTS_SQL} SELECT
    ${SUMMARY} || jsonb_build_object('ads', COALESCE((SELECT jsonb_agg(item.value ORDER BY item.ordinality)
      FROM jsonb_array_elements(r.report->'ads') WITH ORDINALITY item WHERE item.ordinality > $7 AND item.ordinality <= $7+$8), '[]'::jsonb)) AS report,
    ${FRESHNESS} FROM reports r WHERE ${META_REPORT_SCOPE_SQL} AND r.id=$6::uuid`,
    [...metaReportScopeValues(scope), id, offset, pageSize],
  );
  if (!rows[0]) return null;
  const { report, ...metadata } = rows[0];
  return {
    ...report,
    ...metadata,
    lastCheckedAt: new Date(metadata.lastCheckedAt).toISOString(),
    nextOffset: offset + pageSize < metadata.adCount ? offset + pageSize : null,
  };
};

export const getMetaReportIdentity = async (
  manager: EntityManager,
  workspaceId: string,
  id: string,
) => {
  const rows: Pick<
    MetaReport,
    'id' | 'status' | 'projectId' | 'managerId' | 'marketerId' | 'engagementId'
  >[] = await manager.query(
    `${META_REPORTS_SQL} SELECT id, status, "projectId", "managerId", "marketerId", report->>'engagementId' AS "engagementId" FROM reports WHERE id=$2::uuid`,
    [workspaceId, id],
  );
  return rows[0] ?? null;
};

export const readMetaReportSummary = async (
  manager: EntityManager,
  scope: MetaReportScope,
  id: string,
  metadataOnly = false,
) => {
  const rows: StoredMetaReport[] = await manager.query(
    `${META_REPORTS_SQL} SELECT ${metadataOnly ? "r.report - ARRAY['ads','account','note'] || jsonb_build_object('ads','[]'::jsonb,'account',NULL,'note','')" : SUMMARY} AS report, ${FRESHNESS} FROM reports r WHERE ${META_REPORT_SCOPE_SQL} AND r.id=$6::uuid`,
    [...metaReportScopeValues(scope), id],
  );
  if (!rows[0]) return null;
  const { report, ...metadata } = rows[0];
  return {
    ...report,
    ...metadata,
    lastCheckedAt: new Date(metadata.lastCheckedAt).toISOString(),
  };
};
