import { useLingui } from '@lingui/react/macro';

export const useFinanceForecastLabels = () => {
  const { t } = useLingui();
  const warning = (code: string) => {
    switch (code) {
      case 'ANCHOR_NOT_SET': return t`Starting cash has not been confirmed.`;
      case 'MISSING_SOURCE': return t`The original invoice or plan is unavailable. Review or cancel this expectation.`;
      case 'SOURCE_CHANGED': return t`The invoice or plan details changed. Review the current source before including this expectation.`;
      case 'OWNER_INELIGIBLE': return t`The owner no longer has active finance access. Reassign the follow-up.`;
      case 'REPORTING_DATE_NOT_SET': return t`Confirm starting cash and its reporting time zone to establish today’s business date.`;
      case 'UNDATED_EXPECTATION': return t`Choose an expected date to include this amount in the daily scenario.`;
      case 'OVERDUE_EXPECTATION': return t`The expected date has passed. Review when the remaining cash is now expected.`;
      case 'NEXT_ACTION_OVERDUE': return t`The next action is overdue. Review the owner’s follow-up.`;
      case 'UNSCHEDULED_COLLECTION': return t`This invoice has an outstanding balance without an active collection schedule.`;
      case 'UNKNOWN_COLLECTION': return t`The remaining invoice balance cannot be confirmed from its recorded receipts.`;
      case 'UNAPPLIED_ACTUAL_OUTFLOW': return t`This recorded outgoing payment has not been fully applied to an expectation.`;
      case 'BACKDATED_CASH_COVERED_BY_ANCHOR': return t`A record was entered later with a date covered by starting cash. It is treated as already included; review the confirmed balance if needed.`;
      case 'PLAN_INACTIVE': return t`This plan is inactive. An existing expectation needs an explicit review before it can be included.`;
      case 'PLAN_OUTSIDE_MONTH': return t`This occurrence is outside the plan’s current service months. Review whether the payment is still expected.`;
      case 'OVER_APPLIED': return t`Applied payments exceed this expectation. Review and reverse an incorrect application.`;
      case 'SOURCE_VOID': return t`The original record was voided. It is excluded from the dated scenario.`;
      case 'FUTURE_CASH': return t`This financial record is dated after today. Review its date before including it.`;
      case 'FUTURE_SETTLEMENT': return t`A linked invoice receipt is future-dated. Review the actual payment date before scheduling this collection.`;
      case 'LEGACY_PAID_WITHOUT_RECEIPT': return t`This earlier invoice is marked paid without a reliable receipt. Review its recorded payment.`;
      case 'INVALID_CASH': return t`This financial record has invalid or conflicting details. Review and correct the original record.`;
      case 'MISSING_CASH': return t`A linked payment is missing or voided. Review the invoice and its original payment links.`;
      case 'LEGACY_RECEIPT_MISMATCH': return t`An earlier receipt does not match its invoice reliably. Correct the original payment records before scheduling this collection.`;
      case 'OVER_SETTLED': return t`Recorded invoice payments exceed the source amount. Review and correct the original payment links.`;
      case 'PAID_BALANCE_MISMATCH': return t`The earlier paid status disagrees with the recorded receipts. Review the invoice’s original payment records.`;
      default: return t`This financial source needs review before it can be included reliably.`;
    }
  };
  const status = (value: string) => value === 'ACTIVE' ? t`Active` : value === 'CANCELLED' ? t`Cancelled` : value === 'REVERSED' ? t`Reversed` : t`Needs review`;
  const action = (value: string) => {
    switch (value) {
      case 'FINANCE_FORECAST_ANCHOR_REVIEWED': return t`Starting cash reviewed`;
      case 'FINANCE_FORECAST_ITEM_REVIEWED': return t`Expectation reviewed`;
      case 'FINANCE_FORECAST_ITEM_CANCELLED': return t`Expectation cancelled`;
      case 'FINANCE_FORECAST_REALIZATION_CREATED': return t`Actual payment applied`;
      case 'FINANCE_FORECAST_REALIZATION_REVERSED': return t`Payment application reversed`;
      default: return t`Cash forecast updated`;
    }
  };
  return { warning, status, action };
};
