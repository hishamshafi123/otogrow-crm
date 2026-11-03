import { isValidUuid } from 'twenty-shared/utils';

export const releaseDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'development');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  return `/delivery?${next}`;
};
export const RELEASE_CLOSE_COMMAND = {
  releaseMode: null,
  releaseRequest: null,
};
export const RELEASE_CLOSE_RECORD = {
  ...RELEASE_CLOSE_COMMAND,
  releaseId: null,
  releaseVersion: null,
  releaseHistoryAfter: null,
};
export const releaseSelectionValid = (params: URLSearchParams) => {
  const projectId = params.get('releaseProject');
  const reportId = params.get('releaseId');
  const mode = params.get('releaseMode');
  const requestId = params.get('releaseRequest');
  const version = params.get('releaseVersion');
  return (
    [
      'releaseProject',
      'releaseId',
      'releaseRequest',
      'releaseAfter',
      'releaseProjectAfter',
      'releaseHistoryAfter',
    ].every(
      (key) => params.get(key) === null || isValidUuid(params.get(key) ?? ''),
    ) &&
    (!reportId || Boolean(projectId)) &&
    Boolean(mode) === Boolean(requestId) &&
    (!mode ||
      (Boolean(reportId) &&
        [
          'new',
          'edit',
          'SUBMIT',
          'APPROVE',
          'REQUEST_CHANGES',
          'RECORD_DEPLOYMENT',
          'RECORD_DEPLOYMENT_FAILED',
          'RECORD_HANDOVER',
          'RECORD_ACCEPTANCE',
        ].includes(mode))) &&
    (version === null ||
      (Boolean(reportId) && mode === null && /^[1-9]\d{0,8}$/.test(version))) &&
    (params.get('releaseSearch')?.length ?? 0) <= 160 &&
    [
      null,
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'CHANGES_REQUESTED',
      'DEPLOYED',
      'HANDED_OVER',
      'ACCEPTED',
    ].includes(params.get('releaseStatus'))
  );
};
