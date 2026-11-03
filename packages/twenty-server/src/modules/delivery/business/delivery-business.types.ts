import { z } from 'zod';

const identifier = z.uuid();
const title = z.string().trim().min(1).max(240);
const text = z.string().trim().max(12000);
const money = z.number().int().min(0).max(100000000000);
const currency = z.enum([
  'USD',
  'AED',
  'EUR',
  'GBP',
  'INR',
  'SGD',
  'AUD',
  'CAD',
]);
export { currency as deliveryCurrencySchema, money as deliveryMoneySchema };
const url = z.url({ protocol: /^https?$/ }).max(2000);
const base = {
  id: identifier.optional(),
  revision: z.number().int().nonnegative(),
};
export const businessRecordSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('CONVERSATION'),
      projectId: identifier,
      title,
      channel: z.enum(['EMAIL', 'SLACK', 'WHATSAPP']),
      sourceUrl: url.nullable(),
      ownerId: identifier,
      private: z.boolean(),
      roleGrants: z
        .array(
          z
            .object({
              roleId: identifier,
              read: z.boolean(),
              send: z.boolean(),
            })
            .strict(),
        )
        .max(100)
        .optional(),
      grants: z
        .array(
          z
            .object({
              memberId: identifier,
              read: z.boolean(),
              send: z.boolean(),
            })
            .strict(),
        )
        .max(100),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('AD_REPORT'),
      projectId: identifier,
      title,
      date: z.iso.date(),
      channel: z.enum(['META', 'X', 'TIKTOK', 'CHATGPT']),
      currency,
      spend: money,
      attributedRevenue: money,
      shopifyRevenue: money.nullable(),
      purchases: z.number().int().nonnegative(),
      qualifiedLeads: z.number().int().nonnegative(),
      bookedCalls: z.number().int().nonnegative(),
      webinarRegistrations: z.number().int().nonnegative(),
      goal: z.enum(['PURCHASES', 'LEADS', 'CALLS', 'REGISTRATIONS']),
      targetCost: money,
      recommendation: text,
      sourceUrl: url,
      marketerId: identifier,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('BUDGET'),
      projectId: identifier,
      title,
      currency,
      amount: money,
      channel: z.enum(['META', 'X', 'TIKTOK', 'CHATGPT']),
      period: z.enum(['DAILY', 'MONTHLY', 'LIFETIME']),
      marketerId: identifier,
      reason: title,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('FINANCE'),
      projectId: identifier.nullable(),
      title,
      currency,
      amount: money,
      date: z.iso.date(),
      category: z.enum([
        'OPENING_BALANCE',
        'INCOME',
        'EXPENSE',
        'SALARY',
        'RECEIVABLE',
      ]),
      dueDate: z.iso.date().nullable(),
      externalReference: z.string().trim().max(240),
      evidenceUrl: url.nullable(),
      notes: text,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('CONTENT'),
      projectId: identifier,
      title,
      channel: z.enum(['X', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK']),
      account: title,
      ownerId: identifier,
      scheduledDate: z.iso.date(),
      copy: text,
      assetUrl: url.nullable(),
      notes: text,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('COMPETITOR'),
      projectId: identifier,
      title,
      channel: z.enum(['X', 'INSTAGRAM', 'META', 'TIKTOK', 'WEBSITE']),
      sourceUrl: url,
      observedDate: z.iso.date(),
      observation: title,
      interpretation: text,
      suggestedIdea: text,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('RELEASE'),
      projectId: identifier,
      title,
      ownerId: identifier,
      targetDate: z.iso.date(),
      repositoryUrl: url,
      notes: text,
      checks: z
        .array(
          z
            .object({ id: identifier, label: title, done: z.boolean() })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
]);
export type BusinessFields = z.infer<typeof businessRecordSchema>;
export type BusinessRecord = BusinessFields & {
  id: string;
  revision: number;
  clientEngagementId?: string;
  clientRequestId?: string;
  clientRequestRevision?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status:
    | 'POSTED'
    | 'OPEN'
    | 'DRAFT'
    | 'REVIEW'
    | 'APPROVED'
    | 'CHANGES_REQUESTED'
    | 'APPLIED'
    | 'VERIFIED'
    | 'PUBLISHED'
    | 'RELEASED'
    | 'PAID'
    | 'VOID';
  decisionBy: string | null;
  evidence: string | null;
  taskId: string | null;
  history: { at: string; actorId: string; action: string; note: string }[];
};
export type InboxEntry = {
  id: string;
  conversationId: string;
  authorId: string;
  createdAt: string;
  text: string;
  kind: 'INBOUND_NOTE' | 'DRAFT';
  sourceUrl: string | null;
  sourceIds: string[];
};
export type InboxAgentRun = {
  id: string;
  agentId: string;
  conversationId: string;
  memberId: string;
  createdAt: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
};
export type DeliveryBusiness = {
  agentRuns?: InboxAgentRun[];
  records: BusinessRecord[];
  inbox: InboxEntry[];
  seen: Record<string, Record<string, string>>;
};
export const newDeliveryBusiness = (): DeliveryBusiness => ({
  records: [],
  inbox: [],
  seen: {},
});
export const businessCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('aiDraft'),
      id: identifier,
      revision: z.number().int().positive(),
      agentId: identifier,
      sourceIds: z.array(identifier).min(1).max(20),
    })
    .strict(),
  z
    .object({ action: z.literal('save'), record: businessRecordSchema })
    .strict(),
  z
    .object({
      action: z.literal('transition'),
      id: identifier,
      revision: z.number().int().positive(),
      status: z.enum([
        'REVIEW',
        'APPROVED',
        'CHANGES_REQUESTED',
        'APPLIED',
        'VERIFIED',
        'PUBLISHED',
        'RELEASED',
        'PAID',
        'VOID',
      ]),
      note: title,
      evidence: url.nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('assign'),
      id: identifier,
      revision: z.number().int().positive(),
      assigneeId: identifier,
      reviewerId: identifier,
      dueDate: z.iso.date(),
    })
    .strict(),
  z
    .object({
      action: z.literal('inboxEntry'),
      id: identifier,
      revision: z.number().int().positive(),
      entryKind: z.enum(['INBOUND_NOTE', 'DRAFT']),
      text: title.max(12000),
      sourceUrl: url.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('seen'), id: identifier }).strict(),
]);
