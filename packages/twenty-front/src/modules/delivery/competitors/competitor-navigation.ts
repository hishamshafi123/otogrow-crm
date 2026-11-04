import { isValidUuid } from 'twenty-shared/utils';

export const competitorDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'competitors');
  next.delete('competitorView');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  return `/delivery?${next}`;
};
export const COMPETITOR_CLOSE_COMMAND = {
  competitorMode: null,
  competitorRequest: null,
};
export const COMPETITOR_CLOSE_SOURCE = {
  ...COMPETITOR_CLOSE_COMMAND,
  competitorSource: null,
  competitorVersion: null,
  competitorHistoryAfter: null,
};
export const competitorSelectionValid = (params: URLSearchParams) => {
  const projectId = params.get('competitorProject');
  const sourceId = params.get('competitorSource');
  const mode = params.get('competitorMode');
  const requestId = params.get('competitorRequest');
  const version = params.get('competitorVersion');
  return (
    ['competitorProject', 'competitorSource', 'competitorRequest'].every(
      (key) => params.get(key) === null || isValidUuid(params.get(key) ?? ''),
    ) &&
    [
      'competitorAfter',
      'competitorProjectAfter',
      'competitorHistoryAfter',
    ].every(
      (key) =>
        params.get(key) === null ||
        /^[A-Za-z0-9._~=-]{1,4000}$/.test(params.get(key) ?? ''),
    ) &&
    (!sourceId || Boolean(projectId)) &&
    Boolean(mode) === Boolean(requestId) &&
    (!mode ||
      (Boolean(sourceId) &&
        ['new', 'edit', 'PAUSE', 'RESTORE', 'ARCHIVE'].includes(mode))) &&
    (version === null ||
      (Boolean(sourceId) && mode === null && /^[1-9]\d{0,8}$/.test(version))) &&
    (params.get('competitorSearch')?.length ?? 0) <= 160 &&
    [null, 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(
      params.get('competitorStatus'),
    )
  );
};
