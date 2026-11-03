import { type MetaConnection } from 'src/modules/delivery/advertising/delivery-meta.types';
import { type DeliveryReadinessItemDTO } from 'src/modules/delivery/readiness/delivery-readiness.dto';

export const metaReadiness = (
  connection: MetaConnection,
  mappingValid: boolean,
  workerSeenAt: string | null,
  now: Date,
  ownerValid = true,
): DeliveryReadinessItemDTO => {
  const item: DeliveryReadinessItemDTO = {
    id: `META:${connection.accountId}`,
    capability: 'META',
    accountName: connection.name,
    status: 'CONNECTED',
    reason: 'META_OBSERVED',
    destination: 'ads',
    lastSuccessAt: connection.lastSuccessAt,
  };
  if (connection.error)
    return { ...item, status: 'NEEDS_ATTENTION', reason: 'META_IMPORT_ERROR' };
  if (!ownerValid)
    return { ...item, status: 'NEEDS_ATTENTION', reason: 'META_OWNER' };
  if (!connection.enabled)
    return { ...item, status: 'PAUSED', reason: 'META_PAUSED' };
  if (!mappingValid)
    return { ...item, status: 'NEEDS_ATTENTION', reason: 'META_MAPPING' };
  if (!connection.lastSuccessAt)
    return { ...item, status: 'NEEDS_SETUP', reason: 'META_UNVERIFIED' };
  const workerAge = workerSeenAt
    ? now.getTime() - Date.parse(workerSeenAt)
    : NaN;
  if (!Number.isFinite(workerAge) || workerAge < -60000 || workerAge > 180000)
    return { ...item, status: 'NEEDS_ATTENTION', reason: 'META_WORKER_STALE' };
  const importAge = now.getTime() - Date.parse(connection.lastSuccessAt);
  if (
    !Number.isFinite(importAge) ||
    importAge < -60000 ||
    importAge > 36 * 3600000
  )
    return { ...item, status: 'NEEDS_ATTENTION', reason: 'META_IMPORT_STALE' };
  return item;
};

export const manualReadiness = (): DeliveryReadinessItemDTO[] =>
  [
    ['EMAIL_OS', 'AVAILABLE', 'EMAIL_SELECTED_THREADS', 'inbox'],
    ['SLACK_OS', 'NOT_IMPLEMENTED', 'SLACK_BRIDGE', 'inbox'],
    ['WHATSAPP_OS', 'NOT_IMPLEMENTED', 'WHATSAPP_BRIDGE', 'inbox'],
    ['SHOPIFY', 'NOT_IMPLEMENTED', 'SHOPIFY_IMPORT', 'ads'],
    ['OTHER_AD_CHANNELS', 'NOT_IMPLEMENTED', 'OTHER_AD_IMPORT', 'ads'],
    ['SOCIAL_PUBLISHING', 'MANUAL', 'SOCIAL_MANUAL', 'content'],
    ['COMPETITOR_COLLECTION', 'MANUAL', 'COMPETITOR_MANUAL', 'competitors'],
    ['ACCOUNTING', 'MANUAL', 'ACCOUNTING_EXPORT', 'finance'],
    ['MEETING_IMPORT', 'AVAILABLE', 'MEETING_REVIEWED_IMPORT', 'knowledge'],
    ['BRAND_KNOWLEDGE', 'AVAILABLE', 'KNOWLEDGE_REVIEWED', 'knowledge'],
    ['TASK_ASSISTANTS', 'AVAILABLE', 'ASSISTANTS_BOUNDED', 'agents'],
    ['DYNAMIC_AGENTS', 'NOT_IMPLEMENTED', 'AGENT_TOOLS_MISSING', 'agents'],
    ['CREATIVE_PRODUCTION', 'AVAILABLE', 'CREATIVE_CHECKS', 'creative'],
    ['SEO_RESULTS', 'MANUAL', 'SEO_MANUAL', 'seo'],
    ['DEVELOPMENT_SYNC', 'MANUAL', 'DEVELOPMENT_MANUAL', 'development'],
  ].map(([capability, status, reason, destination]) => ({
    id: capability,
    capability,
    accountName: null,
    status: status as DeliveryReadinessItemDTO['status'],
    reason,
    destination,
    lastSuccessAt: null,
  }));
