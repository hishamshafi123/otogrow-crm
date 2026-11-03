import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { deliveryFinanceMonthSchema } from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { deliveryReviewAge } from 'src/modules/delivery/reviews/delivery-reviews.policy';
import {
  type DeliveryFounderExceptionDTO,
  type FounderDomain,
} from 'src/modules/delivery/founder/delivery-founder.dto';

const groups: [FounderDomain, string[]][] = [
  [
    'DELIVERY',
    [
      'TASK_OVERDUE',
      'TASK_BLOCKED',
      'TASK_REVISION_REQUESTED',
      'TASK_REVIEW',
      'TASK_REVIEW_WAIT',
      'TASK_DELIVERY_OVERDUE',
      'TASK_OWNER_UNASSIGNED',
      'TASK_OWNER_UNAVAILABLE',
    ],
  ],
  ['COMMITMENTS', ['COMMITMENT_SHORTFALL', 'COMMITMENT_END_UNSET']],
  [
    'FINANCE',
    [
      'FORECAST_ANCHOR_MISSING',
      'FORECAST_EXPECTATION_OVERDUE',
      'FORECAST_NEXT_ACTION_OVERDUE',
      'FORECAST_OWNER_UNAVAILABLE',
      'FORECAST_UNDATED',
      'FORECAST_REVIEW_REQUIRED',
      'FORECAST_UNKNOWN_COLLECTION',
      'FORECAST_UNSCHEDULED_COLLECTION',
      'FORECAST_CASH_WARNING',
      'FORECAST_UNAPPLIED_OUTFLOW',
      'FORECAST_NEGATIVE_CLOSING',
      'MONTHLY_DRAFTS',
      'MONTHLY_RESULT_UNKNOWN',
      'MONTHLY_NEGATIVE_RESULT',
    ],
  ],
  [
    'CAMPAIGNS',
    [
      'CAMPAIGN_REVIEW',
      'CAMPAIGN_CHANGES_REQUESTED',
      'CAMPAIGN_ROUTING_UNAVAILABLE',
      'CAMPAIGN_SETUP',
      'CAMPAIGN_CONNECTION_ATTENTION',
    ],
  ],
  [
    'MANUAL_RISKS',
    [
      'MANUAL_CLIENT_CONCERN',
      'MANUAL_CONTRACT_CONCERN',
      'MANUAL_BUDGET_CONCERN',
    ],
  ],
];
export const FOUNDER_ESCALATION_CONDITIONS = groups.flatMap(([domain, codes]) =>
  codes.map((code) => ({
    code,
    domain,
    requiresServiceMonth: code.startsWith('MONTHLY_'),
  })),
);
export const FOUNDER_ESCALATION_RULE_LIMIT = 50;
export const FOUNDER_ESCALATION_EPISODE_LIMIT = 2000;
export const FOUNDER_ESCALATION_PAGE_SIZE = 25;
const id = z.uuid().transform((value) => value.toLowerCase());
const reason = z.string().trim().min(1).max(2000);
export const founderEscalationDraftSchema = z
  .object({
    id,
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(160),
    condition: z
      .string()
      .refine(
        (value) =>
          FOUNDER_ESCALATION_CONDITIONS.some(
            (condition) => condition.code === value,
          ),
        'Choose a supported factual condition.',
      ),
    recipientId: id,
    minimumReviewWaitHours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .nullish()
      .transform((value) => value ?? null),
    priority: z.enum(['NORMAL', 'URGENT']),
    projectScope: z.enum(['ALL', 'SELECTED']),
    projectIds: z.array(id).max(100),
    includeCompany: z.boolean(),
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    serviceMonth: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    repeatMode: z.enum(['ONCE', 'INTERVAL']),
    repeatHours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .nullish()
      .transform((value) => value ?? null),
    maxSends: z.number().int().min(1).max(20),
  })
  .strict()
  .refine(
    (value) =>
      value.condition === 'TASK_REVIEW_WAIT'
        ? value.minimumReviewWaitHours !== null
        : value.minimumReviewWaitHours === null,
    'Choose an explicit minimum wait for a review-wait alert only.',
  )
  .refine(
    (value) => new Set(value.projectIds).size === value.projectIds.length,
    'Choose each project once.',
  )
  .refine(
    (value) =>
      value.projectScope === 'ALL'
        ? value.projectIds.length === 0
        : value.projectIds.length > 0 || value.includeCompany,
    'Choose explicit project scope.',
  )
  .refine(
    (value) =>
      value.repeatMode === 'ONCE'
        ? value.repeatHours === null && value.maxSends === 1
        : value.repeatHours !== null && value.maxSends >= 2,
    'Choose once or an explicit interval and bounded send count.',
  )
  .refine(
    (value) =>
      value.condition.startsWith('MONTHLY_')
        ? value.serviceMonth !== null
        : value.serviceMonth === null,
    'Choose an explicit month only for a monthly condition.',
  )
  .refine(
    (value) =>
      value.currency === null ||
      ['FINANCE', 'CAMPAIGNS'].includes(
        FOUNDER_ESCALATION_CONDITIONS.find(
          (condition) => condition.code === value.condition,
        )?.domain ?? '',
      ),
    'Currency applies only to financial and campaign conditions.',
  );
