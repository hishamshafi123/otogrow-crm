import { type DeliveryFinanceExportProfileEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-profile.entity';
import { type DeliveryFinanceExportProfileDTO } from 'src/modules/delivery/finance/export/delivery-finance-export.dto';
import {
  FINANCE_EXPORT_MAPPING_SCOPES,
  financeExportExactAmount,
  financeExportSafeText,
  type FinanceExportConfiguration,
  type FinanceExportSnapshotRow,
} from 'src/modules/delivery/finance/export/delivery-finance-export.policy';

export const projectFinanceExportProfile = (
  profile: DeliveryFinanceExportProfileEntity,
): DeliveryFinanceExportProfileDTO => ({
  id: profile.id,
  revision: profile.revision,
  name: profile.name,
  basis: profile.basis,
  active: profile.active,
  ...profile.configuration,
  changedAt: profile.changedAt.toISOString(),
  changedByName: profile.changedByName,
});
const mappedValue = (
  configuration: FinanceExportConfiguration,
  row: FinanceExportSnapshotRow,
  target: 'ACCOUNT' | 'PAYMENT_ACCOUNT' | 'COUNTERPARTY',
) => {
  const keys = {
    SOURCE: row.sourceId,
    PROJECT: row.projectId ?? 'COMPANY',
    CATEGORY: row.category,
    KIND: row.kind,
    CURRENCY: row.currency,
    DEFAULT: null,
  };
  for (const scope of FINANCE_EXPORT_MAPPING_SCOPES) {
    const mapping = configuration.mappings.find(
      (candidate) =>
        candidate.target === target &&
        candidate.scope === scope &&
        candidate.key === keys[scope],
    );
    if (mapping) return mapping.value;
  }
  return null;
};
export const renderFinanceExportRow = (
  row: FinanceExportSnapshotRow,
  configuration: FinanceExportConfiguration,
  basis: 'CASH' | 'RECOGNITION',
): FinanceExportSnapshotRow => {
  const amount = financeExportExactAmount(
    row.amountMicros,
    configuration.precision,
  );
  const account = mappedValue(configuration, row, 'ACCOUNT');
  const paymentAccount = mappedValue(configuration, row, 'PAYMENT_ACCOUNT');
  const counterparty = mappedValue(configuration, row, 'COUNTERPARTY');
  const errors = [
    ...row.errors,
    ...(amount === null ? ['PRECISION_UNSUPPORTED'] : []),
  ];
  const warnings = [...row.warnings];
  const [year, month, day] = row.date.split('-');
  const formattedDate =
    configuration.dateFormat === 'DMY'
      ? `${day}/${month}/${year}`
      : configuration.dateFormat === 'MDY'
        ? `${month}/${day}/${year}`
        : row.date;
  const values: Record<
    Exclude<FinanceExportConfiguration['columns'][number]['field'], 'CONSTANT'>,
    string | null
  > = {
    SOURCE_ID: row.sourceId,
    SOURCE_REFERENCE: row.sourceReference,
    SOURCE_REVISION: String(row.sourceRevision),
    BASIS: basis,
    DATE: formattedDate,
    SERVICE_MONTH: row.serviceMonth,
    KIND: row.kind,
    CATEGORY: row.category,
    TITLE: row.title,
    CURRENCY: row.currency,
    AMOUNT: amount,
    AMOUNT_MICROS: row.amountMicros,
    PROJECT_ID: row.projectId,
    PROJECT_NAME: row.projectName,
    ACCOUNT: account,
    PAYMENT_ACCOUNT: paymentAccount,
    COUNTERPARTY: counterparty,
    EVIDENCE_URL: row.evidenceUrl,
  };
  const cells = configuration.columns.map((column) => {
    const value =
      column.field === 'CONSTANT' ? column.constant : values[column.field];
    if (
      ['ACCOUNT', 'PAYMENT_ACCOUNT', 'COUNTERPARTY'].includes(column.field) &&
      value === null
    )
      errors.push(`MISSING_${column.field}`);
    const text = value ?? '';
    const escaped =
      column.field === 'AMOUNT' ||
      column.field === 'AMOUNT_MICROS' ||
      column.field === 'SOURCE_REVISION'
        ? text
        : financeExportSafeText(text);
    if (escaped !== text) warnings.push('FORMULA_SAFE_TEXT');
    return escaped;
  });
  return {
    ...row,
    account,
    paymentAccount,
    counterparty,
    cells,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};
