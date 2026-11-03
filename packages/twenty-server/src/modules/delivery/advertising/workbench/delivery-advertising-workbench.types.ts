import { z } from 'zod';

const identifier = z.uuid();
const decimal = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,12})?$/);
const micros = z.string().regex(/^(0|[1-9]\d{0,23})$/);
const note = z.string().trim().min(1).max(4000);
export const advertisingSourceKindSchema = z.enum(['META', 'MANUAL']);
export const advertisingGoalKindSchema = z.enum([
  'PURCHASES',
  'LEADS',
  'QUALIFIED_LEADS',
  'BOOKED_CALLS',
  'REGISTRATIONS',
  'SALES',
]);
export const advertisingGoalSchema = z
  .object({
    kind: advertisingGoalKindSchema,
    metricKey: z.string().min(1).max(240).nullable(),
    metricAdId: z.string().min(1).max(100).nullable().default(null),
    provenance: z.enum(['REPORT', 'HUMAN']),
    value: decimal.nullable(),
    evidence: z.string().trim().max(4000),
    targetCostMicros: micros.nullable(),
  })
  .strict();
export const advertisingActionSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(200),
    rationale: note.max(3000),
    expectedResult: note.max(3000),
    evidence: note.max(3000),
    ownerId: identifier,
    reviewerId: identifier,
    dueDate: z.iso.date(),
    assistantId: identifier.nullable().default(null),
    adoptTaskId: identifier.nullable().default(null),
    origin: z
      .object({ runId: identifier, suggestionId: identifier })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .refine((action) => action.ownerId !== action.reviewerId, {
    message: 'Choose an independent reviewer.',
  })
  .transform((action) => {
    // Preserve legacy receipt hashes when newer callers send the optional origin explicitly empty.
    if (action.origin === null) delete action.origin;
    return action;
  });
export const advertisingLegacyHandlingSchema = z
  .object({
    mode: z.enum(['NONE', 'ADOPT', 'ADDITIONAL_WORK']),
    taskId: identifier.nullable(),
    taskRevision: z.number().int().positive().nullable(),
    taskState: z.string().max(100).nullable(),
    reason: z.string().trim().max(2000),
  })
  .strict();
export const saveAdvertisingReviewSchema = z
  .object({
    requestId: identifier,
    id: identifier,
    revision: z.number().int().nonnegative(),
    sourceKind: advertisingSourceKindSchema,
    sourceId: identifier,
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    goal: advertisingGoalSchema,
    note,
    noChangeReason: z.string().trim().max(4000),
    legacyHandling: advertisingLegacyHandlingSchema,
    actions: z.array(advertisingActionSchema).max(20),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.actions.map((action) => action.id)).size ===
      input.actions.length,
    {
      message: 'Every recommendation needs its own identity.',
    },
  )
  .refine(
    (input) => input.actions.length > 0 || input.noChangeReason.length > 0,
    {
      message: 'Explain an explicit no-change review.',
    },
  );
export const assignAdvertisingReviewSchema = z
  .object({
    requestId: identifier,
    id: identifier,
    revision: z.number().int().positive(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const observeAdvertisingActionSchema = z
  .object({
    requestId: identifier,
    id: identifier,
    reviewId: identifier,
    actionId: identifier,
    correctsId: identifier.nullable().default(null),
    assessment: z.enum(['IMPROVED', 'WORSE', 'UNCHANGED', 'INCONCLUSIVE']),
    sourceKind: advertisingSourceKindSchema.nullable().default(null),
    sourceId: identifier.nullable().default(null),
    sourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    metricKey: z.string().min(1).max(240).nullable().default(null),
    metricAdId: z.string().min(1).max(100).nullable().default(null),
    value: decimal.nullable(),
    fromDate: z.iso.date(),
    throughDate: z.iso.date(),
    evidence: note,
    note,
  })
  .strict()
  .refine((input) => input.fromDate <= input.throughDate)
  .refine((input) => Boolean(input.sourceKind) === Boolean(input.sourceId))
  .refine((input) => Boolean(input.sourceId) === Boolean(input.metricKey));

export type AdvertisingSourceKind = z.infer<typeof advertisingSourceKindSchema>;
export type AdvertisingGoalKind = z.infer<typeof advertisingGoalKindSchema>;
export type AdvertisingGoal = z.infer<typeof advertisingGoalSchema>;
export type AdvertisingActionInput = z.infer<typeof advertisingActionSchema>;
export type AdvertisingActionDefinition = Omit<
  AdvertisingActionInput,
  'origin'
> & {
  origin?: { runId: string; suggestionId: string; humanEdited: boolean } | null;
};
export type AdvertisingLegacyHandling = z.infer<
  typeof advertisingLegacyHandlingSchema
>;
export type SaveAdvertisingReview = z.infer<typeof saveAdvertisingReviewSchema>;
export type AssignAdvertisingReview = z.infer<
  typeof assignAdvertisingReviewSchema
>;
export type AdvertisingObservationInput = z.infer<
  typeof observeAdvertisingActionSchema
>;
export type AdvertisingGoalSnapshot = AdvertisingGoal & {
  metricLabel: string | null;
  metricProvenance: string;
  metricReason: string | null;
  metricUnit: string;
  currency: string;
  timezone: string | null;
  fromDate: string;
  throughDate: string;
  sourceFingerprint: string;
};
export type AdvertisingRoutingSnapshot = {
  projectId: string | null;
  projectRevision: number;
  companyId: string | null;
  engagementId: string | null;
  managerId: string | null;
  marketerId: string | null;
};
export type AdvertisingSourceSnapshot = {
  kind: AdvertisingSourceKind;
  id: string;
  fingerprint: string;
  evidenceFingerprint: string;
  sourceRevision: number | null;
  legacyTaskId: string | null;
  title: string;
  projectId: string | null;
  companyId: string | null;
  engagementId: string | null;
  clientProvenance: string;
  channel: string;
  accountId: string | null;
  currency: string;
  timezone: string | null;
  fromDate: string;
  throughDate: string;
  spendMicros: string | null;
  sourceStatus: string;
  routing: AdvertisingRoutingSnapshot;
};
export type AdvertisingTaskEvidence = {
  id: string;
  title: string;
  revision: number;
  state: string;
  ownerId: string | null;
  ownerName: string | null;
  reviewerId: string;
  reviewerName: string | null;
  dueAt: string | null;
  submissionVersion: number | null;
  submissionState: string | null;
  evidence: { url: string; label: string }[];
};
export type AdvertisingMetric = {
  key: string;
  label: string;
  unit: 'COUNT' | 'MONEY' | 'OTHER';
  goalKinds: AdvertisingGoalKind[];
  value: string | null;
  provenance: string;
  reason: string | null;
};
export type AdvertisingEventResult = {
  reviewId: string;
  revision: number;
  state: 'DRAFT' | 'ASSIGNED';
  actionTasks: { actionId: string; taskId: string }[];
  observationId: string | null;
};
