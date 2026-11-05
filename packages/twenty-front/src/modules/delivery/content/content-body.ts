import {
  type ContentBody,
  type ContentSavedBody,
} from '@/delivery/content/content.types';
import { contentPlannedInstant } from '@/delivery/content/content-dates';

export const newContentBody = (ownerId: string): ContentBody => ({
  accountId: '',
  accountRevision: 0,
  ownerId,
  reviewerId: '',
  format: 'TEXT',
  caption: '',
  plannedAt: '',
  plannedLocal: '',
  timezone: 'UTC',
  asset: null,
  notes: '',
});
export const canonicalContentBody = (
  body: ContentBody | ContentSavedBody,
): ContentBody => ({
  accountId: body.accountId,
  accountRevision: body.accountRevision,
  ownerId: body.ownerId,
  reviewerId: body.reviewerId,
  format: body.format,
  caption: body.caption.trim(),
  plannedLocal: body.plannedLocal,
  timezone: body.timezone.trim(),
  plannedAt:
    contentPlannedInstant(body.plannedLocal, body.timezone.trim()) ?? '',
  asset: body.asset
    ? {
        taskId: body.asset.taskId,
        submissionVersion: body.asset.submissionVersion,
        assetId: body.asset.assetId,
      }
    : null,
  notes: body.notes.trim(),
});
export const contentFormatsFor = (platform: string) =>
  platform === 'TIKTOK' || platform === 'INSTAGRAM'
    ? ['IMAGE', 'VIDEO']
    : ['TEXT', 'IMAGE', 'VIDEO'];
