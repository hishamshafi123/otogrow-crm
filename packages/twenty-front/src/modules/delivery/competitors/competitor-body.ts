import { type CompetitorBody } from '@/delivery/competitors/competitor.types';

export const newCompetitorBody = (
  projectId: string,
  ownerId: string,
): CompetitorBody => ({
  projectId,
  label: '',
  platform: 'X',
  accountReference: '',
  ownerId,
  reviewerId: '',
  cadenceHours: 24,
  lookbackDays: 7,
  purpose: '',
});
export const canonicalCompetitorBody = (
  body: CompetitorBody,
): CompetitorBody => ({
  projectId: body.projectId,
  label: body.label.trim(),
  platform: body.platform,
  accountReference: body.accountReference.trim(),
  ownerId: body.ownerId,
  reviewerId: body.reviewerId,
  cadenceHours: body.cadenceHours,
  lookbackDays: body.lookbackDays,
  purpose: body.purpose.trim(),
});
