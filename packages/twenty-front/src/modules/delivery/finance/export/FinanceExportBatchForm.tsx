import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryFinanceExportBatchInput,
  type DeliveryFinanceExportPreviewInput,
} from '~/generated-metadata/graphql';
import { type FinanceExportPreview } from '@/delivery/finance/export/finance-export.types';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportBatchFormProps = {
  snapshot: FinanceExportPreview;
  selection: DeliveryFinanceExportPreviewInput;
  identity: string;
  readOnly: boolean;
  checking: boolean;
  previewAvailable?: boolean;
  onSave: (input: DeliveryFinanceExportBatchInput) => Promise<boolean>;
  onReload: () => void;
  onCancel: () => void;
};
export const FinanceExportBatchForm = ({
  snapshot,
  selection,
  identity,
  readOnly,
  checking,
  previewAvailable = true,
  onSave,
  onReload,
  onCancel,
}: FinanceExportBatchFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [opened] = useState({
    token: snapshot.previewToken,
    profileRevision: snapshot.profile.revision,
  });
  const [values, setValues] = useState({ acknowledge: false, reason: '' });
  const [attempt, setAttempt] = useState<{
    input: DeliveryFinanceExportBatchInput;
    identity: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, attempt },
    busy: saving,
  });
  const stale =
    opened.token !== snapshot.previewToken ||
    opened.profileRevision !== snapshot.profile.revision;
  const repeated = snapshot.totals.repeatedSourceCount > 0;
  const canSave =
    !readOnly &&
    !checking &&
    previewAvailable &&
    !attempt &&
    !stale &&
    snapshot.canCreate &&
    (!repeated || (values.acknowledge && Boolean(values.reason.trim())));
  const send = async (request: {
    input: DeliveryFinanceExportBatchInput;
    identity: string;
  }) => {
    if (readOnly || saving || request.identity !== identity) return;
    setAttempt(request);
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(request.input);
      if (saved) {
        setAttempt(null);
        draft.markSaved({ values, attempt: null });
      } else
        setError(
          t`The batch result is unconfirmed. Check the earlier request before preparing another batch.`,
        );
    } catch {
      setError(
        t`The batch response was not confirmed. Your original request is kept for a safe retry.`,
      );
    } finally {
      setSaving(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || saving) return;
    await send({
      identity,
      input: {
        id,
        profileId: selection.profileId,
        currency: selection.currency,
        dateFrom: selection.dateFrom,
        dateTo: selection.dateTo,
        serviceMonth: selection.serviceMonth,
        accountingDate: selection.accountingDate,
        expectedPreviewToken: opened.token,
        acknowledgeRepeatedSources: repeated && values.acknowledge,
        reexportReason: repeated ? values.reason.trim() : null,
      },
    });
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Save reviewed export batch`}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Save an immutable batch</Trans>
        </h3>
        <p>
          <Trans>
            This saves the reviewed CSV and source versions. It does not send or
            import transactions into an accounting system.
          </Trans>
        </p>
        {previewAvailable && stale && (
          <DeliveryDraftConflict
            busy={saving || readOnly || checking}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {attempt && (
          <section aria-label={t`Earlier batch request recovery`}>
            <p role="status">
              <Trans>
                An earlier create request may already have saved a batch.
                Checking it resends the exact original request and cannot create
                a second batch ID.
              </Trans>
            </p>
            <p>
              {t`Request ID`}: {attempt.input.id}
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={saving || readOnly || attempt.identity !== identity}
              onClick={() => void send(attempt)}
            >
              <Trans>Check earlier batch request</Trans>
            </StyledDeliveryButton>
            <p>
              <Trans>
                Starting a fresh review discards this recovery request. Check
                saved batch history first if its result remains uncertain.
              </Trans>
            </p>
          </section>
        )}
        <fieldset
          hidden={!previewAvailable}
          disabled={
            saving ||
            readOnly ||
            checking ||
            !previewAvailable ||
            stale ||
            Boolean(attempt)
          }
        >
          {repeated && (
            <StyledDeliveryStack>
              <p role="status">{t`Financial sources already handed off in earlier batches: ${snapshot.totals.repeatedSourceCount}`}</p>
              <label>
                <input
                  name="acknowledge"
                  type="checkbox"
                  checked={values.acknowledge}
                  onChange={(event) =>
                    setValues({ ...values, acknowledge: event.target.checked })
                  }
                />
                <Trans>
                  I reviewed earlier batches and will coordinate any duplicate
                  or correcting import with the accountant.
                </Trans>
              </label>
              <label>
                <Trans>Reason for re-export</Trans>
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
            </StyledDeliveryStack>
          )}
          {!snapshot.canCreate && (
            <p role="alert">
              <Trans>Resolve the export errors before creating a batch.</Trans>
            </p>
          )}
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={!canSave}
          >
            <Trans>Create export batch</Trans>
          </StyledDeliveryButton>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Change source selection</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
