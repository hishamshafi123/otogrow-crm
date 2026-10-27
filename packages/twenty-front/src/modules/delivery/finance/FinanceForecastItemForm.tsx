import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryFinanceForecastItemInput } from '~/generated-metadata/graphql';
import {
  type FinanceForecastItem,
  type FinanceForecastSnapshot,
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

type FinanceForecastItemFormProps = {
  initial: FinanceForecastItem | null;
  source: FinanceForecastSource | null;
  owners: FinanceForecastSnapshot['owners'];
  currency: string;
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceForecastItemInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
export const FinanceForecastItemForm = ({
  initial,
  source,
  owners,
  currency,
  busy,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceForecastItemFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const sourceType = initial?.sourceType ?? source?.sourceType ?? 'MANUAL';
  const collection = sourceType === 'RECEIVABLE';
  const token = source?.sourceReviewToken ?? initial?.sourceReviewToken ?? null;
  const [commandId] = useState(() => crypto.randomUUID());
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [opened] = useState(() => ({
    revision: initial?.revision ?? 0,
    token,
  }));
  const [values, setValues] = useState(() => ({
    title: initial?.title ?? source?.title ?? '',
    amount: financeAmountMicrosToDecimal(
      initial?.amountMicros ?? source?.amountMicros ?? '',
    ),
    expectedDate: initial?.expectedDate ?? source?.suggestedDate ?? '',
    ownerId: initial?.ownerId ?? '',
    nextActionDate: initial?.nextActionDate ?? '',
    note: initial?.note ?? '',
    reason: '',
    reviewed: false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const stale =
    opened.revision !== (initial?.revision ?? 0) || opened.token !== token;
  const collectionRemaining = isDefined(source)
    ? (source.remainingMicros ?? null)
    : (initial?.remainingMicros ?? null);
  const amountMicros = collection
    ? collectionRemaining
    : parseFinanceAmountMicros(values.amount);
  const ownerEligible = owners.some((owner) => owner.id === values.ownerId);
  const invoiceNeedsCorrection =
    sourceType === 'RECEIVABLE' &&
    initial?.warnings.some(
      (warning) =>
        ![
          'OWNER_INELIGIBLE',
          'REPORTING_DATE_NOT_SET',
          'UNDATED_EXPECTATION',
          'OVERDUE_EXPECTATION',
          'NEXT_ACTION_OVERDUE',
        ].includes(warning),
    );
  const sourceAvailable =
    sourceType === 'MANUAL' ||
    (Boolean(token) &&
      !initial?.warnings.includes('MISSING_SOURCE') &&
      !invoiceNeedsCorrection &&
      (!source ||
        ((source.eligible ||
          (initial?.sourceType === 'PLAN' &&
            source.warnings.every((warning) =>
              ['PLAN_INACTIVE', 'PLAN_OUTSIDE_MONTH'].includes(warning),
            ))) &&
          (!source.occurrenceItemId ||
            source.occurrenceItemId === initial?.id))));
  const amountValid =
    amountMicros !== null &&
    isFinanceAmountMicrosWithinLimit(amountMicros) &&
    (!collection || BigInt(amountMicros) > 0n) &&
    (collection ||
      BigInt(amountMicros) >= BigInt(initial?.appliedMicros ?? '0'));
  const canSave =
    !readOnly &&
    !stale &&
    sourceAvailable &&
    draft.dirty &&
    amountValid &&
    ownerEligible &&
    values.title.trim().length > 0 &&
    values.note.trim().length > 0 &&
    values.reason.trim().length > 0 &&
    validDate(values.nextActionDate) &&
    (validDate(values.expectedDate) || (!collection && !values.expectedDate)) &&
    values.reviewed;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving || amountMicros === null) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        commandId,
        id,
        revision: opened.revision,
        status: 'ACTIVE',
        sourceType,
        sourceId: initial?.sourceId ?? source?.id ?? null,
        planMonth: initial?.planMonth ?? source?.planMonth ?? null,
        currency,
        title: values.title.trim(),
        amountMicros,
        expectedDate: values.expectedDate || null,
        ownerId: values.ownerId,
        nextActionDate: values.nextActionDate,
        note: values.note.trim(),
        expectedSourceReviewToken: opened.token,
        reason: values.reason.trim(),
        acknowledgeSourceWarnings: values.reviewed,
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The expectation was not confirmed. Your dates, owner and notes are kept.`,
        );
    } catch {
      setError(t`The expectation could not be saved. Your draft is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={
        collection ? t`Schedule invoice collection` : t`Review expected payment`
      }
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
        {!owners.length && (
          <p role="status">
            <Trans>
              No active finance owner is available. An administrator must give
              an owner Finance view access before this expectation can be saved.
            </Trans>
          </p>
        )}
        {!sourceAvailable && (
          <p role="status">
            {invoiceNeedsCorrection
              ? t`The invoice’s recorded source needs correction. Review its original invoice and payment records; cancel this expectation and schedule the corrected invoice if needed.`
              : t`The source is unavailable or already has an expectation. Review the source or existing expectation before saving.`}
          </p>
        )}
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <label>
              <Trans>Expectation title</Trans>
              <input
                name="title"
                required
                maxLength={240}
                value={values.title}
                onChange={(event) =>
                  setValues({ ...values, title: event.target.value })
                }
              />
            </label>
            {collection ? (
              <p>
                {t`Full remaining invoice balance`}:{' '}
                {collectionRemaining === null
                  ? t`Not confirmed`
                  : formatFinanceAmountMicros(collectionRemaining, currency)}
                <br />
                <small>
                  <Trans>
                    Linked receipts update this amount. This schedule does not
                    record a payment.
                  </Trans>
                </small>
              </p>
            ) : (
              <label>
                {t`Expected payment amount (${currency})`}
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
            )}
            {!collection && initial && (
              <small>
                {t`Already applied actual payments`}:{' '}
                {formatFinanceAmountMicros(initial.appliedMicros, currency)}
              </small>
            )}
            <label>
              {collection
                ? t`Expected collection date`
                : t`Expected payment date`}
              <input
                name="expectedDate"
                type="date"
                required={collection}
                value={values.expectedDate}
                onChange={(event) =>
                  setValues({ ...values, expectedDate: event.target.value })
                }
              />
            </label>
            {!collection && (
              <small>
                <Trans>
                  An undated expectation stays in the follow-up list and is
                  excluded from the dated scenario.
                </Trans>
              </small>
            )}
            {(source?.dueDate ?? initial?.contractualDueDate) && (
              <small>
                {t`Contractual due date`}:{' '}
                {source?.dueDate ?? initial?.contractualDueDate}
              </small>
            )}
            <label>
              <Trans>Responsible finance owner</Trans>
              <select
                name="ownerId"
                required
                value={values.ownerId}
                onChange={(event) =>
                  setValues({ ...values, ownerId: event.target.value })
                }
              >
                <option value="">{t`Choose an owner`}</option>
                {!ownerEligible && initial?.ownerId === values.ownerId && (
                  <option value={initial.ownerId} disabled>
                    {initial.ownerName} · {t`Needs reassignment`}
                  </option>
                )}
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Next action date</Trans>
              <input
                name="nextActionDate"
                type="date"
                required
                value={values.nextActionDate}
                onChange={(event) =>
                  setValues({ ...values, nextActionDate: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Follow-up note</Trans>
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
              <Trans>Reason for this review</Trans>
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
            <label>
              <input
                name="reviewed"
                type="checkbox"
                checked={values.reviewed}
                onChange={(event) =>
                  setValues({ ...values, reviewed: event.target.checked })
                }
              />
              <Trans>
                I reviewed the source, expected date, owner and next action.
                This is an expectation, not an actual payment.
              </Trans>
            </label>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave}
            >
              {collection
                ? t`Save expected collection`
                : t`Save expected payment`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel expectation review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
