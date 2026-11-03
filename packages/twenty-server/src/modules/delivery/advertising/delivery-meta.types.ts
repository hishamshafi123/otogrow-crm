import { z } from 'zod';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
export const metaConfigurationSchema = z
  .object({
    accountId: z.string().regex(/^\d{5,30}$/),
    token: z.string().trim().min(20).max(4096).optional(),
    revision: z.number().int().nonnegative(),
    engagementId: z.uuid().nullable().optional(),
    scheduleTimezone: z.literal('Asia/Qatar').nullable().optional(),
    projectId: z.uuid().nullable(),
    managerId: z.uuid().nullable(),
    marketerId: z.uuid().nullable(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    enabled: z.boolean(),
    catchUpDays: z.number().int().min(1).max(90).optional(),
    refreshDays: z.number().int().min(0).max(30).optional(),
    dailyImportLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (configuration) =>
      (configuration.refreshDays ?? 7) <= (configuration.catchUpDays ?? 14),
    { message: 'Refresh days cannot exceed catch-up days.' },
  );
export type MetaInsightRow = {
  reportedFields?: {
    spend: boolean;
    impressions: boolean;
    clicks: boolean;
    actions: boolean;
    action_values: boolean;
  };
  date_start: string;
  date_stop: string;
  account_id: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions: { action_type: string; value: string }[];
  action_values: { action_type: string; value: string }[];
};
export type MetaConnection = Omit<
  z.infer<typeof metaConfigurationSchema>,
  'token'
> & {
  ciphertext: EncryptedString;
  name: string;
  currency: string;
  timezone: string;
  ownerId: string;
  userWorkspaceId: string;
  lastSuccessAt: string | null;
  lastDate: string | null;
  error: string | null;
  retryAt: string | null;
  lease: { id: string; until: string } | null;
  checks?: { date: string; reportId: string; checkedAt: string }[];
};
export type MetaReport = {
  engagementId?: string | null;
  id: string;
  accountId: string;
  projectId: string | null;
  managerId: string | null;
  marketerId: string | null;
  date: string;
  currency: string;
  timezone: string;
  fetchedAt: string;
  account: MetaInsightRow | null;
  ads: MetaInsightRow[];
  status: 'REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string;
  taskId: string | null;
};
export type MetaReporting = {
  connections: MetaConnection[];
  reports: MetaReport[];
  workerSeenAt: string | null;
  attempts?: {
    accountId: string;
    date: string;
    count: number;
    retryAt?: string;
  }[];
};
export const newMetaReporting = (): MetaReporting => ({
  connections: [],
  reports: [],
  workerSeenAt: null,
});
export const metaCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('archive'),
      id: z.uuid(),
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('connect'),
      configuration: metaConfigurationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('sync'),
      accountId: z.string().regex(/^\d{5,30}$/),
      date: z.iso.date().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('disconnect'),
      accountId: z.string().regex(/^\d{5,30}$/),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      expectedRouting: z
        .object({
          projectId: z.uuid().nullable(),
          managerId: z.uuid().nullable(),
          marketerId: z.uuid().nullable(),
        })
        .strict()
        .optional(),
      id: z.uuid(),
      status: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
