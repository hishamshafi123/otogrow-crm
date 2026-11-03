import { isValidUuid } from 'twenty-shared/utils';
import { type FounderAction } from '@/delivery/founder/founder.types';
import { advertisingReportDestination } from '@/delivery/advertising/advertising-report-destination';

export const founderActionDestination = (
  action: FounderAction,
  currencies: string[],
): string | null => {
  const validTarget = isValidUuid(action.targetId ?? '');
  if (action.targetType === 'TASK' && action.code === 'REVIEW_SUBMISSION')
    return validTarget &&
      Number.isSafeInteger(action.submissionVersion) &&
      (action.submissionVersion ?? 0) > 0
      ? `/delivery?view=reviews&task=${action.targetId}&panel=task&creativeSubmission=${action.submissionVersion}`
      : validTarget
        ? `/delivery?view=reviews&task=${action.targetId}&panel=task`
        : null;
  if (action.targetType === 'TASK')
    return validTarget
      ? `/delivery?view=planner&task=${action.targetId}${['REVIEW_DELIVERY', 'OPEN_ALERT'].includes(action.code) ? '&panel=operations' : ''}`
      : null;
  if (action.targetType === 'COMMITMENT')
    return isValidUuid(action.engagementId ?? '') &&
      isValidUuid(action.periodId ?? '')
      ? `/delivery?view=clients&clientEngagement=${action.engagementId}&commitmentPeriod=${action.periodId}`
      : null;
  if (action.targetType === 'MANUAL_REPORT')
    return advertisingReportDestination('MANUAL', action.targetId);
  if (action.targetType === 'META_REPORT')
    return advertisingReportDestination('META', action.targetId);
  if (action.targetType === 'READINESS')
    return '/delivery?view=health#company-readiness';
  if (!action.currency || !currencies.includes(action.currency)) return null;
  const params = new URLSearchParams({
    view: 'finance',
    financeCurrency: action.currency,
  });
  if (action.targetType === 'MONTHLY') {
    if (
      !action.serviceMonth ||
      !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(action.serviceMonth)
    )
      return null;
    params.set('financeView', 'monthly');
    params.set('financeMonth', action.serviceMonth);
  } else if (action.targetType === 'FORECAST') {
    params.set('financeView', 'forecast');
    if (action.code === 'REVIEW_FORECAST' && action.sourceKind === 'ANCHOR')
      params.set('financeForecastDays', '90');
    if (action.sourceKind === 'ITEM' && validTarget)
      params.set('financeForecastItem', action.targetId ?? '');
    else if (
      action.sourceKind === 'CASH' &&
      action.code === 'REVIEW_CASH' &&
      validTarget
    ) {
      params.set('financeView', 'payments');
      params.set('financeCash', action.targetId ?? '');
    } else if (
      ['RECEIVABLE', 'CASH'].includes(action.sourceKind ?? '') &&
      validTarget
    ) {
      params.set('financeForecastKind', action.sourceKind ?? '');
      params.set('financeForecastSource', action.targetId ?? '');
    } else if (action.sourceKind !== 'ANCHOR') return null;
  } else return null;
  return `/delivery?${params}`;
};
