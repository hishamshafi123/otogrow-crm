import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import {
  type DeliveryFinancePaymentsQuery,
  type DeliveryFinanceSettlementInput,
  type DeliveryFinanceCashMatchInput,
} from '~/generated-metadata/graphql';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PaymentsSnapshot = DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
export type ReconciliationAllocationInput =
  | { kind: 'SETTLEMENT'; input: DeliveryFinanceSettlementInput }
  | { kind: 'MATCH'; input: DeliveryFinanceCashMatchInput };
type ReconciliationAllocationFormProps = {
  kind: 'SETTLEMENT' | 'MATCH';
  cashes: PaymentsSnapshot['cash'];
  receivables: PaymentsSnapshot['receivables'];
  entries: PaymentsSnapshot['entries'];
  initialCashId?: string;
  initialReceivableId?: string;
  initialEntryId?: string;
  busy: boolean;
  readOnly?: boolean;
  onSave: (value: ReconciliationAllocationInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
const COMPANY_BUCKET = 'COMPANY';
const StyledMatchingFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const ReconciliationAllocationForm = ({
  kind,
  cashes,
  receivables,
  entries,
  initialCashId,
  initialReceivableId,
  initialEntryId,
  busy,
  readOnly = false,
  onSave,
  onCancel,
  onReload,
}: ReconciliationAllocationFormProps) => {
  const { t, i18n } = useLingui();
  const labels = useReconciliationLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState(() => {
    const cash = cashes.find((item) => item.id === initialCashId);
    const target =
      kind === 'SETTLEMENT'
        ? receivables.find((item) => item.id === initialReceivableId)
        : entries.find((item) => item.id === initialEntryId);
    return {
      cashId: initialCashId ?? '',
      targetId:
        (kind === 'SETTLEMENT' ? initialReceivableId : initialEntryId) ?? '',
      cashToken: cash?.sourceReviewToken ?? '',
      targetToken: target?.sourceReviewToken ?? '',
      projectId: '',
      amount: '',
      acknowledgeUnassignedCash: false,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const registerForm = draft.formRef;
  const attachForm = useCallback(
    (form: HTMLFormElement | null) => {
      registerForm(form);
      form?.querySelector<HTMLSelectElement>('[name="cashId"]')?.focus();
    },
    [registerForm],
  );
  const settlement = kind === 'SETTLEMENT';
  const cash = cashes.find((item) => item.id === values.cashId);
  const receivable = settlement
    ? receivables.find((item) => item.id === values.targetId)
    : undefined;
  const entry = !settlement
    ? entries.find((item) => item.id === values.targetId)
    : undefined;
  const target = receivable ?? entry;
  const allocation = entry?.allocations.find(
    (item) =>
      item.projectId ===
      (values.projectId === COMPANY_BUCKET ? null : values.projectId),
  );
  const targetProjectId = receivable
    ? receivable.projectId
    : allocation?.projectId;
  const stale = Boolean(
    (values.cashId && (!cash || values.cashToken !== cash.sourceReviewToken)) ||
    (values.targetId &&
      (!target || values.targetToken !== target.sourceReviewToken)),
  );
  const amountMicros = parseFinanceAmountMicros(values.amount);
  const amountValid =
    amountMicros !== null &&
    isFinanceAmountMicrosWithinLimit(amountMicros) &&
    BigInt(amountMicros) > 0n &&
    (!settlement ||
      (BigInt(amountMicros) % 10000n === 0n &&
        BigInt(amountMicros) <= 1000000000000000n));
  const cashRemaining = cash
    ? settlement
      ? cash.remainingSettlementMicros
      : cash.remainingMatchMicros
    : null;
  const targetRemaining =
    receivable?.outstandingMicros ?? allocation?.remainingMatchMicros ?? null;
  const requiresAcknowledgement = Boolean(
    cash && cash.projectId === null && targetProjectId,
  );
  const display = (micros: string, currency: string) =>
    formatFinanceAmountMicros(micros, currency, i18n.locale);
  const blockingWarning = [
    ...(cash?.sourceWarnings ?? []),
    ...(receivable?.sourceWarnings ?? []),
  ].some((warning) =>
    [
      'LEGACY_RECEIPT_MISMATCH',
      'SOURCE_VOID',
      'SOURCE_CHANGED',
      'SOURCE_PROJECT_UNAVAILABLE',
      'FUTURE_CASH_DATE',
      'OVER_SETTLED',
      'OVER_MATCHED',
    ].includes(warning),
  );
  const requirements = [
    ...(blockingWarning
      ? [
          t`This source has a blocking warning. Correct the source or review its history before linking more money.`,
        ]
      : []),
    ...(!cash ? [t`Choose an available actual payment.`] : []),
    ...(cash && cash.status !== 'POSTED'
      ? [t`Only a posted actual payment can be matched.`]
      : []),
    ...(!target
      ? [
          settlement
            ? t`Choose an available invoice.`
            : t`Choose an available monthly entry.`,
        ]
      : []),
    ...(receivable?.status === 'VOID'
      ? [t`A void invoice cannot receive a payment.`]
      : []),
    ...(entry && entry.status !== 'POSTED'
      ? [t`Choose a posted monthly entry.`]
      : []),
    ...(cash && settlement && cash.category !== 'INCOME'
      ? [t`Only money received can settle an invoice.`]
      : []),
    ...(cash &&
    entry &&
    ((cash.category === 'INCOME' && entry.kind !== 'REVENUE') ||
      (['EXPENSE', 'SALARY'].includes(cash.category) &&
        entry.kind !== 'COST') ||
      !['INCOME', 'EXPENSE', 'SALARY'].includes(cash.category))
      ? [t`Money received must match revenue; money paid must match a cost.`]
      : []),
    ...(cash && target && cash.currency !== target.currency
      ? [
          t`Payment and target must use the same currency. No currency conversion is applied.`,
        ]
      : []),
    ...(entry && !allocation
      ? [
          t`Choose an explicit client or company allocation from this monthly entry.`,
        ]
      : []),
    ...(cash &&
    cash.projectId !== null &&
    targetProjectId !== undefined &&
    cash.projectId !== targetProjectId
      ? [
          t`This payment belongs to a different client project. Choose its matching client allocation or invoice.`,
        ]
      : []),
    ...(!amountValid
      ? [
          settlement
            ? t`Enter a positive invoice payment amount with no more than two decimal places, within the supported cash limit.`
            : t`Enter a positive matching amount with up to six decimal places, within the supported limit.`,
        ]
      : []),
    ...(amountValid &&
    cashRemaining !== null &&
    BigInt(amountMicros!) > BigInt(cashRemaining)
      ? [
          settlement
            ? t`The amount exceeds this payment’s remaining invoice settlement balance.`
            : t`The amount exceeds this payment’s remaining monthly matching balance.`,
        ]
      : []),
    ...(amountValid &&
    targetRemaining !== null &&
    BigInt(amountMicros!) > BigInt(targetRemaining)
      ? [
          settlement
            ? t`The amount exceeds this invoice’s outstanding balance.`
            : t`The amount exceeds this monthly allocation’s unmatched balance.`,
        ]
      : []),
    ...(requiresAcknowledgement && !values.acknowledgeUnassignedCash
      ? [
          t`Confirm that this unassigned payment belongs to the selected client.`,
        ]
      : []),
  ];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      busy ||
      saving ||
      readOnly ||
      stale ||
      !draft.dirty ||
      requirements.length ||
      !amountValid ||
      amountMicros === null ||
      !cash ||
      !target
    )
      return;
    setSaving(true);
    setError('');
    const common = {
      id,
      cashId: cash.id,
      amountMicros,
      expectedCashToken: values.cashToken,
      acknowledgeUnassignedCash:
        requiresAcknowledgement && values.acknowledgeUnassignedCash,
    };
    try {
      const saved = await onSave(
        settlement
          ? {
              kind: 'SETTLEMENT',
              input: {
                ...common,
                receivableId: target.id,
                expectedReceivableToken: values.targetToken,
              },
            }
          : {
              kind: 'MATCH',
              input: {
                ...common,
                entryId: target.id,
                projectId: targetProjectId ?? null,
                expectedEntryToken: values.targetToken,
              },
            },
      );
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The matching was not confirmed saved. Your draft is kept; check current balances and reload if a source changed.`,
        );
    } catch {
      setError(t`The matching could not be saved. Your draft is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={attachForm}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={
        settlement
          ? t`Apply payment to invoice`
          : t`Match payment to monthly result`
      }
    >
      <StyledDeliveryStack>
        <h3>
          {settlement
            ? t`Apply payment to invoice`
            : t`Match payment to monthly result`}
        </h3>
        <p>
          <Trans>
            Link an explicit amount only. This creates no new payment, revenue
            or cost. Invoice settlement and monthly matching keep separate
            balances.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your draft is kept, and you can close it
              without saving.
            </Trans>
          </p>
        )}
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <StyledMatchingFields>
              <label>
                <Trans>Actual payment</Trans>
                <select
                  name="cashId"
                  value={values.cashId}
                  onChange={(event) => {
                    const selected = cashes.find(
                      (item) => item.id === event.target.value,
                    );
                    setValues({
                      ...values,
                      cashId: event.target.value,
                      cashToken: selected?.sourceReviewToken ?? '',
                      acknowledgeUnassignedCash: false,
                    });
                  }}
                >
                  <option value="">{t`Choose a payment`}</option>
                  {values.cashId && !cash && (
                    <option
                      value={values.cashId}
                    >{t`Unavailable payment`}</option>
                  )}
                  {cashes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.currency} · {item.date}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {settlement ? t`Invoice` : t`Posted monthly entry`}
                <select
                  name="targetId"
                  value={values.targetId}
                  onChange={(event) => {
                    const selected = settlement
                      ? receivables.find(
                          (item) => item.id === event.target.value,
                        )
                      : entries.find((item) => item.id === event.target.value);
                    setValues({
                      ...values,
                      targetId: event.target.value,
                      targetToken: selected?.sourceReviewToken ?? '',
                      projectId: '',
                      acknowledgeUnassignedCash: false,
                    });
                  }}
                >
                  <option value="">
                    {settlement
                      ? t`Choose an invoice`
                      : t`Choose a monthly entry`}
                  </option>
                  {values.targetId && !target && (
                    <option
                      value={values.targetId}
                    >{t`Unavailable source`}</option>
                  )}
                  {settlement
                    ? receivables.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} · {item.currency}
                        </option>
                      ))
                    : entries.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} · {item.month} · {item.currency}
                        </option>
                      ))}
                </select>
              </label>
              {!settlement && (
                <label>
                  <Trans>Monthly client or company allocation</Trans>
                  <select
                    name="projectId"
                    value={values.projectId}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        projectId: event.target.value,
                        acknowledgeUnassignedCash: false,
                      })
                    }
                  >
                    <option value="">{t`Choose an allocation`}</option>
                    {entry?.allocations.map((item) => (
                      <option
                        key={item.projectId ?? COMPANY_BUCKET}
                        value={item.projectId ?? COMPANY_BUCKET}
                      >
                        {item.projectName ?? t`Company / unassigned`} ·{' '}
                        {display(item.remainingMatchMicros, entry.currency)}{' '}
                        {t`unmatched`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <Trans>Amount to link</Trans>
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(event) =>
                    setValues({ ...values, amount: event.target.value })
                  }
                />
              </label>
            </StyledMatchingFields>
            {cash && (
              <div>
                <p>
                  {labels.category(cash.category)} · {cash.date} ·{' '}
                  {display(cash.amountMicros, cash.currency)} ·{' '}
                  {cash.projectName ?? t`Company / unassigned`}
                </p>
                {cash.category === 'INCOME' && (
                  <p>
                    <Trans>Payment available for invoices:</Trans>{' '}
                    {display(cash.remainingSettlementMicros, cash.currency)}
                  </p>
                )}
                <p>
                  <Trans>Payment available for monthly matching:</Trans>{' '}
                  {display(cash.remainingMatchMicros, cash.currency)}
                </p>
                {cash.sourceWarnings.length > 0 && (
                  <ul aria-label={t`Payment source warnings`}>
                    {cash.sourceWarnings.map((warning) => (
                      <li key={warning}>{labels.warning(warning)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {receivable && (
              <div>
                <p>
                  <Trans>Invoice outstanding:</Trans>{' '}
                  {display(receivable.outstandingMicros, receivable.currency)} ·{' '}
                  {receivable.projectName ?? t`Company / unassigned`}
                </p>
                {receivable.sourceWarnings.length > 0 && (
                  <ul aria-label={t`Invoice source warnings`}>
                    {receivable.sourceWarnings.map((warning) => (
                      <li key={warning}>{labels.warning(warning)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {entry && allocation && (
              <p>
                <Trans>Monthly allocation unmatched:</Trans>{' '}
                {display(allocation.remainingMatchMicros, entry.currency)} ·{' '}
                {allocation.projectName ?? t`Company / unassigned`} ·{' '}
                {entry.month}
              </p>
            )}
            {requiresAcknowledgement && (
              <label>
                <input
                  name="acknowledgeUnassignedCash"
                  type="checkbox"
                  checked={values.acknowledgeUnassignedCash}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      acknowledgeUnassignedCash: event.target.checked,
                    })
                  }
                />
                <Trans>
                  I confirm this unassigned payment belongs to the selected
                  client.
                </Trans>
              </label>
            )}
            {requirements.length > 0 && (
              <ul aria-label={t`Matching requirements`}>
                {requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            )}
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={
              busy ||
              saving ||
              readOnly ||
              stale ||
              !draft.dirty ||
              requirements.length > 0
            }
          >
            {settlement ? t`Apply to invoice` : t`Save monthly match`}
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy || saving}
            onClick={() => requestAction(onCancel)}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