export type FounderEscalationDraft = z.infer<
  typeof founderEscalationDraftSchema
>;
export const founderEscalationSaveSchema = founderEscalationDraftSchema
  .safeExtend({ commandId: id, reason })
  .strict();
export const founderEscalationStateSchema = z
  .object({
    commandId: id,
    ruleId: id,
    revision: z.number().int().positive(),
    enabled: z.boolean(),
    previewToken: z
      .string()
      .length(64)
      .nullish()
      .transform((value) => value ?? null),
    adoptLegacyRouting: z.boolean(),
    reason,
  })
  .strict();
export const founderEscalationAcknowledgeSchema = z
  .object({
    commandId: id,
    episodeId: id,
    revision: z.number().int().positive(),
    reason,
  })
  .strict();
export const founderEscalationsQuerySchema = z
  .object({
    ruleId: id.nullish(),
    episodeId: id.nullish(),
    afterRuleId: id.nullish(),
    afterEpisodeId: id.nullish(),
    afterNoticeId: id.nullish(),
  })
  .strict();
export const parseFounderEscalation = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(' '),
    );
  return result.data;
};
export const founderEscalationDomain = (condition: string) => {
  const entry = FOUNDER_ESCALATION_CONDITIONS.find(
    (candidate) => candidate.code === condition,
  );
  if (!entry)
    throw new BadRequestException('This escalation condition is unsupported.');
  return entry.domain;
};
export const founderEscalationSourceKey = (
  item: DeliveryFounderExceptionDTO,
  condition?: string,
): string => {
  if (condition === 'TASK_REVIEW_WAIT')
    return `TASK_REVIEW:${item.sourceId}:${item.evidence.reviewSubmissionVersion}`;
  if (item.sourceType === 'MONTHLY_RESULT')
    return `MONTHLY_RESULT:${item.evidence.currency}:${item.nextAction.serviceMonth}:${item.projectId ?? 'COMPANY'}`;
  if (item.sourceType === 'FORECAST_ANCHOR')
    return `FORECAST_ANCHOR:${item.evidence.currency}`;
  if (item.sourceType === 'CAMPAIGN_SETUP')
    return item.key.startsWith('CAMPAIGNS:CONNECTION:')
      ? `CAMPAIGN_SETUP:${item.key.split(':')[2]}`
      : 'CAMPAIGN_SETUP:META';
  return `${item.sourceType}:${item.sourceId ?? item.key}`;
};
export const founderEscalationInScope = (
  rule: Pick<
    FounderEscalationDraft,
    'projectScope' | 'projectIds' | 'includeCompany' | 'currency'
  >,
  item: DeliveryFounderExceptionDTO,
) =>
  (item.projectId === null
    ? rule.includeCompany
    : rule.projectScope === 'ALL' ||
      rule.projectIds.includes(item.projectId)) &&
  (!rule.currency || item.evidence.currency === rule.currency);
const hasVerifiedReviewTime = (item: DeliveryFounderExceptionDTO, now: Date) =>
  Number.isSafeInteger(item.evidence.reviewSubmissionVersion) &&
  (item.evidence.reviewSubmissionVersion ?? 0) > 0 &&
  deliveryReviewAge(item.evidence.reviewSubmittedAt, now).ageState === 'VALID';
