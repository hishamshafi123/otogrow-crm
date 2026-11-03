import { useLingui } from '@lingui/react/macro';

export const useFinanceExportLabels = () => {
  const { t } = useLingui();
  const fields: Record<string, string> = {
    SOURCE_ID: t`Source ID`,
    SOURCE_REFERENCE: t`Original reference`,
    SOURCE_REVISION: t`Source version`,
    BASIS: t`Accounting basis`,
    DATE: t`Accounting date`,
    SERVICE_MONTH: t`Service month`,
    KIND: t`Transaction kind`,
    CATEGORY: t`Category`,
    TITLE: t`Description`,
    CURRENCY: t`Currency`,
    AMOUNT: t`Exact decimal amount`,
    AMOUNT_MICROS: t`Amount in millionths`,
    PROJECT_ID: t`Client project ID`,
    PROJECT_NAME: t`Client project name`,
    ACCOUNT: t`Account code`,
    PAYMENT_ACCOUNT: t`Payment account code`,
    COUNTERPARTY: t`Counterparty code`,
    EVIDENCE_URL: t`Evidence link`,
    CONSTANT: t`Fixed text`,
  };
  const targets: Record<string, string> = {
    ACCOUNT: t`Account code`,
    PAYMENT_ACCOUNT: t`Payment account code`,
    COUNTERPARTY: t`Counterparty code`,
  };
  const scopes: Record<string, string> = {
    SOURCE: t`Exact financial source`,
    PROJECT: t`Client project or company`,
    CATEGORY: t`Category`,
    KIND: t`Transaction kind`,
    CURRENCY: t`Currency`,
    DEFAULT: t`Default for remaining rows`,
  };
  const kinds: Record<string, string> = {
    INCOME: t`Money received`,
    EXPENSE: t`Expense paid`,
    SALARY: t`Salary paid`,
    REVENUE: t`Recognized revenue`,
    COST: t`Recognized cost`,
  };
  const basis = (value: string) =>
    value === 'CASH'
      ? t`Actual cash transactions`
      : value === 'RECOGNITION'
        ? t`Posted monthly results`
        : t`Unsupported accounting basis`;
  const statuses: Record<string, string> = {
    CONFIRMED: t`Manually marked imported`,
    REVERSED: t`Import confirmation reversed`,
    NOT_CONFIRMED: t`Import not confirmed`,
    NONE: t`Import not confirmed`,
    POSTED: t`Posted`,
    ACTIVE: t`Active`,
    OPEN: t`Open`,
    PAID: t`Paid`,
    DRAFT: t`Draft`,
    VOID: t`Voided`,
    MISSING: t`Source unavailable`,
  };
  const status = (value: string) => statuses[value] ?? t`Needs review`;
  const issue = (code: string) => {
    switch (code) {
      case 'MISSING_ACCOUNT':
        return t`Choose an account mapping for this row.`;
      case 'MISSING_PAYMENT_ACCOUNT':
        return t`Choose a payment-account mapping for this row.`;
      case 'MISSING_COUNTERPARTY':
        return t`Choose a counterparty mapping for this row.`;
      case 'PRECISION_UNSUPPORTED':
        return t`This amount needs more decimal places than the profile permits. Increase the precision; no value was rounded.`;
      case 'UNKNOWN_ALLOCATION':
        return t`The posted amount does not have a reliable complete allocation. Review its monthly source.`;
      case 'INVALID_SOURCE':
        return t`The original financial source has invalid or conflicting details and needs correction.`;
      case 'UNKNOWN_CURRENCY':
        return t`The source currency could not be confirmed; this record is excluded.`;
      case 'EMPTY_SELECTION':
        return t`No eligible transactions match this selection.`;
      case 'CSV_TOO_LARGE':
        return t`This export is too large. Narrow the source period; no rows were truncated.`;
      case 'VOID_SOURCE':
        return t`Voided source — excluded from this export.`;
      case 'DRAFT_SOURCE':
        return t`Unposted draft — excluded from this export.`;
      case 'NON_CASH_SOURCE':
        return t`Receivables and opening balances are excluded from actual cash transactions.`;
      case 'FUTURE_CASH':
        return t`Future-dated cash is excluded until its reporting business date.`;
      case 'ZERO_ENTRY_WITHOUT_ALLOCATION':
        return t`This explicitly zero-valued posted entry has no client allocation.`;
      case 'PREVIOUSLY_EXPORTED':
        return t`This financial source has appeared in an earlier batch.`;
      case 'SOURCE_CHANGED_SINCE_EXPORT':
        return t`This financial source changed after an earlier export. Review the prior handoff before re-exporting.`;
      case 'FORMULA_SAFE_TEXT':
        return t`Spreadsheet-sensitive text is prefixed with an apostrophe in the CSV.`;
      case 'UTC_CALENDAR_FALLBACK':
        return t`No reporting calendar is confirmed for this currency. Future-cash checks use the server’s UTC date.`;
      case 'PREVIOUS_EXPORT_NOW_EXCLUDED':
        return t`A source in an earlier batch is now excluded. Review its external correction with the accountant.`;
      case 'REPEATED_SOURCE_EXPORTS':
        return t`Another batch contains the same financial source. Coordinate imports to avoid duplicates.`;
      case 'PROFILE_CHANGED_SINCE_EXPORT':
        return t`The current profile has changed. This batch retains the exact earlier configuration.`;
      case 'CURRENT_SOURCE_REVIEW_UNAVAILABLE':
        return t`Current source details could not be confirmed. The saved CSV and exported versions remain unchanged.`;
      case 'GENERIC_ACCOUNTANT_HANDOFF':
        return t`This is a generic accountant CSV. Confirm the target headers and mappings with the accountant’s sample template.`;
      case 'SEPARATE_CASH_AND_RECOGNITION':
        return t`Actual cash and posted monthly results are separate bases. Do not import both as the same transactions.`;
      case 'NO_TAX_FX_OR_BALANCED_JOURNALS':
        return t`No tax treatment, exchange rate or balanced journal is inferred.`;
      case 'DOWNLOAD_IS_NOT_IMPORT_CONFIRMATION':
        return t`Downloading a batch does not confirm that an external accounting system imported it.`;
      case 'UNLINKED_CORRECTIONS_REQUIRE_ACCOUNTANT_REVIEW':
        return t`Later voids and corrections need an accountant’s review; no external adjustment is posted automatically.`;
      case 'FORMULA_SAFE_TEXT_PREFIX':
        return t`Spreadsheet-sensitive text uses a protective apostrophe; financial amounts remain exact.`;
      default:
        return t`This export needs review before it can be used.`;
    }
  };
  const actions: Record<string, string> = {
    FINANCE_EXPORT_PROFILE_SAVED: t`Export profile saved`,
    FINANCE_EXPORT_BATCH_CREATED: t`Immutable batch created`,
    FINANCE_EXPORT_IMPORT_CONFIRMED: t`Manual import recorded`,
    FINANCE_EXPORT_IMPORT_REVERSED: t`Manual import confirmation reversed`,
  };
  const action = (value: string) =>
    actions[value] ?? t`Accounting export updated`;
  return { fields, targets, scopes, kinds, basis, status, issue, action };
};
