import { isValidUuid } from 'twenty-shared/utils';
import {
  contentDayWindow,
  contentMonthWindow,
  contentTimezoneValid,
} from '@/delivery/content/content-dates';

export const CONTENT_MODES = [
  'account',
  'edit-account',
  'plan',
  'edit-plan',
  'variant',
  'edit-variant',
  'SUBMIT',
  'APPROVE',
  'REQUEST_CHANGES',
  'RECORD_PUBLICATION',
  'RECORD_FAILED',
  'RECORD_UNCERTAIN',
  'CORRECT_PUBLICATION',
  'CANCEL',
] as const;
export const CONTENT_CLOSE_COMMAND = {
  contentMode: null,
  contentRequest: null,
};
export const CONTENT_CLOSE_POST = {
  ...CONTENT_CLOSE_COMMAND,
  contentPostId: null,
  contentVersion: null,
  contentHistoryAfter: null,
};
export const contentDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'content');
  if (next.get('contentView') === 'legacy') next.delete('contentView');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  return `/delivery?${next}`;
};

export const contentSelectionValid = (params: URLSearchParams) => {
  const project = params.get('contentProject');
  const post = params.get('contentPostId');
  const plan = params.get('contentPlanId');
  const account = params.get('contentAccountId');
  const mode = params.get('contentMode');
  const version = params.get('contentVersion');
  const timezone = params.get('contentTimezone') ?? 'UTC';
  return (
    [
      'contentProject',
      'contentPostId',
      'contentPlanId',
      'contentAccountId',
      'contentRequest',
      'contentAfter',
      'contentPlanAfter',
      'contentProjectAfter',
      'contentHistoryAfter',
      'contentOwner',
      'contentAccount',
      'contentAccountAfter',
      'contentMemberAfter',
      'contentEngagementAfter',
    ].every(
      (key) => params.get(key) === null || isValidUuid(params.get(key) ?? ''),
    ) &&
    (!(post || plan || account) || Boolean(project)) &&
    Boolean(mode) === Boolean(params.get('contentRequest')) &&
    (!mode ||
      (CONTENT_MODES.some((value) => value === mode) &&
        (mode.includes('account')
          ? Boolean(account)
          : mode.includes('plan')
            ? Boolean(plan)
            : Boolean(post)))) &&
    (version === null ||
      (Boolean(post) && !mode && /^[1-9]\d{0,8}$/.test(version))) &&
    [null, 'table', 'calendar', 'plans', 'accounts'].includes(
      params.get('contentView'),
    ) &&
    [
      null,
      'DRAFT',
      'REVIEW',
      'APPROVED',
      'CHANGES_REQUESTED',
      'PUBLISHED',
      'CANCELLED',
    ].includes(params.get('contentStatus')) &&
    (params.get('contentSearch')?.length ?? 0) <= 200 &&
    (params.get('contentChoiceSearch')?.length ?? 0) <= 200 &&
    contentTimezoneValid(timezone) &&
    (!params.has('contentMonth') ||
      contentMonthWindow(params.get('contentMonth') ?? '', timezone) !==
        null) &&
    (!params.has('contentDay') ||
      contentDayWindow(params.get('contentDay') ?? '', timezone) !== null)
  );
};
