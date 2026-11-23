import { z } from 'zod';

const identifier = z.uuid();
const revision = z.number().int().nonnegative();
const reason = z.string().trim().min(3).max(1000);
const label = z.string().trim().min(1).max(160);
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid IANA timezone.');
export const commitmentUnitSchema = z.enum([
  'UNIQUE_VIDEO',
  'VARIATION',
  'OTHER',
]);
export type CommitmentUnit = z.infer<typeof commitmentUnitSchema>;
export type CommitmentBilling = 'ONE_TIME' | 'RETAINER';
export type CommitmentPeriodState = 'OPEN' | 'CLOSED';
export type CommitmentAllocationState =
  | 'ASSIGNED'
  | 'FULFILLED'
  | 'REOPENED'
  | 'REMOVED';
export type CommitmentChange = {
  field: string;
  before: string | null;
  after: string | null;
};
export type CommitmentActor = {
  actorId: string | null;
  actorType: 'HUMAN' | 'CLIENT' | 'SYSTEM';
};
export const commitmentsInputSchema = z
  .object({
    engagementId: identifier,
    periodId: identifier.nullish(),
    taskSearch: z.string().trim().max(160).nullish(),
    selectedTaskId: identifier.nullish(),
    selectedParentTaskId: identifier.nullish(),
    allocationCursor: z.string().max(1000).nullish(),
    orphanAllocationCursor: z.string().max(1000).nullish(),
    historyCursor: z.string().max(1000).nullish(),
    limit: z.number().int().min(1).max(100).nullish(),
  })
  .strict();
export const commitmentPeriodSchema = z
  .object({
    id: identifier,
    engagementId: identifier,
    revision,
    label,
    startDate: z.iso.date(),
    endDateExclusive: z.iso.date().nullable(),
    timezone,
    reason,
  })
  .strict()
  .refine(
    (value) =>
      value.endDateExclusive === null ||
      value.endDateExclusive > value.startDate,
    'The end date must be after the start date.',
  );
export const commitmentPeriodStateSchema = z
  .object({
    engagementId: identifier,
    periodId: identifier,
    revision,
    state: z.enum(['OPEN', 'CLOSED']),
    reason,
  })
  .strict();
export const commitmentLineSchema = z
  .object({
    id: identifier,
    engagementId: identifier,
    periodId: identifier,
    periodRevision: revision,
    revision,
    label,
    unit: commitmentUnitSchema,
    promisedQuantity: z.number().int().min(0).max(1000000),
    reason,
  })
  .strict();
export const commitmentAssignSchema = z
  .object({
    engagementId: identifier,
    periodId: identifier,
    lineId: identifier,
    lineRevision: revision,
    periodRevision: revision,
    taskId: identifier,
    taskRevision: revision,
    revision,
    parentTaskId: identifier.nullable(),
    reason,
  })
  .strict();
export const commitmentRemoveSchema = z
  .object({
    engagementId: identifier,
    periodId: identifier,
    taskId: identifier,
    revision,
    reason,
  })
  .strict();

export const commitmentOrphanCleanupSchema = z
  .object({
    requestId: identifier,
    engagementId: identifier,
    periodId: identifier,
    periodRevision: revision,
    allocationId: identifier,
    allocationRevision: revision,
    confirm: z.literal(true),
  })
  .strict();
