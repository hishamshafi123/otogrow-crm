import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type EscalationConfirmFormProps<TInput> = {
  title: string;
  description: string;
  confirmLabel: string;
  submitLabel: string;
  signature: string;
  identity: string;
  readOnly: boolean;
  canConfirm?: boolean;
  adoptionRequired?: boolean;
  buildInput: (commandId: string, reason: string, adopt: boolean) => TInput;
  onSave: (input: TInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const EscalationConfirmForm = <TInput,>({
  title,
  description,
  confirmLabel,
  submitLabel,
  signature,
  identity,
  readOnly,
  canConfirm = true,
  adoptionRequired = false,
  buildInput,
  onSave,
  onCancel,
  onReload,
}: EscalationConfirmFormProps<TInput>) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [commandId] = useState(() => crypto.randomUUID());
  const [opened] = useState({ signature, adoptionRequired });
  const [values, setValues] = useState({
    reason: '',
    confirm: false,
    adopt: false,
  });
  const [attempt, setAttempt] = useState<{
    input: TInput;
    identity: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, attempt },
    busy: saving,
  });
  const stale = opened.signature !== signature;
  const canSave =
    !readOnly &&
    !stale &&
    !attempt &&
    canConfirm &&
    Boolean(values.reason.trim()) &&
    values.confirm &&
    (!opened.adoptionRequired || values.adopt);
  const send = async (request: { input: TInput; identity: string }) => {
    if (saving || readOnly || request.identity !== identity) return;
    setSaving(true);
    setAttempt(request);
    setError('');
    try {
      if (await onSave(request.input)) {
        setAttempt(null);
        draft.markSaved({ values, attempt: null });
      } else
        setError(
          t`The result was not confirmed. Check the earlier request before starting another change.`,
        );
    } catch {
      setError(
        t`The response was not confirmed. Your original request is kept.`,
      );
    } finally {
      setSaving(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSave)
      await send({
        input: buildInput(
          commandId,
          values.reason.trim(),
          opened.adoptionRequired && values.adopt,
        ),
        identity,
      });
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={title}
    >
      <StyledDeliveryStack>
        <h3>{title}</h3>
        <p>{description}</p>
        {stale && (
          <DeliveryDraftConflict
            busy={saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {attempt && (
          <>
            <p role="status">
              <Trans>
                An earlier request may already have succeeded. Checking it uses
                the same request ID and values.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={saving || readOnly || attempt.identity !== identity}
              onClick={() => void send(attempt)}
            >
              <Trans>Check earlier request</Trans>
            </StyledDeliveryButton>
          </>
        )}
        <fieldset disabled={saving || readOnly || stale || Boolean(attempt)}>
          <StyledDeliveryStack>
            <label>
              <Trans>Reason for this change</Trans>
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
                name="confirm"
                type="checkbox"
                checked={values.confirm}
                onChange={(event) =>
                  setValues({ ...values, confirm: event.target.checked })
                }
              />
              {confirmLabel}
            </label>
            {opened.adoptionRequired && (
              <label>
                <input
                  name="adopt"
                  type="checkbox"
                  checked={values.adopt}
                  onChange={(event) =>
                    setValues({ ...values, adopt: event.target.checked })
                  }
                />
                <Trans>
                  Adopt configurable founder routing and stop legacy founder
                  alert pings. Employee reminders stay separate.
                </Trans>
              </label>
            )}
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave}
            >
              {submitLabel}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel this change</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
