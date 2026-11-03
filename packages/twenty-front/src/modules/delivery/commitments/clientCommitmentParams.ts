const COMMITMENT_CURSORS = [
  'commitmentAllocationsAfter',
  'commitmentHistoryBefore',
];

export const commitmentPeriodParams = (
  params: URLSearchParams,
  periodId: string | null,
) => {
  const next = new URLSearchParams(params);
  if (periodId) next.set('commitmentPeriod', periodId);
  else next.delete('commitmentPeriod');
  for (const cursor of COMMITMENT_CURSORS) next.delete(cursor);
  return next;
};

export const clientEngagementParams = (
  params: URLSearchParams,
  engagementId: string | null,
) => {
  const next = commitmentPeriodParams(params, null);
  if (engagementId) next.set('clientEngagement', engagementId);
  else next.delete('clientEngagement');
  return next;
};
