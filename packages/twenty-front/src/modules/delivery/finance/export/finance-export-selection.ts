import { isDateWithoutTime } from 'twenty-shared/utils';
import { type DeliveryFinanceExportPreviewInput } from '~/generated-metadata/graphql';
import { type FinanceExportProfile } from '@/delivery/finance/export/finance-export.types';

const validCalendarDate = (value: string | null): value is string => {
  if (!value || !isDateWithoutTime(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
export const readFinanceExportSelection = (
  params: URLSearchParams,
  profile: FinanceExportProfile | null | undefined,
  currencies: string[],
): DeliveryFinanceExportPreviewInput | null => {
  const currency = params.get('financeExportCurrency');
  if (!profile || !currency || !currencies.includes(currency)) return null;
  const dateFrom = params.get('financeExportDateFrom');
  const dateTo = params.get('financeExportDateTo');
  const serviceMonth = params.get('financeExportServiceMonth');
  const accountingDate = params.get('financeExportAccountingDate');
  if (
    profile.basis === 'CASH' &&
    validCalendarDate(dateFrom) &&
    validCalendarDate(dateTo) &&
    dateFrom <= dateTo &&
    !serviceMonth &&
    !accountingDate
  )
    return {
      profileId: profile.id,
      currency,
      dateFrom,
      dateTo,
      serviceMonth: null,
      accountingDate: null,
    };
  if (
    profile.basis === 'RECOGNITION' &&
    serviceMonth &&
    /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(serviceMonth) &&
    validCalendarDate(accountingDate) &&
    !dateFrom &&
    !dateTo
  )
    return {
      profileId: profile.id,
      currency,
      dateFrom: null,
      dateTo: null,
      serviceMonth,
      accountingDate,
    };
  return null;
};
export const financeExportSelectionParams = (
  selection: DeliveryFinanceExportPreviewInput | null,
): Record<string, string | null> => ({
  financeExportCurrency: selection?.currency ?? null,
  financeExportDateFrom: selection?.dateFrom ?? null,
  financeExportDateTo: selection?.dateTo ?? null,
  financeExportServiceMonth: selection?.serviceMonth ?? null,
  financeExportAccountingDate: selection?.accountingDate ?? null,
});