const meetsMinimumReviewWait = (
  rule: FounderEscalationDraft,
  item: DeliveryFounderExceptionDTO,
  now: Date,
) => {
  const hours = rule.minimumReviewWaitHours;
  if (hours === null || hours === undefined) return true;
  const age = deliveryReviewAge(item.evidence.reviewSubmittedAt, now);
  return (
    hasVerifiedReviewTime(item, now) &&
    age.ageSeconds !== null &&
    age.ageSeconds >= hours * 3600
  );
};
export const matchFounderEscalation = (
  rule: FounderEscalationDraft,
  items: DeliveryFounderExceptionDTO[],
  now = new Date(),
) => {
  const matches = items.filter(
    (item) =>
      (item.reasonCode === rule.condition ||
        (rule.condition === 'TASK_REVIEW_WAIT' &&
          item.reasonCode === 'TASK_REVIEW') ||
        item.evidence.warnings.includes(rule.condition)) &&
      founderEscalationInScope(rule, item) &&
      meetsMinimumReviewWait(rule, item, now),
  );
  const grouped = new Map<string, DeliveryFounderExceptionDTO[]>();
  for (const item of matches) {
    const key = founderEscalationSourceKey(item, rule.condition);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return [...grouped.entries()].map(([key, rows]) => ({
    key,
    source: {
      ...rows[0],
      sourceRevision: financeReviewToken(
        rows.map((item) => ({
          key: item.key,
          revision: item.sourceRevision,
          evidence: item.evidence,
        })),
      ),
      evidence: {
        ...rows[0].evidence,
        warnings: [...new Set(rows.flatMap((item) => item.evidence.warnings))],
      },
    },
  }));
};
export const founderEscalationSourceVerified = (
  rule: FounderEscalationDraft,
  items: DeliveryFounderExceptionDTO[],
  verifiedSourceKeys: string[],
  sourceKey: string,
  now: Date,
) => {
  if (rule.condition !== 'TASK_REVIEW_WAIT')
    return verifiedSourceKeys.includes(sourceKey);
  const [kind, taskId, version, extra] = sourceKey.split(':');
  if (
    kind !== 'TASK_REVIEW' ||
    !id.safeParse(taskId).success ||
    !version ||
    !/^[1-9]\d*$/.test(version) ||
    extra !== undefined
  )
    return false;
  const sourceVersion = Number(version);
  if (
    !Number.isSafeInteger(sourceVersion) ||
    !verifiedSourceKeys.includes(`TASK:${taskId}`)
  )
    return false;
  const current = items.find(
    (item) => item.sourceType === 'TASK' && item.sourceId === taskId,
  );
  if (!current || current.evidence.state !== 'IN_REVIEW') return true;
  const currentVersion = current.evidence.reviewSubmissionVersion;
  if (!Number.isSafeInteger(currentVersion) || (currentVersion ?? 0) <= 0)
    return false;
  if (currentVersion !== sourceVersion) return true;
  return hasVerifiedReviewTime(current, now);
};
export const founderEscalationMayRepeat = (
  rule: Pick<FounderEscalationDraft, 'repeatMode' | 'repeatHours' | 'maxSends'>,
  sentCount: number,
  last: { status: string; finishedAt: Date | null } | null,
  acknowledged: boolean,
  now: Date,
) =>
  !acknowledged &&
  rule.repeatMode === 'INTERVAL' &&
  sentCount < rule.maxSends &&
  last?.status === 'SENT' &&
  last.finishedAt !== null &&
  rule.repeatHours !== null &&
  last.finishedAt.getTime() + rule.repeatHours * 3600000 <= now.getTime();

export const founderEscalationReactivationDue = (
  rule: Pick<FounderEscalationDraft, 'repeatMode' | 'repeatHours' | 'maxSends'>,
  sentCount: number,
  lastSuccessfulAt: Date | null,
  now: Date,
) =>
  sentCount === 0 ||
  founderEscalationMayRepeat(
    rule,
    sentCount,
    { status: 'SENT', finishedAt: lastSuccessfulAt },
    false,
    now,
  );
