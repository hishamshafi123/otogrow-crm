import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryFinanceForecastRealizeInput } from '~/generated-metadata/graphql';
import {
  type FinanceForecastItem,
  type FinanceForecastSource,
} from '@/delivery/finance/finance-forecast.types';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceForecastRealizationFormProps = {
  item: FinanceForecastItem;
  cash: FinanceForecastSource;
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceForecastRealizeInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const FinanceForecastRealizationForm = ({
  item,
  cash,
  busy,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceForecastRealizationFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const snapshot = `${item.id}:${item.reviewToken}:${cash.id}:${cash.sourceReviewToken}`;
  const [opened] = useState(snapshot);
  const [values, setValues] = useState({ amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const stale = opened !== snapshot;
  const itemRemaining = item.remainingMicros;
  const cashRemaining = cash.remainingMicros;
  const maximum =
    isDefined(itemRemaining) &&
    isDefined(cashRemaining) &&
    isFinanceAmountMicrosWithinLimit(itemRemaining) &&
    isFinanceAmountMicrosWithinLimit(cashRemaining)
      ? BigInt(itemRemaining) < BigInt(cashRemaining)
        ? itemRemaining
        : cashRemaining
      : null;
  const amountMicros = parseFinanceAmountMicros(values.amount);
  const valid =
    maximum !== null &&
    amountMicros !== null &&
    isFinanceAmountMicrosWithinLimit(amountMicros) &&
    BigInt(amountMicros) > 0n &&
    BigInt(amountMicros) <= BigInt(maximum);
  const itemReviewed =
    item.ownerEligible &&
    (item.sourceType === 'MANUAL' ||
      (isDefined(item.sourceReviewToken) &&
        !item.warnings.some((warning) =>
          ['SOURCE_CHANGED', 'MISSING_SOURCE'].includes(warning),
        )));
  const canSave =
    !readOnly &&
    !stale &&
    cash.eligible &&
    itemReviewed &&
    item.kind === 'OUTFLOW' &&
    item.status === 'ACTIVE' &&
    cash.currency === item.currency &&
    draft.dirty &&
    valid &&
    values.note.trim().length > 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving || amountMicros === null) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        itemId: item.id,
        cashId: cash.id,
        amountMicros,
        expectedCashReviewToken: cash.sourceReviewToken,
        expectedItemReviewToken: item.reviewToken,
        note: values.note.trim(),
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The payment application was not confirmed. Your amount and note are kept.`,
        );
    } catch {
      setError(
        t`The payment could not be applied. Your amount and note are kept.`,
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Apply actual payment to expectation`}
    >
      <StyledDeliveryStack>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {readOnly && (
          <p role="status">
            <Trans>Editing is unavailable. Your draft is kept read-only.</Trans>
          </p>
        )}
        <p>
          {cash.title} → {item.title}
        </p>
        <p>
          {t`Unapplied actual payment`}:{' '}
          {!isDefined(cashRemaining)
            ? t`Not confirmed`
            : formatFinanceAmountMicros(cashRemaining, cash.currency)}{' '}
          · {t`Remaining expected payment`}:{' '}
          {!isDefined(itemRemaining)
            ? t`Not confirmed`
            : formatFinanceAmountMicros(itemRemaining, item.currency)}
        </p>
        <small>
          <Trans>
            Actual cash was already recorded. This only reduces the remaining
            expectation; monthly matching stays separate.
          </Trans>
        </small>
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <label>
              <Trans>Amount to apply</Trans>
              <input
                name="amount"
                inputMode="decimal"
                required
                value={values.amount}
                onChange={(event) =>
                  setValues({ ...values, amount: event.target.value })
                }
              />
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={maximum === null || maximum === '0'}
              onClick={() =>
                maximum !== null &&
                setValues({
                  ...values,
                  amount: financeAmountMicrosToDecimal(maximum),
                })
              }
            >
              <Trans>Use the remaining applicable amount</Trans>
            </StyledDeliveryButton>
            <label>
              <Trans>Payment application note</Trans>
              <textarea
                name="note"
                required
                maxLength={2000}
                value={values.note}
                onChange={(event) =>
                  setValues({ ...values, note: event.target.value })
                }
              />
            </label>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave}
            >
              <Trans>Apply recorded payment</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel payment application</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
