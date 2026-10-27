import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinancePeriodChangeInput } from '~/generated-metadata/graphql';
import { type FinancePeriodSnapshot } from '@/delivery/finance/finance-period.types';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinancePeriodReviewFormProps = {
  snapshot: FinancePeriodSnapshot;
  intent: 'LOCK' | 'REOPEN';
  busy: boolean;
  readOnly: boolean;
  checking?: boolean;
  onSave: (input: DeliveryFinancePeriodChangeInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};

export const FinancePeriodReviewForm = ({
  snapshot,
  intent,
  busy,
  readOnly,
  checking = false,
  onSave,
  onCancel,
  onReload,
}: FinancePeriodReviewFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [opened] = useState(() => ({
    revision: snapshot.period.revision,
    token: snapshot.previewToken,
    month: snapshot.period.month,
  }));
  const [values, setValues] = useState({ reason: '', acknowledge: false });
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
      form?.querySelector<HTMLTextAreaElement>('[name="reason"]')?.focus();
    },
    [registerForm],
  );
  const locking = intent === 'LOCK';
  const stale =
    opened.revision !== snapshot.period.revision ||
    opened.token !== snapshot.previewToken ||
    opened.month !== snapshot.period.month;
  const allowed = locking
    ? snapshot.canLock &&
      snapshot.period.status === 'OPEN' &&
      snapshot.blockerCount === 0
    : snapshot.canReopen && snapshot.period.status === 'LOCKED';
  const canSave =
    allowed &&
    !readOnly &&
    !checking &&
    !stale &&
    draft.dirty &&
    values.reason.trim().length > 0 &&
    (!locking || values.acknowledge);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        month: opened.month,
        revision: opened.revision,
        expectedPreviewToken: opened.token,
        status: locking ? 'LOCKED' : 'OPEN',
        reason: values.reason.trim(),
        acknowledgeLimitations: locking && values.acknowledge,
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The month’s status change was not confirmed. Your reason and review are kept; refresh the preview before retrying.`,
        );
    } catch {
      setError(
        t`The month’s status could not be changed. Your reason and review are kept.`,
      );
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
        locking
          ? t`Lock monthly results review`
          : t`Reopen monthly results review`
      }
    >
      <StyledDeliveryStack>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your reason and review are kept read-only.
            </Trans>
          </p>
        )}
        {!allowed && (
          <p role="status">
            {locking && snapshot.blockerCount > 0
              ? t`Resolve every blocking draft or correction before locking this month.`
              : t`This review no longer matches the month’s current status. Close it and review the current month before another change.`}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={busy || saving || stale || readOnly || checking}>
          <StyledDeliveryStack>
            <p>
              {locking
                ? t`Lock the recorded results for every currency in this month. Recognition changes will require a reasoned reopening.`
                : t`Reopening allows recognized entries and totals to change. Make the intended corrections, then review and lock the month again.`}
            </p>
            <label>
              {locking ? t`Reason for locking` : t`Reason for reopening`}
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
            {locking && (
              <label>
                <input
                  type="checkbox"
                  name="acknowledge"
                  checked={values.acknowledge}
                  onChange={(event) =>
                    setValues({ ...values, acknowledge: event.target.checked })
                  }
                />
                <Trans>
                  I reviewed the recorded totals and limitations. This protects
                  management results; it is not an accounting or tax close.
                </Trans>
              </label>
            )}
            <StyledDeliveryRow>
              <StyledDeliveryButton
                type="submit"
                data-primary="true"
                disabled={!canSave}
              >
                {locking ? t`Lock monthly results` : t`Reopen monthly results`}
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel month review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
