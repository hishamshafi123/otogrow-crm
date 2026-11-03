import { z } from 'zod';
import {
  advertisingGoalSchema,
  type AdvertisingGoalSnapshot,
  type AdvertisingSourceSnapshot,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import { type DeliveryCreativeReviewTargetDTO } from 'src/modules/delivery/creative/review/delivery-creative-review.dto';

export type CreativeLearningComponent = {
  role: 'BASE' | 'HOOK' | 'CTA';
  assetId: string;
  name: string;
  briefVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  shotId: string | null;
  shotVersion: number | null;
};
export type CreativeSubmissionLearning = {
  version: 1;
  projectId: string;
  companyId: string | null;
  creativeVersion: number;
  finalAssetId: string;
  briefVersion: number;
  concept: string;
  angle: string;
  plannedHook: string;
  plannedCta: string;
  copyText: string | null;
  assemblyRunId: string | null;
  components: CreativeLearningComponent[];
};
export const creativeAdLinkStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'CHANGES_REQUESTED',
  'REVIEWED',
  'RETRACTED',
]);
export type CreativeAdLinkStatus = z.infer<typeof creativeAdLinkStatusSchema>;
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.uuid();
const source = {
  projectId: identifier,
  sourceId: identifier,
  adId: z.string().regex(/^\d{1,100}$/),
  taskId: identifier,
  submissionVersion: z.number().int().positive(),
  assetId: identifier,
  goal: advertisingGoalSchema,
  declaredComponents: z
    .array(
      z
        .object({ role: z.enum(['BASE', 'HOOK', 'CTA']), assetId: identifier })
        .strict(),
    )
    .max(3),
  declaredCopy: z.string().max(20000).nullable(),
  associationEvidence: z.string().trim().min(1).max(4000),
  evidenceUrl: z
    .string()
    .max(2000)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      } catch {
        return false;
      }
    }),
  note: z.string().trim().max(4000),
  correctsId: identifier.nullable().default(null),
};
export const creativeAdLinkPreviewSchema = z
  .object(source)
  .strict()
  .refine(
    (value) =>
      new Set(value.declaredComponents.map((component) => component.role))
        .size === value.declaredComponents.length &&
      new Set(value.declaredComponents.map((component) => component.assetId))
        .size === value.declaredComponents.length,
    'Use each component role and asset once.',
  );
export const creativeAdLinkSaveSchema = creativeAdLinkPreviewSchema.safeExtend({
  id: identifier,
  requestId: identifier,
  revision: z.number().int().nonnegative(),
  previewFingerprint: fingerprint,
});
export const creativeAdLinkDecisionSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    revision: z.number().int().positive(),
    action: z.enum(['SUBMIT', 'REVIEW', 'REQUEST_CHANGES', 'RETRACT']),
    previewFingerprint: fingerprint,
    note: z.string().trim().max(4000),
  })
  .strict();
export const creativeAdLinkSelectionSchema = z
  .object({
    id: identifier,
    version: z.number().int().positive().nullish(),
    afterEventId: identifier.nullish(),
  })
  .strict();
export const creativeAdLinkStateSchema = z.object({ id: identifier }).strict();
export const creativeAdLinksSchema = z
  .object({
    projectId: identifier,
    status: creativeAdLinkStatusSchema.nullish(),
    assetId: identifier.nullish(),
    afterId: identifier.nullish(),
    sourceId: identifier.nullish(),
    adId: z
      .string()
      .regex(/^\d{1,100}$/)
      .nullish(),
  })
  .strict()
  .refine((value) => Boolean(value.sourceId) === Boolean(value.adId));
export const creativeAdLinkChoicesSchema = z
  .object({
    sourceId: identifier,
    adId: z.string().regex(/^\d{1,100}$/),
    projectId: identifier,
    after: z.string().max(3000).nullish(),
    selectedTaskId: identifier.nullish(),
    selectedSubmissionVersion: z.number().int().positive().nullish(),
    selectedAssetId: identifier.nullish(),
  })
  .strict()
  .refine((value) => {
    const selectedCount = [
      value.selectedTaskId,
      value.selectedSubmissionVersion,
      value.selectedAssetId,
    ].filter((field) => field !== null && field !== undefined).length;
    return selectedCount === 0 || selectedCount === 3;
  });
export const creativeLearningReceiptSchema = z
  .object({ requestId: identifier })
  .strict();
export const creativeLessonSaveSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    projectId: identifier,
    linkIds: z.array(identifier).min(1).max(5),
    linkFingerprints: z.array(fingerprint).min(1).max(5),
    title: z.string().trim().min(1).max(200),
    assessment: z.enum(['PROMISING', 'NEEDS_ANOTHER_TEST', 'INCONCLUSIVE']),
    lesson: z.string().trim().min(1).max(6000),
    limitations: z.string().trim().min(1).max(4000),
    nextTest: z.string().trim().max(4000),
    correctsId: identifier.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.linkIds.length === value.linkFingerprints.length &&
      new Set(value.linkIds).size === value.linkIds.length,
  );
export const creativeLessonsSchema = z
  .object({
    projectId: identifier,
    afterId: identifier.nullish(),
    selectedId: identifier.nullish(),
  })
  .strict();
export type CreativeAdLinkPreview = z.infer<typeof creativeAdLinkPreviewSchema>;
export type CreativeAdLinkSave = z.infer<typeof creativeAdLinkSaveSchema>;
export type CreativeAdLinkDecision = z.infer<
  typeof creativeAdLinkDecisionSchema
>;
export type CreativeLessonSave = z.infer<typeof creativeLessonSaveSchema>;
export type CreativeAdLinkBody = CreativeAdLinkPreview & {
  source: AdvertisingSourceSnapshot;
  goalSnapshot: AdvertisingGoalSnapshot;
  adName: string;
  adSpendMicros: string | null;
  creativeTarget: DeliveryCreativeReviewTargetDTO;
  assetSha256: string;
  assetHashCapturedAt: string;
  submittedBy: string;
  submittedByName: string;
  approvedBy: string;
  approvedByName: string;
  approvedAt: string | null;
  submittedLearning: CreativeSubmissionLearning | null;
  components: (CreativeLearningComponent & {
    provenance: 'ASSEMBLY_RUN' | 'HUMAN_DECLARED';
  })[];
  copyText: string | null;
  copyProvenance: 'SUBMITTED_COPY' | 'HUMAN_DECLARED' | 'UNKNOWN';
  warnings: string[];
  previewFingerprint: string;
};
export type CreativeLessonBody = Omit<
  CreativeLessonSave,
  'id' | 'requestId' | 'projectId' | 'linkFingerprints'
> & {
  evidence: {
    linkId: string;
    version: number;
    fingerprint: string;
    body: CreativeAdLinkBody;
  }[];
};
