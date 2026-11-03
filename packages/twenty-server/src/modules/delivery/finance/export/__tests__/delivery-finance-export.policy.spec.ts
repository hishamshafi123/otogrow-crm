import {
  financeExportBatchSchema,
  financeExportChecksum,
  financeExportConfigurationSchema,
  financeExportCsv,
  financeExportExactAmount,
  financeExportImportSchema,
  financeExportProfileSchema,
  financeExportSafeText,
  financeExportSelectionSchema,
  type FinanceExportSnapshotRow,
} from 'src/modules/delivery/finance/export/delivery-finance-export.policy';
import { renderFinanceExportRow } from 'src/modules/delivery/finance/export/render-delivery-finance-export';

const SOURCE_ID = 'e48724db-d4bc-4fa6-b15f-e24f0510351c';
const PROFILE_ID = '74df79b8-54e5-4fd7-8667-be7d093952d9';
const configuration = () =>
  financeExportConfigurationSchema.parse({
    columns: [
      { header: 'Date', field: 'DATE' },
      { header: 'Amount', field: 'AMOUNT' },
      { header: 'Title', field: 'TITLE' },
    ],
    mappings: [],
    delimiter: 'COMMA',
    precision: 2,
    dateFormat: 'ISO',
    includeBom: false,
  });
const row = (): FinanceExportSnapshotRow => ({
  key: `${SOURCE_ID}:CASH`,
  identityKey: `CASH:${SOURCE_ID}`,
  sourceId: SOURCE_ID,
  sourceRevision: 1,
  sourceType: 'CASH',
  sourceReference: 'Original receipt',
  sourceStatus: 'POSTED',
  currentStatus: 'POSTED',
  date: '2026-10-28',
  serviceMonth: null,
  kind: 'EXPENSE',
  category: 'EXPENSE',
  title: 'Recorded supplier payment',
  currency: 'USD',
  amountMicros: '1230000',
  projectId: null,
  projectName: null,
  evidenceUrl: null,
  account: null,
  paymentAccount: null,
  counterparty: null,
  cells: [],
  errors: [],
  warnings: [],
  previousBatchCount: 0,
  latestBatchId: null,
  sourceChanged: false,
  sourceToken: 'a'.repeat(64),
  bucket: 'CASH',
});

