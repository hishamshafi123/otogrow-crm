import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceExportImportStatusInput } from '~/generated-metadata/graphql';
import { type FinanceExportBatch } from '@/delivery/finance/export/finance-export.types';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportImportFormProps = {
  batch: FinanceExportBatch;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceExportImportStatusInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const FinanceExportImportForm = ({
  batch,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceExportImportFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [commandId] = useState(() => crypto.randomUUID());
  const [opened] = useState({
    revision: batch.revision,
    status: batch.importStatus,
  });
  const [values, setValues] = useState({
    reference: batch.importReference ?? '',
    evidenceUrl: batch.importEvidenceUrl ?? '',
    reason: '',
    acknowledge: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({ extraValues: values, busy: saving });
  const reversing = opened.status === 'CONFIRMED';
  const stale =
    opened.revision !== batch.revision || opened.status !== batch.importStatus;
  const valid =
    !readOnly &&
    !stale &&
    Boolean(values.reason.trim()) &&
    values.acknowledge &&
    (reversing || Boolean(values.reference.trim())) &&
    (!values.evidenceUrl || /^https?:\/\//i.test(values.evidenceUrl));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        commandId,
        batchId: batch.id,
        revision: opened.revision,
        status: reversing ? 'REVERSED' : 'CONFIRMED',
        reference: values.reference.trim() || null,
        evidenceUrl: values.evidenceUrl.trim() || null,
        reason: values.reason.trim(),
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The manual import status was not confirmed. Your evidence and reason are kept.`,
        );
    } catch {
      setError(
        t`The manual import status could not be saved. Your draft is kept.`,
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
      aria-label={
        reversing
          ? t`Reverse manual import confirmation`
          : t`Record manual accounting import`
      }
    >
      <StyledDeliveryStack>
        <h3>
          {reversing
            ? t`Reverse manual import confirmation`
            : t`Record a manual import`}
        </h3>
        <p>
          {reversing
            ? t`This changes the recorded confirmation only. It does not undo transactions in the external accounting system.`
            : t`Record this only after the accountant has imported this exact batch. Downloading alone is not an import.`}
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={saving || readOnly || stale}>
          <StyledDeliveryStack>
            <label>
              <Trans>External import reference</Trans>
              <input
                name="reference"
                required={!reversing}
                maxLength={500}
                value={values.reference}
                onChange={(event) =>
                  setValues({ ...values, reference: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Import evidence link (optional)</Trans>
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
            <label>
              <Trans>Reason for import status change</Trans>
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
                name="acknowledge"
                type="checkbox"
                checked={values.acknowledge}
                onChange={(event) =>
                  setValues({ ...values, acknowledge: event.target.checked })
                }
              />
              {reversing
                ? t`I will coordinate any external correction separately.`
                : t`I have confirmation that this exact batch was manually imported.`}
            </label>
            <StyledDeliveryButton
              type="submit"
              disabled={!valid}
              data-primary="true"
            >
              {reversing
                ? t`Reverse import confirmation`
                : t`Mark manually imported`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel import status change</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
