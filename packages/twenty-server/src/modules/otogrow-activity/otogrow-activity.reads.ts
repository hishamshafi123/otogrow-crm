import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type z } from 'zod';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { type OtogrowActivityEventDTO } from 'src/modules/otogrow-activity/otogrow-activity.dto';
import { type ActivityFilters } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import {
  advertisingHash,
  readAdvertisingCursor,
  advertisingTimestampSql,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';

export const activityAuthority = async (
  manager: EntityManager,
  access: OtogrowAccessService,
  workspace: WorkspaceEntity,
  memberId: string,
  userWorkspaceId: string,
) => {
  const current = await access.accessForUser(
    workspace.id,
    memberId,
    userWorkspaceId,
    manager,
  );
  if (!current.capabilities.includes('workspace.admin'))
    throw new ForbiddenException(
      'Only current administrators can view company activity.',
    );
  const actor = {
    memberId,
    isAdmin: true,
    isManager: true,
    roleIds: [...current.roleIds].sort(),
    capabilities: [...current.capabilities].sort(),
  };
  return {
    workspaceId: workspace.id,
    memberId,
    userWorkspaceId,
    actor,
    scope: advertisingHash([
      workspace.id,
      memberId,
      userWorkspaceId,
      current.nativeAdministrator,
      actor.roleIds,
      actor.capabilities,
    ]),
    observedAt: new Date().toISOString(),
  };
};
export type ActivityIdentity = Awaited<ReturnType<typeof activityAuthority>>;
export const activityHasFinance = (identity: ActivityIdentity) =>
  identity.actor.capabilities.includes('finance.read');
export const activityFinanceField = (field: string) =>
  /finance|cost|charge|currency|billing|budget|spend|revenue|profit|margin|amount|payment|balance|rate/i.test(
    field,
  );
export const activityFinanceEvent = (
  event: Pick<OtogrowActivityEventDTO, 'sourceType' | 'action' | 'changes'>,
) =>
  event.sourceType.startsWith('finance') ||
  event.action.startsWith('FINANCE_') ||
  event.changes.some((change) => activityFinanceField(change.field));
export const projectActivityEvent = (
  event: Omit<OtogrowActivityEventDTO, 'occurredAt'>,
  at: string,
  finance: boolean,
): OtogrowActivityEventDTO => ({
  detailsTruncated: event.detailsTruncated ?? false,
  id: event.id,
  occurredAt: at,
  actorId: event.actorId,
  actorName: event.actorName,
  actorType: event.actorType,
  subjectMemberId: event.subjectMemberId,
  subjectName: event.subjectName,
  action: event.action,
  category: event.category,
  outcome: event.outcome,
  summary:
    !finance && activityFinanceEvent(event)
      ? 'Recorded financial activity; financial details require finance access.'
      : event.summary,
  projectId: event.projectId,
  projectName: event.projectName,
  clientId: event.clientId,
  clientName: event.clientName,
  taskId: event.taskId,
  taskName: event.taskName,
  agentName: event.agentName,
  sourceType: event.sourceType,
  sourceId: event.sourceId,
  changes: finance
    ? event.changes
    : event.changes.filter((change) => !activityFinanceField(change.field)),
});
export const validateActivityRange = async (
  manager: EntityManager,
  filters: ActivityFilters,
) => {
  if (filters.from && filters.through) {
    const [range]: { validRange: boolean }[] = await manager.query(
      'SELECT $1::timestamptz < $2::timestamptz AS "validRange"',
      [filters.from, filters.through],
    );
    if (!range.validRange)
      throw new BadRequestException(
        'The end of the activity range must follow its start.',
      );
  }
};
export const activityQuery = (
  manager: EntityManager,
  workspaceId: string,
  filters: ActivityFilters,
) => {
  const query = manager
    .getRepository(OtogrowActivityEventEntity)
    .createQueryBuilder('activity')
    .where('activity."workspaceId" = :workspaceId', { workspaceId });
  if (filters.personId)
    query.andWhere(
      '(activity."actorId" = :personId OR activity."subjectMemberId" = :personId)',
      { personId: filters.personId },
    );
  for (const field of [
    'projectId',
    'clientId',
    'category',
    'action',
    'outcome',
  ] as const)
    if (filters[field])
      query.andWhere(`activity."${field}" = :${field}`, {
        [field]: filters[field],
      });
  if (filters.from)
    query.andWhere('activity."occurredAt" >= :from', { from: filters.from });
  if (filters.through)
    query.andWhere('activity."occurredAt" < :through', {
      through: filters.through,
    });
  return query;
};
export const activityExactTimes = (query: ReturnType<typeof activityQuery>) =>
  query
    .addSelect('CAST(activity.id AS text)', 'cursorId')
    .addSelect(advertisingTimestampSql('activity."occurredAt"'), 'cursorAt');
export const activityCoverage = async (
  manager: EntityManager,
  workspaceId: string,
) => {
  const [row]: { start: string | null }[] = await manager.query(
    `SELECT ${advertisingTimestampSql('min("recordedAt")')} AS start FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1`,
    [workspaceId],
  );
  return row.start;
};

export const parseActivityInput = <TData>(
  schema: z.ZodType<TData>,
  input: unknown,
): TData => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the activity filters, UTC dates and analysis request.',
    );
  return parsed.data;
};
export const readActivityCursor = (
  value: string | null | undefined,
  scope: string,
  timestamp = true,
) => {
  try {
    return readAdvertisingCursor(value, scope, timestamp);
  } catch {
    throw new ConflictException(
      'This activity view changed. Return to the first page.',
    );
  }
};

