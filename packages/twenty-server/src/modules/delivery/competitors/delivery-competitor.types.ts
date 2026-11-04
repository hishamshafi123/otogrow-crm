import { z } from 'zod';

export const COMPETITOR_PLATFORMS = [
  'X',
  'INSTAGRAM',
  'META_AD_LIBRARY',
  'MANUAL',
] as const;
export type CompetitorPlatform = (typeof COMPETITOR_PLATFORMS)[number];
export const competitorExternalIdSchema = z.string().regex(/^\d{1,100}$/);
export const competitorMoneySchema = z.string().regex(/^(0|[1-9]\d{0,15})$/);
export const competitorSourceBodySchema = z.strictObject({
  projectId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  platform: z.enum(COMPETITOR_PLATFORMS),
  accountReference: z.string().trim().min(1).max(2000),
  ownerId: z.uuid(),
  reviewerId: z.uuid(),
  cadenceHours: z.number().int().min(1).max(720),
  lookbackDays: z.number().int().min(1).max(90),
  purpose: z.string().trim().min(1).max(2000),
});
export type CompetitorSourceBody = z.infer<typeof competitorSourceBodySchema>;
export const COMPETITOR_SOURCE_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
] as const;
export type CompetitorSourceStatus =
  (typeof COMPETITOR_SOURCE_STATUSES)[number];
export type CompetitorSavedSourceBody = CompetitorSourceBody & {
  canonicalReference: string;
  canonicalKey: string;
  ownerName: string;
  reviewerName: string;
};
const competitorSourceCommand = {
  id: z.uuid(),
  requestId: z.uuid(),
  revision: z.number().int().nonnegative(),
  projectId: z.uuid(),
  projectRevision: z.number().int().positive(),
  expectedCompanyId: z.uuid().nullable(),
};
export const competitorSourceSaveSchema = z.strictObject({
  ...competitorSourceCommand,
  body: competitorSourceBodySchema,
});
export const competitorSourceChangeSchema = z.strictObject({
  ...competitorSourceCommand,
  action: z.enum(['PAUSE', 'RESTORE', 'ARCHIVE']),
  note: z.string().trim().max(2000),
});
const competitorAfter = z.string().min(1).max(4000).nullish();
export const competitorProjectsSchema = z.strictObject({
  search: z.string().trim().max(160).nullish(),
  after: competitorAfter,
});
export const competitorSourcesSchema = z.strictObject({
  projectId: z.uuid(),
  status: z.enum(COMPETITOR_SOURCE_STATUSES).nullish(),
  after: competitorAfter,
});
export const competitorSourceChoicesSchema = z.strictObject({
  projectId: z.uuid(),
});
export const competitorSourceSelectionSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive().nullish(),
  after: competitorAfter,
});
export const competitorSourceReceiptSchema = z.strictObject({
  requestId: z.uuid(),
  sourceId: z.uuid(),
  projectId: z.uuid(),
});
export type CompetitorSourceSave = z.infer<typeof competitorSourceSaveSchema>;
export type CompetitorSourceChange = z.infer<
  typeof competitorSourceChangeSchema
>;
export type CompetitorSourceAction = 'SAVE' | CompetitorSourceChange['action'];
export type CompetitorObservation = {
  platform: CompetitorPlatform;
  accountId: string;
  externalId: string;
  versionExternalId: string;
  permalink: string;
  publishedAt: string;
  capturedAt: string;
  text: string;
};
export type CompetitorDataTariff = {
  postReadMicros: string;
  userReadMicros: string;
};
export type CompetitorPage = {
  observations: CompetitorObservation[];
  nextToken: string | null;
  coverage: 'COMPLETE_PAGE' | 'PARTIAL_PAGE';
};
export const competitorXPageInputSchema = z.strictObject({
  accountId: z.string().regex(/^\d{1,19}$/),
  limit: z.number().int().min(5).max(100),
  sinceId: z
    .string()
    .regex(/^\d{1,19}$/)
    .nullable(),
  untilId: z
    .string()
    .regex(/^\d{1,19}$/)
    .nullable(),
  nextToken: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,2048}$/)
    .nullable(),
});
export type CompetitorXPageInput = z.infer<typeof competitorXPageInputSchema>;
