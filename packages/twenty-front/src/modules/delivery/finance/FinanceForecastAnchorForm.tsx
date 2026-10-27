import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { type DeliveryFinanceForecastAnchorInput } from '~/generated-metadata/graphql';
import { type FinanceForecastAnchor } from '@/delivery/finance/finance-forecast.types';
import { financeAmountMicrosToDecimal } from '@/delivery/finance/finance-money';
import {
  isFinanceAnchorAmountMicrosWithinLimit,
  parseFinanceSignedAmountMicros,
} from '@/delivery/finance/finance-forecast-money';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceForecastAnchorFormProps = {
  initial: FinanceForecastAnchor | null;
  currency: string;
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceForecastAnchorInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const FinanceForecastAnchorForm = ({
  initial,
  currency,
  busy,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceForecastAnchorFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [revision] = useState(initial?.revision ?? 0);
  const [values, setValues] = useState(() => ({
    amount: initial ? financeAmountMicrosToDecimal(initial.amountMicros) : '',
    closingDate: initial?.closingDate ?? '',
    timezone:
      initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    note: initial?.note ?? '',
    evidenceUrl: initial?.evidenceUrl ?? '',
    reason: '',
    coverage: false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const stale = revision !== (initial?.revision ?? 0);
  const amountMicros = parseFinanceSignedAmountMicros(values.amount);
  const evidenceValid =
    !values.evidenceUrl.trim() ||
    /^https?:\/\//i.test(values.evidenceUrl.trim());
  const canSave =
    !readOnly &&
    !stale &&
    draft.dirty &&
    amountMicros !== null &&
    isFinanceAnchorAmountMicrosWithinLimit(amountMicros) &&
    /^\d{4}-\d{2}-\d{2}$/.test(values.closingDate) &&
    Boolean(getValidTimeZoneOrUndefined(values.timezone.trim())) &&
    values.note.trim().length > 0 &&
    (!initial || values.reason.trim().length > 0) &&
    evidenceValid &&
    values.coverage;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving || amountMicros === null) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        revision,
        currency,
        amountMicros,
        closingDate: values.closingDate,
        timezone: values.timezone.trim(),
        note: values.note.trim(),
        evidenceUrl: values.evidenceUrl.trim() || null,
        reason: initial
          ? values.reason.trim()
          : values.note.trim().slice(0, 2000),
        acknowledgeCoverage: values.coverage,
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`Starting cash was not confirmed. Your balance and notes are kept.`,
        );
    } catch {
      setError(
        t`Starting cash could not be saved. Your balance and notes are kept.`,
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
      aria-label={t`Confirm starting cash`}
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
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <label>
              {t`Closing cash balance (${currency})`}
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
            <small>
              <Trans>
                Enter the confirmed balance, including an explicit zero or
                negative balance.
              </Trans>
            </small>
            <label>
              <Trans>Closing through date</Trans>
              <input
                name="closingDate"
                type="date"
                required
                value={values.closingDate}
                onChange={(event) =>
                  setValues({ ...values, closingDate: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Reporting time zone</Trans>
              <input
                name="timezone"
                required
                maxLength={100}
                placeholder="Asia/Makassar"
                value={values.timezone}
                onChange={(event) =>
                  setValues({ ...values, timezone: event.target.value })
                }
              />
            </label>
            <small>
              <Trans>
                Choose a completed closing day before today in this time zone.
                Subsequent recorded cash movements are added once.
              </Trans>
            </small>
            <label>
              <Trans>How you confirmed this balance</Trans>
              <textarea
                name="note"
                required
                maxLength={12000}
                value={values.note}
                onChange={(event) =>
                  setValues({ ...values, note: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Balance evidence link</Trans>
              <input
                name="evidenceUrl"
                type="url"
                maxLength={2000}
                value={values.evidenceUrl}
                onChange={(event) =>
                  setValues({ ...values, evidenceUrl: event.target.value })
                }
              />
            </label>
            {initial && (
              <label>
                <Trans>Reason for replacing starting cash</Trans>
                <textarea
                  name="reason"
                  required
                  maxLength={2000}
                  value={values.reason}
                  onChange={(event) =>
                    setValues({ ...values, reason: event.target.value })
                  }
                />
              </label>
            )}
            <label>
              <input
                name="coverage"
                type="checkbox"
                checked={values.coverage}
                onChange={(event) =>
                  setValues({ ...values, coverage: event.target.checked })
                }
              />
              <Trans>
                I confirmed this balance includes all cash through the closing
                date. Any later-entered records dated through that day are
                treated as already included.
              </Trans>
            </label>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave}
            >
              <Trans>Confirm starting cash</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel balance review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
