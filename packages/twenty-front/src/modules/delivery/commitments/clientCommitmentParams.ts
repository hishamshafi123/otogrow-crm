const COMMITMENT_CURSORS = [
  'commitmentAllocationsAfter',
  'commitmentHistoryBefore',
  'commitmentOrphansAfter',
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

export const clientCommitmentsParams = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.set('view', 'clients');
  next.delete('clientView');
  next.delete('task');
  next.delete('panel');
  return next;
};

export const clientAgreementsParams = (params: URLSearchParams) => {
  const next = clientCommitmentsParams(params);
  next.set('clientView', 'agreements');
  return next;
};