export const truncateActivityUtf8 = (value: string, limit: number) => {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > limit) break;
    result += character;
    bytes += size;
  }
  return result;
};
const ACTIVITY_NAMES = [
  'actorName',
  'subjectName',
  'projectName',
  'clientName',
  'taskName',
  'agentName',
] as const;
export const boundActivityEvent = (
  event: OtogrowActivityEventDTO,
  alreadyTruncated: string[] = [],
) => {
  const truncated = new Set(alreadyTruncated);
  let omittedBytes = 0;
  const trim = (value: string | null, limit: number, path: string) => {
    if (value === null) return null;
    const result = truncateActivityUtf8(value, limit);
    if (result !== value) {
      truncated.add(path);
      omittedBytes += Buffer.byteLength(value) - Buffer.byteLength(result);
    }
    return result;
  };
  const projected: OtogrowActivityEventDTO = {
    ...event,
    summary: trim(event.summary, 512, 'summary')!,
    changes: event.changes.slice(0, 8).map((change, index) => ({
      field: trim(change.field, 80, `changes.${index}.field`)!,
      before: trim(change.before, 256, `changes.${index}.before`),
      after: trim(change.after, 256, `changes.${index}.after`),
    })),
  };
  for (const field of ACTIVITY_NAMES) {
    const value = trim(event[field], 160, field);
    if (field === 'actorName') projected.actorName = value!;
    else projected[field] = value;
  }
  for (const [index, change] of event.changes.slice(8).entries()) {
    truncated.add(`changes.${index + 8}`);
    omittedBytes +=
      Buffer.byteLength(change.field) +
      (change.before === null ? 0 : Buffer.byteLength(change.before)) +
      (change.after === null ? 0 : Buffer.byteLength(change.after));
  }
  projected.detailsTruncated =
    event.detailsTruncated === true || truncated.size > 0;
  return {
    event: projected,
    omittedBytes,
    truncatedFieldCount: truncated.size,
  };
};
export const readBoundedActivityEvents = async (
  query: ReturnType<typeof activityQuery>,
  finance: boolean,
  limit: number,
) => {
  // PostgreSQL bounds each transported field before JavaScript enforces exact UTF8 limits.
  query.select([]);
  for (const field of [
    'id',
    'actorId',
    'actorType',
    'subjectMemberId',
    'action',
    'category',
    'outcome',
    'projectId',
    'clientId',
    'taskId',
    'sourceType',
    'sourceId',
  ] as const)
    query.addSelect(`activity.${field}`, field);
  for (const field of ACTIVITY_NAMES)
    query.addSelect(`left(activity."${field}",160)`, field);
  query
    .addSelect('left(activity.summary,512)', 'summary')
    .addSelect(advertisingTimestampSql('activity."occurredAt"'), 'occurredAt');
  query.addSelect(
    `COALESCE((SELECT jsonb_agg(jsonb_build_object('field',left(item->>'field',80),'before',left(item->>'before',256),'after',left(item->>'after',256)) ORDER BY ordinal) FROM jsonb_array_elements(activity.changes) WITH ORDINALITY AS change(item,ordinal) WHERE ordinal<=8),'[]'::jsonb)`,
    'changes',
  );
  query.addSelect(
    `COALESCE((SELECT sum(COALESCE(octet_length(item->>'field'),0)+COALESCE(octet_length(item->>'before'),0)+COALESCE(octet_length(item->>'after'),0)) FROM jsonb_array_elements(activity.changes) AS item),0)+octet_length(activity.summary)+${ACTIVITY_NAMES.map((field) => `COALESCE(octet_length(activity."${field}"),0)`).join('+')}`,
    'originalBytes',
  );
  const paths = [
    ...ACTIVITY_NAMES.map(
      (field) =>
        `SELECT '${field}' AS path WHERE length(activity."${field}")>160`,
    ),
    `SELECT 'summary' AS path WHERE length(activity.summary)>512`,
    `SELECT 'changes.'||(ordinal-1)::text AS path FROM jsonb_array_elements(activity.changes) WITH ORDINALITY AS change(item,ordinal) WHERE ordinal>8`,
    ...(['field', 'before', 'after'] as const).map(
      (field) =>
        `SELECT 'changes.'||(ordinal-1)::text||'.${field}' AS path FROM jsonb_array_elements(activity.changes) WITH ORDINALITY AS change(item,ordinal) WHERE ordinal<=8 AND length(item->>'${field}')>${field === 'field' ? 80 : 256}`,
    ),
  ];
  query.addSelect(
    `COALESCE((SELECT jsonb_agg(path) FROM (${paths.join(' UNION ALL ')}) paths),'[]'::jsonb)`,
    'truncatedPaths',
  );
  const rows = await query
    .orderBy('activity.occurredAt', 'DESC')
    .addOrderBy('activity.id', 'DESC')
    .take(limit)
    .getRawMany<
      OtogrowActivityEventDTO & {
        originalBytes: number;
        truncatedPaths: string[];
      }
    >();
  let omittedBytes = 0;
  let truncatedFieldCount = 0;
  const events = rows.map(({ originalBytes, truncatedPaths, ...event }) => {
    const projectedBytes =
      event.changes.reduce(
        (sum, change) =>
          sum +
          Buffer.byteLength(change.field) +
          (change.before === null ? 0 : Buffer.byteLength(change.before)) +
          (change.after === null ? 0 : Buffer.byteLength(change.after)),
        0,
      ) +
      [
        event.summary,
        ...ACTIVITY_NAMES.map((field) => event[field]),
      ].reduce<number>(
        (sum, value) => sum + (value === null ? 0 : Buffer.byteLength(value)),
        0,
      );
    const bounded = boundActivityEvent(event, truncatedPaths);
    omittedBytes +=
      Math.max(0, Number(originalBytes) - projectedBytes) +
      bounded.omittedBytes;
    truncatedFieldCount += bounded.truncatedFieldCount;
    return projectActivityEvent(bounded.event, event.occurredAt, finance);
  });
  return { events, omittedBytes, truncatedFieldCount };
};
