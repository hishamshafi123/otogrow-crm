import { z } from 'zod';
import { type CreativeBrief } from 'src/modules/delivery/creative/delivery-creative.types';

export const VIDEO_QA_MODEL = 'google/gemini-3.5-flash-lite';
export const VIDEO_QA_MAX_OUTPUT_TOKENS = 8192;
export const VIDEO_QA_MAX_DURATION_MS = 120000;
export const VIDEO_QA_MAX_SOURCE_BYTES = 100 * 1024 * 1024;
export const VIDEO_QA_MAX_REQUEST_BYTES = 19000000;
export const VIDEO_QA_MAX_PROXY_BYTES = 11000000;
export const VIDEO_QA_MAX_FRAME_BYTES = 150000;
export const VIDEO_QA_PIPELINE_VERSION = 1;
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const videoQaPreviewSchema = z
  .object({
    taskId: z.uuid(),
    revision: z.number().int().positive(),
    assetId: z.uuid(),
    referenceAssetIds: z.array(z.uuid()).max(3),
    modelId: z.literal(VIDEO_QA_MODEL),
    manualTranscript: z
      .string()
      .max(12000)
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.referenceAssetIds).size === input.referenceAssetIds.length,
  );
export const videoQaStartSchema = videoQaPreviewSchema.safeExtend({
  requestId: z.uuid(),
  sourceFingerprint: fingerprint,
  preparationFingerprint: fingerprint,
  pricingRevision: z.number().int().positive(),
  confirm: z.literal(true),
});
export const videoQaSelectionSchema = z
  .object({ taskId: z.uuid(), runId: z.uuid() })
  .strict();
export const videoQaReceiptSchema = z
  .object({ taskId: z.uuid(), requestId: z.uuid() })
  .strict();
export const videoQaCancelSchema = videoQaSelectionSchema.extend({
  requestId: z.uuid(),
});
const time = z.number().int().min(0).max(VIDEO_QA_MAX_DURATION_MS);
export const videoQaOutputSchema = z
  .object({
    summary: z.string().min(1).max(3000),
    transcript: z
      .array(
        z
          .object({
            startMs: time,
            endMs: time,
            text: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .max(80),
    visibleText: z
      .array(
        z
          .object({
            startMs: time,
            endMs: time,
            text: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(40),
    findings: z
      .array(
        z
          .object({
            category: z.enum([
              'VISUAL',
              'CONTINUITY',
              'PRODUCT',
              'TEXT',
              'AUDIO',
              'COPY',
            ]),
            severity: z.enum(['REVIEW', 'POSSIBLE_ISSUE']),
            startMs: time,
            endMs: time,
            frameIndexes: z.array(z.number().int().min(0).max(119)).max(4),
            referenceAssetIds: z.array(z.uuid()).max(3),
            evidence: z.string().min(1).max(1200),
            correction: z.string().max(1200),
            uncertainty: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(20),
    limitations: z.string().min(1).max(3000),
  })
  .strict();
export type VideoQaOutput = z.infer<typeof videoQaOutputSchema>;
export type VideoQaPreviewInput = z.infer<typeof videoQaPreviewSchema>;
export type VideoQaStartInput = z.infer<typeof videoQaStartSchema>;
export type VideoQaAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  briefVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  shotId: string | null;
  shotVersion: number | null;
};
export type VideoQaTechnicalFinding = {
  code:
    | 'BLACK_INTERVAL'
    | 'FROZEN_INTERVAL'
    | 'SILENT_INTERVAL'
    | 'NO_AUDIO'
    | 'PEAK_LEVEL';
  startMs: number;
  endMs: number;
  evidence: string;
};
export type VideoQaFrame = {
  index: number;
  atMs: number;
  sha256: string;
  size: number;
};
export type VideoQaPreparation = {
  pipelineVersion: number;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  audioChannels: number | null;
  proxySha256: string;
  proxyBytes: number;
  frames: VideoQaFrame[];
  technicalFindings: VideoQaTechnicalFinding[];
  samplingIntervalMs: number;
  limitations: string[];
};
export type VideoQaInputSnapshot = {
  pipelineVersion: number;
  projectId: string;
  companyId: string | null;
  taskId: string;
  creativeVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  briefVersion: number;
  settingsVersion: number;
  assigneeId: string | null;
  brief: CreativeBrief;
  asset: VideoQaAsset;
  references: VideoQaAsset[];
  modelId: string;
  manualTranscript: string | null;
  sourceFingerprint: string;
  preparationFingerprint: string;
  preparation: VideoQaPreparation;
};
export type VideoQaCancellation = {
  requestId: string;
  inputHash: string;
  actorId: string;
  userWorkspaceId: string;
  at: string;
};
