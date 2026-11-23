import { z } from 'zod';

const identifier = z.uuid();
const text = z.string().trim().min(1).max(6000);
export const engagementSchema = z
  .object({
    id: identifier.optional(),
    revision: z.number().int().nonnegative(),
    projectId: identifier,
    name: text,
    services: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    advertising: z
      .object({
        managerId: identifier,
        marketerId: identifier,
        currency: z.enum([
          'INR',
          'USD',
          'QAR',
          'AED',
          'EUR',
          'GBP',
          'SGD',
          'AUD',
          'CAD',
        ]),
        channel: z.enum(['META', 'X', 'TIKTOK', 'CHATGPT']),
        period: z.enum(['DAILY', 'MONTHLY', 'LIFETIME']),
      })
      .strict()
      .nullable()
      .optional(),
    billing: z.enum(['ONE_TIME', 'RETAINER']),
    scope: text,
    allowance: z.string().trim().max(2000),
    contact: z.string().trim().max(500),
    fields: z
      .array(
        z
          .object({
            id: identifier,
            label: z.string().trim().min(1).max(200),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type ClientBrandAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
export type ClientEngagement = z.infer<typeof engagementSchema> & {
  id: string;
  companyId: string;
  assets: ClientBrandAsset[];
  revision: number;
  submissions: {
    id: string;
    at: string;
    formRevision: number;
    answers: { label: string; value: string }[];
    acceptedBy: string | null;
  }[];
};
export type ClientShare = {
  id: string;
  engagementId: string;
  taskId: string;
  version: number;
  kind: 'BRIEF' | 'SUBMISSION';
  title: string;
  content: string;
  links: string[];
  assetId: string | null;
  createdAt: string;
  sharedBy: string;
  withdrawnAt: string | null;
  reviews: {
    id: string;
    at: string;
    decision: 'COMMENT' | 'APPROVED' | 'CHANGES_REQUESTED';
    comment: string;
  }[];
};
export type DeliveryClients = {
  engagements: ClientEngagement[];
  shares: ClientShare[];
  links: {
    id: string;
    engagementId: string;
    hash: string;
    codeHash: string;
    expiresAt: string;
    revokedAt: string | null;
    createdBy: string;
  }[];
  audit: { at: string; actorId: string; action: string; targetId: string }[];
};
export const newDeliveryClients = (): DeliveryClients => ({
  engagements: [],
  shares: [],
  links: [],
  audit: [],
});
export const clientsCommandSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('engagement'), engagement: engagementSchema })
    .strict(),
  z.object({ action: z.literal('link'), engagementId: identifier }).strict(),
  z.object({ action: z.literal('revoke'), id: identifier }).strict(),
  z
    .object({
      action: z.literal('accept'),
      engagementId: identifier,
      submissionId: identifier,
    })
    .strict(),
  z
    .object({
      action: z.literal('share'),
      engagementId: identifier,
      taskId: identifier,
      revision: z.number().int().positive(),
      kind: z.enum(['BRIEF', 'SUBMISSION']),
    })
    .strict(),
  z.object({ action: z.literal('withdraw'), id: identifier }).strict(),
]);
export const clientResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('budget'),
      requestId: identifier,
      revision: z.number().int().positive(),
      amount: z.number().int().nonnegative().max(100000000000),
      reason: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      action: z.literal('onboard'),
      requestId: identifier,
      revision: z.number().int().positive(),
      answers: z.record(identifier, z.string().trim().max(6000)),
    })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      requestId: identifier,
      shareId: identifier,
      decision: z.enum(['COMMENT', 'APPROVED', 'CHANGES_REQUESTED']),
      comment: text,
    })
    .strict(),
]);
