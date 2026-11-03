import { z } from 'zod';
import { type ActivityCurrentWorkSnapshot } from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.types';
import { type OtogrowActivityEventDTO } from 'src/modules/otogrow-activity/otogrow-activity.dto';
import {
  OTOGROW_ACTIVITY_CATEGORIES,
  OTOGROW_ACTIVITY_OUTCOMES,
} from 'src/modules/otogrow-activity/otogrow-activity.types';

export const ACTIVITY_ANALYSIS_PROMPT_VERSION = 'recorded-activity-1';
export const ACTIVITY_ANALYSIS_OUTPUT_VERSION = 'evidence-analysis-1';
export const ACTIVITY_CURRENT_WORK_PROMPT_VERSION = 'activity-current-work-1';
export const ACTIVITY_CURRENT_WORK_OUTPUT_VERSION = 'evidence-analysis-2';
export const ACTIVITY_ANALYSIS_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export const activityFiltersSchema = z
  .object({
    personId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    projectId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    clientId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    category: z
      .enum(OTOGROW_ACTIVITY_CATEGORIES)
      .nullish()
      .transform((value) => value ?? null),
    action: z
      .string()
      .regex(/^[A-Z][A-Z_]{0,79}$/)
      .nullish()
      .transform((value) => value ?? null),
    outcome: z
      .enum(OTOGROW_ACTIVITY_OUTCOMES)
      .nullish()
      .transform((value) => value ?? null),
    from: z
      .string()
      .datetime()
      .nullish()
      .transform((value) => value ?? null),
    through: z
      .string()
      .datetime()
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();
export const activityPageFields = {
  after: z.string().min(1).max(2000).nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((value) => value ?? 25),
};
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const activityAnalysisPreviewSchema = z
  .object({
    filters: activityFiltersSchema.refine(
      (value) => !!value.from && !!value.through,
      'Choose an explicit UTC date range.',
    ),
    question: z.string().trim().min(1).max(4000),
    agentId: z.uuid(),
    includeCurrentWork: z
      .boolean()
      .optional()
      .transform((value) => (value === true ? true : undefined)),
  })
  .strict();
export const startActivityAnalysisSchema = activityAnalysisPreviewSchema
  .extend({
    id: z.uuid(),
    requestId: z.uuid(),
    bodyFingerprint: fingerprint,
    contextFingerprint: fingerprint,
    evidenceFingerprint: fingerprint,
    capturedAt: z
      .string()
      .datetime()
      .regex(/\.\d{6}Z$/),
    agentVersion: z.number().int().positive(),
    pricingRevision: z.number().int().positive(),
  })
  .strict();
export const cancelActivityAnalysisSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export const activityAnalysisSelectionSchema = z
  .object({ id: z.uuid() })
  .strict();
export const activityAnalysisRequestSchema = z
  .object({ requestId: z.uuid(), action: z.enum(['STARTED', 'CANCELLED']) })
  .strict();
export const activityAnalysisRunsSchema = z.object(activityPageFields).strict();
export const activityAnalysisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(3000),
    summaryCitationIds: z.array(z.string().min(1).max(100)).min(1).max(12),
    findings: z
      .array(
        z
          .object({
            kind: z.enum(['RECORDED', 'POSSIBLE_BOTTLENECK']),
            text: z.string().trim().min(1).max(2000),
            citationIds: z
              .array(z.string().min(1).max(100))
              .min(1)
              .max(12)
              .refine((values) => new Set(values).size === values.length),
          })
          .strict(),
      )
      .max(8),
    unknowns: z.array(z.string().trim().min(1).max(1000)).max(12),
    limitations: z.array(z.string().trim().min(1).max(1000)).min(1).max(12),
  })
  .strict();
export const activityCurrentWorkOutputSchema =
  activityAnalysisOutputSchema.extend({
    findings: z
      .array(
        activityAnalysisOutputSchema.shape.findings.element.extend({
          kind: z.enum(['RECORDED', 'CURRENT_STATE', 'POSSIBLE_BOTTLENECK']),
        }),
      )
      .max(8),
  });
export type ActivityFilters = z.infer<typeof activityFiltersSchema>;
export type ActivityAnalysisPreviewInput = z.infer<
  typeof activityAnalysisPreviewSchema
>;
export type StartActivityAnalysisInput = z.infer<
  typeof startActivityAnalysisSchema
>;
export type ActivityAnalysisStatus =
  (typeof ACTIVITY_ANALYSIS_STATUSES)[number];
export type ActivityAnalysisAgent = {
  id: string;
  name: string;
  version: number;
  modelId: string;
  maxOutputTokens: number;
};
type ActivityAnalysisCitationBase = {
  id: string;
  label: string;
  href: string;
};
export type ActivityAnalysisCitation = ActivityAnalysisCitationBase &
  (
    | {
        kind: 'EVENT';
        eventId: string;
        occurredAt: string;
        taskId?: null;
        capturedAt?: null;
      }
    | {
        kind: 'CURRENT_TASK';
        eventId?: null;
        occurredAt?: null;
        taskId: string;
        capturedAt: string;
      }
  );
export type ActivityAnalysisContext = {
  capturedAt: string;
  from: string;
  through: string;
  filters: ActivityFilters;
  coverageStartedAt: string | null;
  totalCount: number;
  includedCount: number;
  omittedCount: number;
  truncatedFieldCount: number;
  omittedBytes: number;
  containsFinance: boolean;
  events: OtogrowActivityEventDTO[];
  citations: ActivityAnalysisCitation[];
  limitations: string[];
  question: string;
  assistantInstructions: string;
  promptVersion: string;
  outputContractVersion: string;
  currentWork?: ActivityCurrentWorkSnapshot;
};
export type ActivityAnalysisResult = Omit<
  z.infer<typeof activityCurrentWorkOutputSchema>,
  'findings'
> & {
  findings: (z.infer<
    typeof activityCurrentWorkOutputSchema
  >['findings'][number] & { id: string })[];
};
export type ActivityAnalysisReceipt = {
  action: 'STARTED' | 'CANCELLED';
  requestId: string;
  runId: string;
  actorId: string;
  userWorkspaceId: string;
  inputHash: string;
  bodyFingerprint: string;
  createdAt: string;
  revision: number;
  status: ActivityAnalysisStatus;
};
export type ActivityAnalysisBasis = {
  evidenceFingerprint: string;
  containsFinance: boolean;
  includedCount: number;
  omittedCount: number;
  promptVersion: string;
  outputContractVersion: string;
  currentWork?: {
    nativeVisibilityFingerprint: string;
    taskIds: string[];
  };
};
