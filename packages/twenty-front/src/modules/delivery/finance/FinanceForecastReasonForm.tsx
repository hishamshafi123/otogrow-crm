import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceForecastReasonFormProps = {
  label: string;
  buttonLabel: string;
  snapshot: string;
  busy: boolean;
  readOnly: boolean;
  onConfirm: (reason: string, commandId: string) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const FinanceForecastReasonForm = ({
  label,
  buttonLabel,
  snapshot,
  busy,
  readOnly,
  onConfirm,
  onCancel,
  onReload,
}: FinanceForecastReasonFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [opened] = useState(snapshot);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: reason,
    busy: busy || saving,
  });
  const stale = opened !== snapshot;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saving || stale || readOnly || !reason.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (await onConfirm(reason.trim(), id)) draft.markSaved(reason);
      else setError(t`The change was not confirmed. Your reason is kept.`);
    } catch {
      setError(t`The change could not be saved. Your reason is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={label}
    >
      <StyledDeliveryStack>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <label>
              {label}
              <textarea
                name="reason"
                required
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <StyledDeliveryButton type="submit" disabled={!reason.trim()}>
              {buttonLabel}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel change</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
