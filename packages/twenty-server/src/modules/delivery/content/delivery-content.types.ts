import { z } from 'zod';

export const CONTENT_PLATFORMS = [
  'X',
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
] as const;
export const CONTENT_STATES = [
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
  'PUBLISHED',
  'CANCELLED',
] as const;
export type ContentStatus = (typeof CONTENT_STATES)[number];
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
const identifier = z.uuid();
const text = z.string().trim().max(6000);
const title = z.string().trim().min(1).max(200);
export const contentUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
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
  }, 'Use a public HTTPS link without credentials or access tokens.');
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
  }, 'Choose a valid time zone.');
const command = {
  id: identifier,
  requestId: identifier,
  revision: z.number().int().nonnegative(),
};
const project = {
  projectId: identifier,
  projectRevision: z.number().int().positive(),
  expectedCompanyId: identifier.nullable(),
};
export const contentProjectsSchema = z
  .object({
    afterId: identifier.nullish(),
    search: z.string().trim().max(200).nullish(),
  })
  .strict();
export const contentProjectSchema = z
  .object({ projectId: identifier })
  .strict();
export const contentProjectChoicesSchema = contentProjectSchema.extend({
  afterAccountId: identifier.nullish(),
  afterMemberId: identifier.nullish(),
  afterEngagementId: identifier.nullish(),
  search: z.string().trim().max(200).nullish(),
  selectedAccountIds: z.array(identifier).max(5).nullish(),
  selectedMemberIds: z.array(identifier).max(5).nullish(),
  selectedEngagementIds: z.array(identifier).max(5).nullish(),
});
export const contentAccountSchema = z
  .object({
    ...command,
    ...project,
    platform: z.enum(CONTENT_PLATFORMS),
    name: title,
    profileUrl: contentUrl,
    handle: title,
    archived: z.boolean(),
  })
  .strict();
export const contentPlanSchema = z
  .object({
    ...command,
    ...project,
    title,
    purpose: text,
    engagementId: identifier.nullable(),
    service: z.string().trim().max(100).nullable(),
  })
  .strict();
export const contentAssetSchema = z
  .object({
    taskId: identifier,
    submissionVersion: z.number().int().positive(),
    assetId: identifier,
  })
  .strict();
export type ContentAssetSelection = z.infer<typeof contentAssetSchema>;
export const contentBodySchema = z
  .object({
    accountId: identifier,
    accountRevision: z.number().int().positive(),
    ownerId: identifier,
    reviewerId: identifier,
    format: z.enum(['TEXT', 'IMAGE', 'VIDEO']),
    caption: text,
    plannedAt: z.iso.datetime({ offset: true }),
    timezone,
    plannedLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    asset: contentAssetSchema.nullable(),
    notes: text,
  })
  .strict();
export type ContentBody = z.infer<typeof contentBodySchema>;
export const contentSaveSchema = z
  .object({
    ...command,
    planId: identifier,
    planRevision: z.number().int().positive(),
    body: contentBodySchema,
    expectedSourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
export const CONTENT_ACTIONS = [
  'SUBMIT',
  'APPROVE',
  'REQUEST_CHANGES',
  'RECORD_PUBLICATION',
  'RECORD_FAILED',
  'RECORD_UNCERTAIN',
  'CORRECT_PUBLICATION',
  'CANCEL',
] as const;
export const contentDecisionSchema = z
  .object({
    ...command,
    action: z.enum(CONTENT_ACTIONS),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    note: text,
    evidenceUrl: z.union([z.literal(''), contentUrl]),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    correctsEventId: identifier.nullable(),
  })
  .strict();
export const contentListSchema = z
  .object({
    projectId: identifier,
    planId: identifier.nullish(),
    afterId: identifier.nullish(),
    ownerId: identifier.nullish(),
    accountId: identifier.nullish(),
    search: z.string().trim().max(200).nullish(),
    status: z.enum(CONTENT_STATES).nullish(),
    from: z.iso.datetime({ offset: true }).nullish(),
    to: z.iso.datetime({ offset: true }).nullish(),
  })
  .strict();
export const contentCalendarSchema = contentListSchema
  .omit({ afterId: true })
  .extend({
    timezone,
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  });
export const contentPlansSchema = z
  .object({
    projectId: identifier,
    afterId: identifier.nullish(),
    planId: identifier.nullish(),
  })
  .strict();
export const contentSelectionSchema = z
  .object({
    id: identifier,
    version: z.number().int().positive().nullish(),
    afterEventId: identifier.nullish(),
  })
  .strict();
export const contentChoicesSchema = z
  .object({
    projectId: identifier,
    afterTaskId: identifier.nullish(),
    search: z.string().trim().max(200).nullish(),
  })
  .strict();
export const contentReceiptSchema = z
  .object({ requestId: identifier })
  .strict();
export type ContentAccountSave = z.infer<typeof contentAccountSchema>;
export type ContentPlanSave = z.infer<typeof contentPlanSchema>;
export type ContentSave = z.infer<typeof contentSaveSchema>;
export type ContentDecision = z.infer<typeof contentDecisionSchema>;
export type ContentAssetSnapshot = ContentAssetSelection & {
  title: string;
  name: string;
  mimeType: string;
  creativeVersion: number;
  reviewedBy: string;
  reviewedAt: string;
  sourceHash: string;
};
export type ContentSavedBody = ContentBody & {
  account: {
    id: string;
    projectId: string;
    companyId: string | null;
    revision: number;
    name: string;
    handle: string;
    profileUrl: string;
    platform: ContentPlatform;
    archived: boolean;
  };
  assetSnapshot: ContentAssetSnapshot | null;
  ownerName: string;
  reviewerName: string;
  contributorIds: string[];
  sourceFingerprint: string;
};
