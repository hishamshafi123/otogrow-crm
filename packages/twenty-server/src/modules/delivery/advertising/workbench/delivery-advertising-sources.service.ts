import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { z } from 'zod';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { canReadManualAdvertisingReport } from 'src/modules/delivery/business/delivery-business.policy';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
import {
  META_REPORTS_SQL,
  META_REPORT_SCOPE_SQL,
  META_REPORT_NEWER_MATCH_SQL,
  metaReportScopeValues,
  readMetaReportSummary,
  readMetaReportPage,
  type MetaReportScope,
} from 'src/modules/delivery/advertising/delivery-meta-report-store';
import {
  advertisingCursor,
  advertisingHash,
  parseAdvertisingInput,
  readAdvertisingCursor,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  type AdvertisingGoal,
  type AdvertisingMetric,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import {
  type AdvertisingSourceActor,
  type AdvertisingNamedRouting,
  type AdvertisingSourceEnvelope,
  type AdvertisingSourceReference,
  type AdvertisingSourceSummary,
  type AdvertisingSourcesPage,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import {
  metaAdvertisingBaseMetric,
  advertisingMoneyMicros,
  advertisingMinorDecimal,
  metaAdvertisingMetrics,
  manualAdvertisingMetrics,
  validateAdvertisingGoal,
  advertisingObservationMetric,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-metrics';
import { readAdvertisingTask } from 'src/modules/delivery/advertising/workbench/read-advertising-task';

const QUERY = z
  .object({
    sourceKind: z.enum(['META', 'MANUAL']).nullish(),
    projectId: z.uuid().nullish(),
    channel: z.enum(['META', 'X', 'TIKTOK', 'CHATGPT']).nullish(),
    status: z
      .enum(['DRAFT', 'REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'VOID'])
      .nullish(),
    fromDate: z.iso.date().nullish(),
    throughDate: z.iso.date().nullish(),
    search: z.string().trim().max(160).nullish(),
    after: z.string().max(2000).nullish(),
  })
  .strict()
  .refine(
    (input) =>
      !input.fromDate ||
      !input.throughDate ||
      input.fromDate <= input.throughDate,
  );
const REFERENCE = z
  .object({ kind: z.enum(['META', 'MANUAL']), id: z.uuid() })
  .strict();
type ManualReport = Omit<
  Extract<BusinessRecord, { kind: 'AD_REPORT' }>,
  'history'
>;
export type SourceScope = {
  actor: AdvertisingSourceActor;
  projectFingerprint: string;
  meta: MetaReportScope;
};
type SummaryRow = AdvertisingSourceSummary & {
  date: string;
  sourceRevision: string | null;
  recordedAt: string | null;
};
export const SOURCE_CTE = `${META_REPORTS_SQL},
manual_reports AS NOT MATERIALIZED (
 SELECT item.value AS record FROM core."deliveryOperations" operations,
 jsonb_array_elements(COALESCE(operations.state->'business'->'records','[]'::jsonb)) item(value)
 WHERE operations."workspaceId"=$1 AND item.value->>'kind'='AD_REPORT'
), source_candidates AS NOT MATERIALIZED (
 SELECT 'META'::text AS kind,r.id,r.date,r."projectId",'META'::text AS channel,r.status AS "sourceStatus",NULL::text AS "sourceRevision",
 ('Meta report · '||r.date::text) AS title,r.report->>'currency' AS currency,r.report->>'taskId' AS "legacyTaskId",r.report->>'fetchedAt' AS "recordedAt"
 FROM reports r WHERE ${META_REPORT_SCOPE_SQL}
 UNION ALL
 SELECT 'MANUAL'::text,(record->>'id')::uuid,(record->>'date')::date,(record->>'projectId')::uuid,record->>'channel',record->>'status',record->>'revision',record->>'title',record->>'currency',record->>'taskId',record->>'createdAt'
 FROM manual_reports WHERE ($3::boolean OR ((record->>'projectId')::uuid=ANY($5::uuid[]) AND (record->>'status'='APPROVED' OR record->>'createdBy'=$4::text)))
), visible_sources AS NOT MATERIALIZED (
 SELECT source.*,project.name AS "projectName" FROM source_candidates source
 LEFT JOIN core."deliveryProject" project ON project."workspaceId"=$1 AND project.id=source."projectId"
 WHERE ($2::boolean OR NOT EXISTS (SELECT 1 FROM core."deliveryAdvertisingReview" anchor WHERE anchor."workspaceId"=$1 AND anchor."sourceKind"=source.kind AND anchor."sourceId"=source.id AND (anchor."projectId" IS DISTINCT FROM source."projectId" OR anchor.source->>'companyId' IS DISTINCT FROM project."companyId"::text)))
)`;
const assertTransaction = (manager: EntityManager) => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Advertising sources require an authorized transaction.');
};

@Injectable()
export class DeliveryAdvertisingSourcesService {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly meta: DeliveryMetaService,
    private readonly business: DeliveryBusinessService,
  ) {}
  async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ): Promise<SourceScope> {
    assertTransaction(manager);
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const [projects]: { ids: string[]; fingerprint: string }[] =
      await manager.query(
        `SELECT COALESCE(array_agg(id ORDER BY id),ARRAY[]::uuid[]) AS ids,md5(COALESCE(string_agg(id::text||':'||revision::text,'|' ORDER BY id),'')) AS fingerprint FROM core."deliveryProject" WHERE "workspaceId"=$1 AND "memberIds" ? $2`,
        [workspace.id, memberId],
      );
    return {
      actor,
      projectFingerprint: projects.fingerprint,
      meta: {
        workspaceId: workspace.id,
        memberId,
        isAdmin: actor.isAdmin,
        isManager: actor.isManager,
        projectIds: projects.ids,
      },
    };
  }
  async list(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<AdvertisingSourcesPage> {
    const query = parseAdvertisingInput(QUERY, input);
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const values = [
      ...metaReportScopeValues(scope.meta),
      query.sourceKind ?? null,
      query.projectId ?? null,
      query.channel ?? null,
      query.status ?? null,
      query.fromDate ?? null,
      query.throughDate ?? null,
      query.search ? `%${escapeForIlike(query.search)}%` : null,
    ];
    const where = `($6::text IS NULL OR source.kind=$6) AND ($7::uuid IS NULL OR source."projectId"=$7) AND ($8::text IS NULL OR source.channel=$8) AND ($9::text IS NULL OR source."sourceStatus"=$9) AND ($10::date IS NULL OR source.date>=$10) AND ($11::date IS NULL OR source.date<=$11) AND ($12::text IS NULL OR source.title ILIKE $12)`;
    const [totals]: { totalCount: number; fingerprint: string }[] =
      await manager.query(
        `${SOURCE_CTE} SELECT count(*)::int AS "totalCount",md5(COALESCE(string_agg(source.kind||':'||source.id::text||':'||source."sourceStatus"||':'||COALESCE(source."sourceRevision",''),'|' ORDER BY source.date DESC,source.kind DESC,source.id DESC),'')) AS fingerprint FROM visible_sources source WHERE ${where}`,
        values,
      );
    const signature = advertisingHash([
      workspace.id,
      memberId,
      userWorkspaceId,
      scope.actor.capabilities,
      scope.actor.roleIds,
      scope.projectFingerprint,
      query.sourceKind ?? null,
      query.projectId ?? null,
      query.channel ?? null,
      query.status ?? null,
      query.fromDate ?? null,
      query.throughDate ?? null,
      query.search ?? null,
      totals.fingerprint,
    ]);
    const cursor = readAdvertisingCursor(query.after, signature, false);
    let date: string | null = null;
    let kind: string | null = null;
    if (cursor) {
      const match = /^(\d{4}-\d{2}-\d{2})\|(META|MANUAL)$/.exec(cursor.key);
      if (!match || !z.iso.date().safeParse(match[1]).success)
        throw new ConflictException('Return to the first report page.');
      date = match[1];
      kind = match[2];
    }
    const rows: SummaryRow[] = await manager.query(
      `${SOURCE_CTE}, page AS MATERIALIZED (SELECT source.* FROM visible_sources source WHERE ${where} AND ($13::date IS NULL OR (source.date,source.kind,source.id)<($13::date,$14::text,$15::uuid)) ORDER BY source.date DESC,source.kind DESC,source.id DESC LIMIT 26)
 SELECT r."accountId" AS "accountId",(r."archivedAt" IS NOT NULL) AS archived,
 CASE WHEN page.kind='META' THEN EXISTS (SELECT 1 FROM reports newer WHERE ${META_REPORT_NEWER_MATCH_SQL}) ELSE false END AS "hasNewerVersion",
 page.kind,page.id,page.title,page."projectId",page."projectName",page.channel,page.currency,page.date::text AS date,page.date::text AS "fromDate",page.date::text AS "throughDate",page."sourceStatus",page."sourceRevision",page."legacyTaskId",page."recordedAt",
 (SELECT packet.id FROM core."deliveryAdvertisingReview" packet WHERE packet."workspaceId"=$1 AND packet."sourceKind"=page.kind AND packet."sourceId"=page.id AND packet.state='DRAFT' AND $3::boolean ORDER BY packet."createdAt" DESC,packet.id DESC LIMIT 1) AS "currentDraftId",
 (SELECT packet.id FROM core."deliveryAdvertisingReview" packet WHERE packet."workspaceId"=$1 AND packet."sourceKind"=page.kind AND packet."sourceId"=page.id AND packet.state='ASSIGNED' ORDER BY packet."createdAt" DESC,packet.id DESC LIMIT 1) AS "latestAssignedId"
 FROM page LEFT JOIN reports r ON page.kind='META' AND r.id=page.id
 ORDER BY page.date DESC,page.kind DESC,page.id DESC`,
      [...values, date, kind, cursor?.id ?? null],
    );
    const page = rows.slice(0, 25);
    const last = page[page.length - 1];
    return {
      items: page,
      totalCount: totals.totalCount,
      nextCursor:
        rows.length > 25 && last
          ? advertisingCursor(signature, `${last.date}|${last.kind}`, last.id)
          : null,
      scope: signature,
    };
  }
  private async names(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    ids: (string | null)[],
  ) {
    const selected = [
      ...new Set(ids.filter((id): id is string => id !== null)),
    ];
    if (!selected.length) return new Map<string, string>();
    const rows: { id: string; name: string }[] = await manager.query(
      `SELECT member.id,trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${this.delivery.schema(workspace)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" WHERE member.id=ANY($2::uuid[]) AND member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false`,
      [workspace.id, selected],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }
  async read(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    reference: AdvertisingSourceReference,
    adOffset = 0,
    metricAdId: string | null = null,
    metadataOnly = false,
  ): Promise<AdvertisingSourceEnvelope> {
    const ref = parseAdvertisingInput(REFERENCE, {
      kind: reference.kind,
      id: reference.id,
    });
    if (
      !Number.isSafeInteger(adOffset) ||
      adOffset < 0 ||
      adOffset > 1000000 ||
      (metricAdId !== null && (!metricAdId || metricAdId.length > 100))
    )
      throw new BadRequestException('Choose a valid report and ad page.');
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    let manual: ManualReport | null = null;
    let metaReport: Awaited<ReturnType<typeof readMetaReportSummary>> = null;
    if (ref.kind === 'META') {
      metaReport = await readMetaReportSummary(
        manager,
        scope.meta,
        ref.id,
        metadataOnly,
      );
      if (!metaReport)
        throw new NotFoundException(
          'This report is unavailable or outside your access.',
        );
    } else {
      const rows: { record: ManualReport }[] = await manager.query(
        `SELECT item.value-'history' AS record FROM core."deliveryOperations" operations,jsonb_array_elements(COALESCE(operations.state->'business'->'records','[]'::jsonb)) item(value) WHERE operations."workspaceId"=$1 AND item.value->>'kind'='AD_REPORT' AND item.value->>'id'=$2`,
        [workspace.id, ref.id],
      );
      manual = rows[0]?.record ?? null;
      if (
        !manual ||
        !canReadManualAdvertisingReport(
          manual,
          scope.actor,
          new Set(scope.meta.projectIds),
        )
      )
        throw new NotFoundException(
          'This report is unavailable or outside your access.',
        );
    }
    const projectId = metaReport?.projectId ?? manual?.projectId ?? null;
    const project = projectId
      ? await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({ workspaceId: workspace.id, id: projectId })
      : null;
    const engagementId = metaReport?.engagementId ?? null;
    const [engagement]: {
      companyId: string;
      projectId: string;
      services: string[];
      advertising: {
        channel: string;
        managerId: string;
        marketerId: string;
      } | null;
    }[] = engagementId
      ? await manager.query(
          `SELECT item->>'companyId' AS "companyId",item->>'projectId' AS "projectId",item->'services' AS services,item->'advertising' AS advertising FROM core."deliveryOperations" operations,jsonb_array_elements(COALESCE(operations.state->'clients'->'engagements','[]'::jsonb)) item WHERE operations."workspaceId"=$1 AND item->>'id'=$2`,
          [workspace.id, engagementId],
        )
      : [];
    const packets: {
      id: string;
      state: string;
      companyId: string | null;
      projectId: string;
      selection: string;
    }[] = await manager.query(
      `WITH packets AS NOT MATERIALIZED (SELECT id,state,source->>'companyId' AS "companyId","projectId","createdAt" FROM core."deliveryAdvertisingReview" WHERE "workspaceId"=$1 AND "sourceKind"=$2 AND "sourceId"=$3)
 SELECT *, 'ANCHOR' AS selection FROM (SELECT * FROM packets ORDER BY "createdAt" ASC,id ASC LIMIT 1) anchor
 UNION ALL SELECT *, 'DRAFT' AS selection FROM (SELECT * FROM packets WHERE state='DRAFT' ORDER BY "createdAt" DESC,id DESC LIMIT 1) draft
 UNION ALL SELECT *, 'ASSIGNED' AS selection FROM (SELECT * FROM packets WHERE state='ASSIGNED' ORDER BY "createdAt" DESC,id DESC LIMIT 1) assigned`,
      [workspace.id, ref.kind, ref.id],
    );
    const anchor = packets.find((packet) => packet.selection === 'ANCHOR');
    const companyId = engagement
      ? engagement.companyId
      : anchor
        ? anchor.companyId
        : (project?.companyId ?? null);
    const anchorMismatch =
      Boolean(
        anchor &&
        (anchor.projectId !== projectId ||
          anchor.companyId !== (project?.companyId ?? null)),
      ) ||
      Boolean(
        engagement && engagement.companyId !== (project?.companyId ?? null),
      );
    if (anchorMismatch && !scope.actor.isAdmin)
      throw new NotFoundException(
        'This report is unavailable or outside your current client access.',
      );
    const originalManager = metaReport?.managerId ?? null;
    const originalMarketer =
      metaReport?.marketerId ?? manual?.marketerId ?? null;
    const hasService =
      engagement?.services.some(
        (service) =>
          service.trim().toLowerCase().replace(/[_-]+/g, ' ') ===
          'performance marketing',
      ) ?? false;
    const routeValid =
      !engagementId ||
      Boolean(
        engagement &&
        hasService &&
        engagement.advertising?.channel === 'META' &&
        engagement.projectId === projectId &&
        !anchorMismatch,
      );
    const managerId = engagementId
      ? (engagement?.advertising?.managerId ?? null)
      : originalManager;
    const marketerId = engagementId
      ? (engagement?.advertising?.marketerId ?? null)
      : originalMarketer;
    const memberNames = await this.names(manager, workspace, [
      originalManager,
      originalMarketer,
      managerId,
      marketerId,
    ]);
    const named = (
      manager: string | null,
      marketer: string | null,
    ): AdvertisingNamedRouting => ({
      projectId,
      projectName: project?.name ?? null,
      companyId,
      engagementId,
      managerId: manager,
      managerName: manager ? (memberNames.get(manager) ?? null) : null,
      marketerId: marketer,
      marketerName: marketer ? (memberNames.get(marketer) ?? null) : null,
    });
    const sourceStatus = metaReport?.status ?? manual?.status ?? 'UNKNOWN';
    const requiresSourceApproval = sourceStatus !== 'APPROVED';
    const reasonCodes: string[] = [];
    if (!project) reasonCodes.push('MISSING_PROJECT');
    if (anchorMismatch) reasonCodes.push('CLIENT_PROJECT_CHANGED');
    if (!routeValid) reasonCodes.push('ROUTING_UNAVAILABLE');
    if (sourceStatus === 'VOID') reasonCodes.push('SOURCE_VOID');
    const canManageDraft =
      scope.actor.isManager &&
      Boolean(project) &&
      !anchorMismatch &&
      routeValid &&
      sourceStatus !== 'VOID';
    let canReview = canManageDraft;
    if (requiresSourceApproval) {
      if (sourceStatus !== 'REVIEW') {
        reasonCodes.push('SOURCE_NOT_SUBMITTED');
        canReview = false;
      }
      if (
        ref.kind === 'MANUAL' &&
        (manual?.createdBy === memberId || manual?.marketerId === memberId)
      ) {
        reasonCodes.push('INDEPENDENT_SOURCE_REVIEW_REQUIRED');
        canReview = false;
      }
      if (
        ref.kind === 'META' &&
        ((!scope.actor.isAdmin && managerId !== memberId) ||
          marketerId === memberId)
      ) {
        reasonCodes.push('INDEPENDENT_SOURCE_REVIEW_REQUIRED');
        canReview = false;
      }
    }
    if (ref.kind === 'META' && routeValid) {
      try {
        await this.meta.validateReportRouting(
          workspace,
          { projectId, managerId, marketerId },
          manager,
        );
      } catch {
        reasonCodes.push('ROUTING_UNAVAILABLE');
        canReview = false;
      }
    }
    const factual = metaReport
      ? {
          kind: ref.kind,
          id: ref.id,
          position: metaReport.position,
          date: metaReport.date,
          fetchedAt: metaReport.fetchedAt,
          accountId: metaReport.accountId,
          currency: metaReport.currency,
          timezone: metaReport.timezone,
          projectId,
          engagementId,
          originalManager,
          originalMarketer,
        }
      : manual
        ? Object.fromEntries(
            Object.entries(manual).filter(
              ([key]) =>
                ![
                  'revision',
                  'status',
                  'decisionBy',
                  'evidence',
                  'taskId',
                  'updatedAt',
                  'history',
                ].includes(key),
            ),
          )
        : null;
    const evidenceFingerprint = advertisingHash(factual);
    const fingerprint = advertisingHash([
      evidenceFingerprint,
      manual?.revision ?? null,
      sourceStatus,
      metaReport?.taskId ?? manual?.taskId ?? null,
      project?.revision ?? 0,
      project?.companyId ?? null,
      companyId,
      routeValid,
      managerId,
      marketerId,
      reasonCodes.filter(
        (reason) => reason !== 'INDEPENDENT_SOURCE_REVIEW_REQUIRED',
      ),
    ]);
    let row: MetaInsightRow | null = metaReport?.account ?? null;
    let ads: MetaInsightRow[] = [];
    if (!metadataOnly && metaReport) {
      const page = await readMetaReportPage(
        manager,
        scope.meta,
        ref.id,
        adOffset,
        25,
      );
      ads = page?.ads ?? [];
      if (metricAdId) {
        const rows: { row: MetaInsightRow }[] = await manager.query(
          `${META_REPORTS_SQL} SELECT item.value AS row FROM reports r,jsonb_array_elements(r.report->'ads') item(value) WHERE ${META_REPORT_SCOPE_SQL} AND r.id=$6 AND item.value->>'ad_id'=$7 LIMIT 2`,
          [...metaReportScopeValues(scope.meta), ref.id, metricAdId],
        );
        if (rows.length !== 1)
          throw new BadRequestException(
            'This exact ad is missing or ambiguous in the selected report.',
          );
        row = rows[0].row;
      }
    }
    if (metricAdId && manual)
      throw new BadRequestException(
        'A manually recorded report has no imported ad rows.',
      );
    const metrics: AdvertisingMetric[] = metadataOnly
      ? []
      : manual
        ? manualAdvertisingMetrics(manual)
        : metaAdvertisingMetrics(row, metricAdId);
    const accountSpend = manual
      ? advertisingMinorDecimal(manual.spend)
      : metaAdvertisingBaseMetric(metaReport?.account ?? null, 'spend').value;
    const legacyTaskId = metaReport?.taskId ?? manual?.taskId ?? null;
    const adopted: { reviewId: string }[] = legacyTaskId
      ? await manager.query(
          'SELECT "reviewId" FROM core."deliveryAdvertisingAction" WHERE "workspaceId"=$1 AND "taskId"=$2 AND definition->>\'adoptTaskId\'=$2::text LIMIT 1',
          [workspace.id, legacyTaskId],
        )
      : [];
    const source = {
      kind: ref.kind,
      id: ref.id,
      fingerprint,
      evidenceFingerprint,
      sourceRevision: manual?.revision ?? null,
      legacyTaskId,
      title: manual?.title ?? `Meta report · ${metaReport?.date}`,
      projectId,
      companyId,
      engagementId,
      clientProvenance: engagement
        ? 'ENGAGEMENT'
        : anchor
          ? 'WORKBENCH_DECISION'
          : 'CURRENT_PROJECT_AT_REVIEW',
      accountId: metaReport?.accountId ?? null,
      channel: manual?.channel ?? 'META',
      currency: manual?.currency ?? metaReport?.currency ?? '',
      fromDate: manual?.date ?? metaReport?.date ?? '',
      throughDate: manual?.date ?? metaReport?.date ?? '',
      timezone: metaReport?.timezone ?? null,
      spendMicros: advertisingMoneyMicros(accountSpend),
      sourceStatus,
      routing: {
        projectId,
        projectRevision: project?.revision ?? 0,
        companyId,
        engagementId,
        managerId,
        marketerId,
      },
    };
    return {
      actor: scope.actor,
      source,
      fingerprint,
      evidenceFingerprint,
      canManageDraft,
      canReview,
      requiresSourceApproval,
      evidenceLoaded: !metadataOnly,
      recordedAt: metaReport?.fetchedAt ?? manual?.createdAt ?? null,
      lastCheckedAt: metaReport?.lastCheckedAt ?? null,
      hasNewerVersion: metaReport?.hasNewerVersion ?? false,
      reasonCodes: [...new Set(reasonCodes)],
      legacyTaskId,
      legacyTask: await readAdvertisingTask(
        manager,
        workspace.id,
        this.delivery.schema(workspace),
        projectId,
        legacyTaskId,
      ),
      legacyAdoptedReviewId: adopted[0]?.reviewId ?? null,
      legacyReviewNote: manual?.recommendation ?? metaReport?.note ?? '',
      reportedGoalKind: manual?.goal ?? null,
      reportedTargetCostMicros:
        manual && manual.targetCost > 0
          ? advertisingMoneyMicros(advertisingMinorDecimal(manual.targetCost))
          : null,
      metrics,
      originalRouting: named(originalManager, originalMarketer),
      currentRouting: routeValid ? named(managerId, marketerId) : null,
      project,
      sourceUrl: manual?.sourceUrl ?? null,
      metricAdId,
      ads: ads.map((ad) => ({
        id: ad.ad_id ?? '',
        name: ad.ad_name ?? '',
        campaignId: ad.campaign_id ?? null,
        campaignName: ad.campaign_name ?? null,
        adsetId: ad.adset_id ?? null,
        adsetName: ad.adset_name ?? null,
        spendMicros: advertisingMoneyMicros(
          metaAdvertisingBaseMetric(ad, 'spend').value,
        ),
        impressions: metaAdvertisingBaseMetric(ad, 'impressions').value,
        clicks: metaAdvertisingBaseMetric(ad, 'clicks').value,
      })),
      adTotalCount: metaReport?.adCount ?? 0,
      adOffset,
      nextAdOffset:
        !metadataOnly && adOffset + 25 < (metaReport?.adCount ?? 0)
          ? adOffset + 25
          : null,
      currentDraftId: scope.actor.isManager
        ? (packets.find((packet) => packet.selection === 'DRAFT')?.id ?? null)
        : null,
      latestAssignedId:
        packets.find((packet) => packet.selection === 'ASSIGNED')?.id ?? null,
    };
  }
  async approve(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    ref: AdvertisingSourceReference,
    expectedSourceToken: string,
    note: string,
  ) {
    const source = await this.read(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      ref,
      0,
      null,
      true,
    );
    if (source.fingerprint !== expectedSourceToken)
      throw new ConflictException(
        'The source or current responsibilities changed. Review the current report before assigning.',
      );
    if (!source.canReview)
      throw new ForbiddenException(
        'An independent currently authorized manager must review this source.',
      );
    if (!source.requiresSourceApproval) return source;
    if (ref.kind === 'META')
      await this.meta.reviewForWorkbench(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        {
          action: 'review',
          id: ref.id,
          status: 'APPROVED',
          note,
          expectedRouting: {
            projectId: source.source.projectId,
            managerId: source.currentRouting?.managerId ?? null,
            marketerId: source.currentRouting?.marketerId ?? null,
          },
        },
      );
    else
      await this.business.reviewAdvertisingForWorkbench(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        { id: ref.id, revision: source.source.sourceRevision ?? 0, note },
      );
    return this.read(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      ref,
      0,
      null,
      true,
    );
  }
  validateGoal(source: AdvertisingSourceEnvelope, goal: AdvertisingGoal) {
    return validateAdvertisingGoal(source, goal);
  }
  observationMetric(source: AdvertisingSourceEnvelope, key: string) {
    return advertisingObservationMetric(source, key);
  }
}
