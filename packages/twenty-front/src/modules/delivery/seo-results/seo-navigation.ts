import { isValidUuid } from 'twenty-shared/utils';

export const seoDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'seo');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  return `/delivery?${next}`;
};
export const SEO_CLOSE_COMMAND = { seoMode: null, seoRequest: null };
export const SEO_CLOSE_REPORT = {
  ...SEO_CLOSE_COMMAND,
  seoReport: null,
  seoVersion: null,
  seoHistoryAfter: null,
};
export const seoSelectionValid = (params: URLSearchParams) => {
  const projectId = params.get('seoProject');
  const reportId = params.get('seoReport');
  const mode = params.get('seoMode');
  const requestId = params.get('seoRequest');
  const version = params.get('seoVersion');
  return (
    [
      'seoProject',
      'seoReport',
      'seoRequest',
      'seoAfter',
      'seoProjectAfter',
      'seoHistoryAfter',
    ].every(
      (key) => params.get(key) === null || isValidUuid(params.get(key) ?? ''),
    ) &&
    (!reportId || Boolean(projectId)) &&
    Boolean(mode) === Boolean(requestId) &&
    (!mode ||
      (Boolean(reportId) &&
        ['new', 'edit', 'SUBMIT', 'APPROVE', 'REQUEST_CHANGES'].includes(
          mode,
        ))) &&
    (version === null ||
      (Boolean(reportId) && mode === null && /^[1-9]\d{0,8}$/.test(version))) &&
    (params.get('seoSearch')?.length ?? 0) <= 160 &&
    [null, 'DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'].includes(
      params.get('seoStatus'),
    )
  );
};
