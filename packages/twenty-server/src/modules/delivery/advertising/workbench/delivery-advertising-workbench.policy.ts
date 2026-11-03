import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  advertisingSourceKindSchema,
  type AdvertisingActionInput,
  type AdvertisingGoalSnapshot,
  type AdvertisingLegacyHandling,
  type AdvertisingMetric,
  type AdvertisingSourceSnapshot,
  type AdvertisingTaskEvidence,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

const page = {
  after: z.string().max(2000).nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((value) => value ?? 25),
};
export const advertisingReviewsSchema = z
  .object({
    sourceKind: advertisingSourceKindSchema,
    sourceId: z.uuid(),
    ...page,
  })
  .strict();
export const advertisingSelectionSchema = z.object({ id: z.uuid() }).strict();
export const advertisingReceiptSchema = z
  .object({ requestId: z.uuid() })
  .strict();
export const advertisingObservationsSchema = z
  .object({
    reviewId: z.uuid(),
    actionId: z.uuid().nullish(),
    ...page,
  })
  .strict();
export const advertisingChoicesSchema = z
  .object({
    sourceKind: advertisingSourceKindSchema,
    sourceId: z.uuid(),
    kind: z.enum(['OWNER', 'REVIEWER', 'ASSISTANT']),
    ownerId: z.uuid().nullish(),
    search: z.string().trim().max(160).nullish(),
    ...page,
  })
  .strict()
  .refine((input) => input.kind !== 'ASSISTANT' || Boolean(input.ownerId));

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};
export const advertisingCanonicalJson = (value: unknown) =>
  JSON.stringify(canonical(value));
export const advertisingHash = (value: unknown) =>
  createHash('sha256').update(advertisingCanonicalJson(value)).digest('hex');
export const parseAdvertisingInput = <TData>(
  schema: z.ZodType<TData>,
  input: unknown,
): TData => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the recommendation, outcome, dates and selected people.',
    );
  return parsed.data;
};
export const advertisingCursor = (scope: string, key: string, id: string) =>
  Buffer.from(JSON.stringify({ scope, key, id })).toString('base64url');
export const readAdvertisingCursor = (
  value: string | null | undefined,
  scope: string,
  timestamp = true,
) => {
  if (!value) return null;
  try {
    const parsed = z
      .object({ scope: z.string(), key: z.string().max(240), id: z.uuid() })
      .strict()
      .parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (
      parsed.scope !== scope ||
      (timestamp &&
        !z.iso.datetime({ precision: 6 }).safeParse(parsed.key).success)
    )
      throw new Error('Changed advertising source');
    return parsed;
  } catch {
    throw new ConflictException(
      'This advertising view changed. Return to the first page.',
    );
  }
};
export const advertisingTimestampSql = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const assertAdvertisingLegacyDecision = (
  legacyTaskId: string | null,
  task: AdvertisingTaskEvidence | null,
  handling: AdvertisingLegacyHandling,
  definitions: AdvertisingActionInput[],
  alreadyAdopted: boolean,
) => {
  const adopted = definitions.filter((item) => item.adoptTaskId !== null);
  if (!legacyTaskId) {
    if (
      handling.mode !== 'NONE' ||
      handling.taskId ||
      handling.taskRevision ||
      handling.taskState ||
      adopted.length
    )
      throw new ConflictException(
        'The report no longer has the selected existing follow-up. Refresh before assigning.',
      );
    return;
  }
  if (
    handling.taskId !== legacyTaskId ||
    handling.taskRevision !== (task?.revision ?? null) ||
    handling.taskState !== (task?.state ?? 'UNAVAILABLE')
  )
    throw new ConflictException(
      'The existing follow-up changed. Review its current work before continuing.',
    );
  if (handling.mode === 'ADDITIONAL_WORK') {
    if (!handling.reason.trim() || adopted.length)
      throw new BadRequestException(
        'Explain why this packet is separate from the existing follow-up.',
      );
    return;
  }
  if (
    handling.mode !== 'ADOPT' ||
    adopted.length !== 1 ||
    adopted[0].adoptTaskId !== legacyTaskId ||
    !task?.ownerId ||
    !task.dueAt ||
    task.ownerId === task.reviewerId
  )
    throw new BadRequestException(
      'Explicitly adopt one eligible existing task or acknowledge separate additional work.',
    );
  const action = adopted[0];
  if (
    action.ownerId !== task.ownerId ||
    action.reviewerId !== task.reviewerId ||
    action.dueDate !== task.dueAt.slice(0, 10)
  )
    throw new ConflictException(
      'Adoption preserves the current owner, reviewer and due date. Refresh the existing task.',
    );
  if (alreadyAdopted)
    throw new ConflictException(
      'This existing task is already linked to a reviewed packet. Acknowledge separate follow-up work instead.',
    );
};

export const assertAdvertisingObservationSource = (
  original: Pick<AdvertisingSourceSnapshot, 'kind' | 'accountId' | 'timezone'>,
  later: Pick<AdvertisingSourceSnapshot, 'kind' | 'accountId' | 'timezone'>,
  assessment: string,
) => {
  if (assessment === 'INCONCLUSIVE') return;
  if (
    (original.kind === 'META' || later.kind === 'META') &&
    (original.kind !== later.kind ||
      !original.accountId ||
      !later.accountId ||
      original.accountId !== later.accountId ||
      !original.timezone ||
      !later.timezone ||
      original.timezone !== later.timezone)
  )
    throw new BadRequestException(
      'A conclusive Meta comparison requires the same known ad account and reporting timezone. Record different or unknown reporting scopes as inconclusive.',
    );
};

export const assertAdvertisingObservationMetric = (
  goal: AdvertisingGoalSnapshot,
  metric: AdvertisingMetric,
  value: string | null,
  metricAdId: string | null,
  assessment: string,
) => {
  if (
    metric.unit !== goal.metricUnit ||
    !metric.goalKinds.includes(goal.kind) ||
    metric.value !== value
  )
    throw new BadRequestException(
      'Select one reported outcome compatible with the reviewed primary goal; its value cannot be rewritten.',
    );
  if (
    (goal.provenance !== 'REPORT' ||
      goal.value === null ||
      !goal.metricKey ||
      goal.metricKey !== metric.key ||
      goal.metricAdId !== metricAdId ||
      goal.metricProvenance !== metric.provenance) &&
    assessment !== 'INCONCLUSIVE'
  )
    throw new BadRequestException(
      'Different outcome definitions or attribution sources cannot establish improvement. Record this comparison as inconclusive.',
    );
  if (value === null && assessment !== 'INCONCLUSIVE')
    throw new BadRequestException(
      'An unknown outcome must remain inconclusive.',
    );
};
