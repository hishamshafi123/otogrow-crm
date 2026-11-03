import { z } from 'zod';
import {
  advertisingGoalSchema,
  advertisingSourceKindSchema,
  type AdvertisingGoalSnapshot,
  type AdvertisingMetric,
  type AdvertisingSourceSnapshot,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import { type DeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';

export const ADVERTISING_DRAFT_PROMPT_VERSION = 'account-recommendations-1';
export const ADVERTISING_DRAFT_OUTPUT_VERSION = 'recommendations-1';
export const ADVERTISING_DRAFT_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const page = {
  after: z.string().min(1).max(2000).nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullish()
    .transform((value) => value ?? 25),
};
export const advertisingDraftPreviewSchema = z
  .object({
    sourceKind: advertisingSourceKindSchema,
    sourceId: z.uuid(),
    sourceFingerprint: fingerprint,
    agentId: z.uuid(),
    goal: advertisingGoalSchema.refine((goal) => goal.metricAdId === null, {
      message: 'Advertising drafting currently supports account totals only.',
    }),
    instructions: z.string().trim().max(4000),
  })
  .strict();
export const startAdvertisingDraftSchema = advertisingDraftPreviewSchema
  .extend({
    id: z.uuid(),
    requestId: z.uuid(),
    bodyFingerprint: fingerprint,
    contextFingerprint: fingerprint,
    agentVersion: z.number().int().positive(),
    knowledgeFingerprint: z.string().regex(/^[a-f0-9]{32}$/),
    pricingRevision: z.number().int().positive(),
  })
  .strict();
export const cancelAdvertisingDraftSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export const advertisingDraftSelectionSchema = z
  .object({ id: z.uuid() })
  .strict();
export const advertisingDraftRequestSchema = z
  .object({
    requestId: z.uuid(),
    action: z.enum(['STARTED', 'CANCELLED']),
  })
  .strict();
export const advertisingDraftRunsSchema = z
  .object({
    sourceKind: advertisingSourceKindSchema,
    sourceId: z.uuid(),
    ...page,
  })
  .strict();
const citations = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(12)
  .refine((items) => new Set(items).size === items.length);
export const advertisingDraftOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(3000),
    limitations: z.array(z.string().trim().min(1).max(1000)).min(1).max(12),
    citations,
    noChangeReason: z.string().trim().min(1).max(3000).nullable(),
    suggestions: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            rationale: z.string().trim().min(1).max(3000),
            expectedResult: z.string().trim().min(1).max(3000),
            evidence: z.string().trim().min(1).max(3000),
            citations,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type AdvertisingDraftPreviewInput = z.infer<
  typeof advertisingDraftPreviewSchema
>;
export type StartAdvertisingDraftInput = z.infer<
  typeof startAdvertisingDraftSchema
>;
export type AdvertisingDraftStatus =
  (typeof ADVERTISING_DRAFT_STATUSES)[number];
export type AdvertisingDraftReference = {
  id: string;
  kind: 'REPORT_METRIC' | 'REPORT_SCOPE' | 'KNOWLEDGE' | 'HUMAN_GOAL';
  label: string;
  sourceId: string;
  version: number | null;
  value: string | null;
  unit: string | null;
  href: string | null;
};
export type AdvertisingDraftAgent = {
  id: string;
  name: string;
  version: number;
  modelId: string;
  maxOutputTokens: number;
};
export type AdvertisingDraftContext = {
  source: AdvertisingSourceSnapshot;
  goal: AdvertisingGoalSnapshot;
  metrics: AdvertisingMetric[];
  knowledge: DeliveryKnowledgeContext;
  references: AdvertisingDraftReference[];
  instructions: string;
  assistantInstructions: string;
  coverage: 'ACCOUNT_TOTALS_ONLY';
  limitations: string[];
  promptVersion: string;
  outputVersion: string;
};
export type AdvertisingDraftSuggestion = z.infer<
  typeof advertisingDraftOutputSchema
>['suggestions'][number] & { id: string };
export type AdvertisingDraftResult = Omit<
  z.infer<typeof advertisingDraftOutputSchema>,
  'suggestions'
> & {
  suggestions: AdvertisingDraftSuggestion[];
};
export type AdvertisingDraftReceipt = {
  action: 'STARTED' | 'CANCELLED';
  requestId: string;
  runId: string;
  actorId: string;
  userWorkspaceId: string;
  inputHash: string;
  bodyFingerprint: string;
  createdAt: string;
  revision: number;
  status: AdvertisingDraftStatus;
};
export type AdvertisingDraftBasis = {
  sourceFingerprint: string;
  evidenceFingerprint: string;
  goalFingerprint: string;
  knowledgeFingerprint: string;
  promptVersion: string;
  outputVersion: string;
};
