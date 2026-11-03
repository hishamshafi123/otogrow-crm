import { isValidUuid } from 'twenty-shared/utils';

export const advertisingReportDestination = (
  kind: 'META' | 'MANUAL',
  reportId: string | null | undefined,
): string | null =>
  isValidUuid(reportId ?? '')
    ? `/delivery?view=ads&adSource=${kind}&adReport=${reportId}`
    : null;
