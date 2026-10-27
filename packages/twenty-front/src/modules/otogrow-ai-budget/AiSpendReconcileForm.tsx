import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledAiBudgetActions } from '@/otogrow-ai-budget/aiBudgetStyles';
import { type AiSpend } from '@/otogrow-ai-budget/aiBudget.types';
import { type OtogrowAiSpendReconcileInput } from '~/generated-metadata/graphql';

type AiSpendReconcileFormProps = {
  spend: AiSpend;
  busy: boolean;
  save: (input: OtogrowAiSpendReconcileInput) => Promise<boolean>;
  close: () => void;
};
export const AiSpendReconcileForm = ({
  spend,
  busy,
  save,
  close,
}: AiSpendReconcileFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const draft = useDeliveryDraft({
    initialValues: { actualUsd: '', evidenceReference: '', reason: '' },
    revision: spend.revision,
    busy,
  });
  const values = draft.values;
  const complete = Boolean(
    values.actualUsd.trim() &&
    values.evidenceReference.trim() &&
    values.reason.trim(),
  );
  return (
    <form
      aria-label={t`Resolve uncertain charge`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          draft.saving ||
          draft.stale ||
          !complete ||
          spend.state !== 'UNCERTAIN'
        )
          return;
        draft.setSaving(true);
        try {
          if (
            await save({
              ...values,
              spendId: spend.id,
              revision: draft.revision,
            })
          ) {
            draft.markSaved();
            close();
          }
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Resolve uncertain charge</Trans>
        </h3>
        <p>
          <Trans>
            Check the provider's usage record or invoice for this request. A
            failed result does not mean the provider charged nothing. The
            confirmed amount replaces the hold and stays in the financial
            history.
          </Trans>
        </p>
        <small>{t`Run reference: ${spend.sourceRunId}`}</small>
        {draft.stale && (
          <DeliveryDraftConflict busy={draft.saving} onReload={draft.reload} />
        )}
        <fieldset disabled={draft.saving}>
          <StyledDeliveryStack>
            <label>
              <Trans>Confirmed charge (USD)</Trans>
              <input
                required
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,6})?"
                value={values.actualUsd}
                onChange={(event) =>
                  draft.update({ ...values, actualUsd: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Provider evidence reference</Trans>
              <input
                required
                value={values.evidenceReference}
                onChange={(event) =>
                  draft.update({
                    ...values,
                    evidenceReference: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <Trans>Reason for reconciliation</Trans>
              <textarea
                required
                value={values.reason}
                onChange={(event) =>
                  draft.update({ ...values, reason: event.target.value })
                }
              />
            </label>
            <StyledAiBudgetActions>
              <StyledDeliveryButton
                type="submit"
                data-primary="true"
                disabled={
                  draft.stale || !complete || spend.state !== 'UNCERTAIN'
                }
              >
                <Trans>Record confirmed charge</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() => requestAction(close)}
              >
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
            </StyledAiBudgetActions>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryStack>
    </form>
  );
};
