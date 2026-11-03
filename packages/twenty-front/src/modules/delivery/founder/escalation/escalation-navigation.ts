export const escalationDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'health');
  next.set('founderPanel', 'alerts');
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return `/delivery?${next}`;
};
export const founderQueueDestination = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.set('view', 'health');
  for (const key of [
    'founderPanel',
    'founderRule',
    'founderIssue',
    'founderRulesAfter',
    'founderIssuesAfter',
    'founderNoticesAfter',
  ])
    next.delete(key);
  return `/delivery?${next}`;
};
