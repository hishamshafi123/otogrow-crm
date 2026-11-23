import { z } from 'zod';
import { type DeliveryCommitmentOrphanCleanupInput } from '~/generated-metadata/graphql';

const cleanupRecoverySchema = z
  .object({
    owner: z
      .object({
        workspaceId: z.string(),
        memberId: z.string(),
        userWorkspaceId: z.string(),
      })
      .strict(),
    input: z
      .object({
        requestId: z.uuid(),
        engagementId: z.uuid(),
        periodId: z.uuid(),
        periodRevision: z.number().int().nonnegative(),
        allocationId: z.uuid(),
        allocationRevision: z.number().int().nonnegative(),
        confirm: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type OrphanCleanupOwner = z.infer<typeof cleanupRecoverySchema>['owner'];
export type OrphanCleanupRecovery = {
  owner: OrphanCleanupOwner;
  input: DeliveryCommitmentOrphanCleanupInput;
};
export const orphanCleanupStorageKey = (
  identity: string | null,
  engagementId: string,
) => `delivery-orphan-cleanup:${identity ?? ''}:${engagementId}`;
export const readOrphanCleanupRecovery = (
  key: string,
): OrphanCleanupRecovery | null => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const result = cleanupRecoverySchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
export const saveOrphanCleanupRecovery = (
  key: string,
  recovery: OrphanCleanupRecovery,
) => {
  try {
    const body = JSON.stringify(recovery);
    sessionStorage.setItem(key, body);
    return sessionStorage.getItem(key) === body;
  } catch {
    return false;
  }
};
export const clearOrphanCleanupRecovery = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {}
};
