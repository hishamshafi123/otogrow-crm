import { z } from 'zod';

const note = z.string().trim().max(6000);
const evidenceUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        ![...url.searchParams.keys()].some((key) =>
          /token|secret|password|signature|authorization|api.?key/i.test(key),
        )
      );
    } catch {
      return false;
    }
  }, 'Use an HTTPS evidence link without credentials or access tokens.');
export const releaseBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    ownerId: z.uuid(),
    targetDate: z.iso.date(),
    repositoryUrl: evidenceUrl.refine(Boolean, 'Add the repository link.'),
    commitSha: z
      .string()
      .trim()
      .regex(
        /^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/,
        'Use the full commit identity or leave it blank while planning.',
      ),
    summary: note,
    acceptanceCriteria: note,
    rollbackPlan: note,
    work: z
      .array(
        z
          .object({
            taskId: z.uuid(),
            revision: z.number().int().positive(),
            issueUrl: evidenceUrl,
            pullRequestUrl: evidenceUrl,
            blockedByTaskIds: z.array(z.uuid()).max(30),
          })
          .strict(),
      )
      .max(30),
    checks: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER']),
            label: z.string().trim().min(1).max(200),
            status: z.enum(['NOT_RUN', 'PASSED', 'FAILED']),
            evidenceUrl,
            note: z.string().trim().max(2000),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type ReleaseBody = z.infer<typeof releaseBodySchema>;
export type ReleaseTaskSnapshot = {
  taskId: string;
  revision: number;
  title: string;
  assigneeId: string | null;
  state: string;
  submissionVersion: number | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approved: boolean;
  sourceHash: string;
};
export type ReleaseSavedBody = ReleaseBody & {
  tasks: ReleaseTaskSnapshot[];
  sourceFingerprint: string;
};
export const RELEASE_STATES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'DEPLOYED',
  'HANDED_OVER',
  'ACCEPTED',
] as const;
export type ReleaseStatus = (typeof RELEASE_STATES)[number];
export const releaseProjectsSchema = z
  .object({
    afterId: z.uuid().nullish(),
    search: z.string().trim().max(200).nullish(),
  })
  .strict();
export const releaseListSchema = z
  .object({
    projectId: z.uuid(),
    afterId: z.uuid().nullish(),
    status: z.enum(RELEASE_STATES).nullish(),
  })
  .strict();
export const releaseSelectionSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive().nullish(),
    afterEventId: z.uuid().nullish(),
  })
  .strict();
export const releaseChoicesSchema = z
  .object({
    projectId: z.uuid(),
    afterTaskId: z.uuid().nullish(),
    search: z.string().trim().max(200).nullish(),
    selectedTaskIds: z
      .array(z.uuid())
      .max(30)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Select each task once.',
      )
      .nullish(),
  })
  .strict();
export const releaseSaveSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().nonnegative(),
    projectId: z.uuid(),
    projectRevision: z.number().int().positive(),
    expectedCompanyId: z.uuid().nullable(),
    body: releaseBodySchema,
  })
  .strict();
export const releaseDecisionSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    action: z.enum([
      'SUBMIT',
      'APPROVE',
      'REQUEST_CHANGES',
      'RECORD_DEPLOYMENT',
      'RECORD_DEPLOYMENT_FAILED',
      'RECORD_HANDOVER',
      'RECORD_ACCEPTANCE',
    ]),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    note,
    evidenceUrl,
    commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/),
    environment: z.string().trim().max(200),
  })
  .strict();
export const releaseReceiptSchema = z.object({ requestId: z.uuid() }).strict();
export type ReleaseSave = z.infer<typeof releaseSaveSchema>;