it.each([
  ['0', 2, '0.00'],
  ['1', 6, '0.000001'],
  ['10000', 2, '0.01'],
  ['1230000', 2, '1.23'],
  ['9223372036854775807', 6, '9223372036854.775807'],
  ['1000000', 0, '1'],
])(
  'serializes exact micros %s at precision %s without Number conversion',
  (micros, precision, expected) => {
    expect(financeExportExactAmount(String(micros), Number(precision))).toBe(
      expected,
    );
  },
);
it.each(['1', '10001', '999999'])(
  'rejects unsupported subcent amount %s instead of rounding it',
  (micros) => {
    expect(financeExportExactAmount(micros, 2)).toBeNull();
    expect(
      renderFinanceExportRow(
        { ...row(), amountMicros: micros },
        configuration(),
        'CASH',
      ).errors,
    ).toContain('PRECISION_UNSUPPORTED');
  },
);
it('requires one complete basis-specific period and an explicit recognition accounting date', () => {
  expect(
    financeExportSelectionSchema.safeParse({
      profileId: PROFILE_ID,
      currency: 'USD',
      serviceMonth: '2026-10',
    }).success,
  ).toBe(false);
  expect(
    financeExportSelectionSchema.safeParse({
      profileId: PROFILE_ID,
      currency: 'USD',
      serviceMonth: '2026-10',
      accountingDate: '2026-11-03',
    }).success,
  ).toBe(true);
  expect(
    financeExportSelectionSchema.safeParse({
      profileId: PROFILE_ID,
      currency: 'USD',
      dateFrom: '2026-10-31',
      dateTo: '2026-10-01',
    }).success,
  ).toBe(false);
  expect(
    financeExportSelectionSchema.safeParse({
      profileId: PROFILE_ID,
      currency: 'USD',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      serviceMonth: '2026-10',
      accountingDate: '2026-11-03',
    }).success,
  ).toBe(false);
});
it('keeps profile configuration checks in the full command schema', () => {
  const fields = {
    ...configuration(),
    commandId: SOURCE_ID,
    id: PROFILE_ID,
    revision: 0,
    name: 'Reviewed handoff',
    basis: 'CASH',
    active: true,
    reason: 'Reviewed target headers',
  };
  expect(financeExportProfileSchema.safeParse(fields).success).toBe(true);
  expect(
    financeExportProfileSchema.safeParse({
      ...fields,
      columns: [
        { header: 'Same', field: 'DATE' },
        { header: 'same', field: 'AMOUNT' },
      ],
    }).success,
  ).toBe(false);
  expect(
    financeExportProfileSchema.safeParse({
      ...fields,
      columns: [{ header: 'Amount', field: 'process.env' }],
    }).success,
  ).toBe(false);
  expect(
    financeExportProfileSchema.safeParse({
      ...fields,
      columns: [{ header: '=IMPORTDATA("secret")', field: 'DATE' }],
    }).success,
  ).toBe(false);
});
it('requires only selected mapping targets and chooses the most specific explicit mapping', () => {
  expect(renderFinanceExportRow(row(), configuration(), 'CASH').errors).toEqual(
    [],
  );
  const mapped = configuration();
  mapped.columns.push(
    { header: 'Account', field: 'ACCOUNT', constant: null },
    { header: 'Payment account', field: 'PAYMENT_ACCOUNT', constant: null },
    { header: 'Counterparty', field: 'COUNTERPARTY', constant: null },
  );
  expect(renderFinanceExportRow(row(), mapped, 'CASH').errors).toEqual([
    'MISSING_ACCOUNT',
    'MISSING_PAYMENT_ACCOUNT',
    'MISSING_COUNTERPARTY',
  ]);
  mapped.mappings = [
    {
      target: 'ACCOUNT',
      scope: 'DEFAULT',
      key: null,
      value: 'Explicit default',
    },
    {
      target: 'ACCOUNT',
      scope: 'PROJECT',
      key: 'COMPANY',
      value: 'Company expense',
    },
    {
      target: 'ACCOUNT',
      scope: 'SOURCE',
      key: SOURCE_ID,
      value: 'Specific source account',
    },
    {
      target: 'PAYMENT_ACCOUNT',
      scope: 'CURRENCY',
      key: 'USD',
      value: 'Reviewed USD bank',
    },
    {
      target: 'COUNTERPARTY',
      scope: 'KIND',
      key: 'EXPENSE',
      value: 'Explicit supplier',
    },
  ];
  const projected = renderFinanceExportRow(row(), mapped, 'CASH');
  expect(projected.errors).toEqual([]);
  expect(projected.account).toBe('Specific source account');
  expect(projected.paymentAccount).toBe('Reviewed USD bank');
  expect(projected.counterparty).toBe('Explicit supplier');
});
it('rejects duplicate mapping keys and malformed project/source identities', () => {
  expect(
    financeExportConfigurationSchema.safeParse({
      ...configuration(),
      mappings: [
        {
          target: 'ACCOUNT',
          scope: 'SOURCE',
          key: 'a staff name',
          value: 'Cost account',
        },
      ],
    }).success,
  ).toBe(false);
  const mapping = {
    target: 'ACCOUNT',
    scope: 'DEFAULT',
    key: null,
    value: 'Explicit account',
  };
  expect(
    financeExportConfigurationSchema.safeParse({
      ...configuration(),
      mappings: [mapping, mapping],
    }).success,
  ).toBe(false);
});
it.each([
  '=SUM(A1)',
  '+CMD',
  '-CMD',
  '@SUM(A1)',
  '  =IMPORTDATA("secret")',
  '\tvalue',
  '\rvalue',
])('protects unsafe spreadsheet text %s as a literal cell', (value) => {
  expect(financeExportSafeText(value)).toBe(`'${value}`);
  expect(
    renderFinanceExportRow({ ...row(), title: value }, configuration(), 'CASH')
      .warnings,
  ).toContain('FORMULA_SAFE_TEXT');
});
it('quotes delimiters, embedded quotes and multiline text with deterministic BOM and CRLF', () => {
  const settings = configuration();
  settings.includeBom = true;
  expect(
    financeExportCsv(settings, [
      ['2026-10-28', '1.23', 'Supplier, "A"\nreviewed'],
    ]),
  ).toBe(
    '\uFEFFDate,Amount,Title\r\n2026-10-28,1.23,"Supplier, ""A""\nreviewed"\r\n',
  );
  expect(financeExportChecksum('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
it('preserves explicit accounting dates while formatting the selected literal template', () => {
  const settings = configuration();
  settings.dateFormat = 'DMY';
  expect(
    renderFinanceExportRow(
      { ...row(), date: '2026-11-03', serviceMonth: '2026-10', kind: 'COST' },
      settings,
      'RECOGNITION',
    ).cells[0],
  ).toBe('03/11/2026');
});
it('requires stable batch and confirmation commands without making a download an import claim', () => {
  expect(
    financeExportBatchSchema.safeParse({
      id: SOURCE_ID,
      profileId: PROFILE_ID,
      currency: 'USD',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      expectedPreviewToken: 'a'.repeat(64),
      acknowledgeRepeatedSources: false,
    }).success,
  ).toBe(true);
  expect(
    financeExportImportSchema.safeParse({
      commandId: SOURCE_ID,
      batchId: PROFILE_ID,
      revision: 1,
      status: 'CONFIRMED',
      reason: 'Manual review',
    }).success,
  ).toBe(false);
  expect(
    financeExportImportSchema.safeParse({
      commandId: SOURCE_ID,
      batchId: PROFILE_ID,
      revision: 2,
      status: 'REVERSED',
      reason: 'Retract local confirmation only',
    }).success,
  ).toBe(true);
});
