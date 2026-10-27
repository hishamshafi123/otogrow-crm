import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledAiBudgetActions } from '@/otogrow-ai-budget/aiBudgetStyles';
import {
  type AiBudget,
  type AiBudgetSnapshot,
} from '@/otogrow-ai-budget/aiBudget.types';
import { type OtogrowAiBudgetSaveInput } from '~/generated-metadata/graphql';

type AiBudgetLimitFormProps = {
  budget?: AiBudget;
  snapshot: AiBudgetSnapshot;
  busy: boolean;
  save: (input: OtogrowAiBudgetSaveInput) => Promise<boolean>;
  close: () => void;
};
export const AiBudgetLimitForm = ({
  budget,
  snapshot,
  busy,
  save,
  close,
}: AiBudgetLimitFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const draft = useDeliveryDraft({
    initialValues: {
      scope:
        budget?.scope ??
        (snapshot.budgets.some((item) => item.scope === 'WORKSPACE')
          ? 'CLIENT'
          : 'WORKSPACE'),
      scopeId: budget?.scopeId ?? '',
      capUsd: budget?.capUsd ?? '',
      openingSpentUsd: budget?.openingSpentUsd ?? '',
      enabled: budget?.enabled ?? false,
      confirmOpeningBalance: false,
    },
    revision: budget?.revision ?? 0,
    busy,
  });
  const values = draft.values;
  const complete =
    Boolean(values.capUsd.trim()) &&
    (values.scope === 'WORKSPACE' || Boolean(values.scopeId)) &&
    (Boolean(budget) ||
      (Boolean(values.openingSpentUsd.trim()) && values.confirmOpeningBalance));
  const update = (next: Partial<typeof values>) =>
    draft.update({ ...values, ...next });
  const options = values.scope === 'CLIENT' ? snapshot.clients : snapshot.tasks;
  return (
    <form
      aria-label={budget ? t`Edit AI limit` : t`Add AI limit`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (draft.saving || draft.stale || !complete) return;
        draft.setSaving(true);
        try {
          if (
            await save({
              ...values,
              scopeId:
                values.scope === 'WORKSPACE'
                  ? snapshot.workspaceId
                  : values.scopeId,
              revision: draft.revision,
              openingSpentUsd: budget ? undefined : values.openingSpentUsd,
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
          {budget ? t`Edit ${budget.scopeName} limit` : t`Add spending limit`}
        </h3>
        <p>
          <Trans>
            Limits are cumulative, in USD. Saving a limit never resets recorded
            spending. A disabled limit blocks paid requests in its scope.
          </Trans>
        </p>
        {draft.stale && (
          <DeliveryDraftConflict busy={draft.saving} onReload={draft.reload} />
        )}
        <fieldset disabled={draft.saving}>
          <StyledDeliveryStack>
            <StyledDeliveryGrid>
              <label>
                <Trans>Applies to</Trans>
                <select
                  value={values.scope}
                  disabled={Boolean(budget)}
                  onChange={(event) =>
                    update({ scope: event.target.value, scopeId: '' })
                  }
                >
                  <option
                    value="WORKSPACE"
                    disabled={
                      !budget &&
                      snapshot.budgets.some(
                        (item) => item.scope === 'WORKSPACE',
                      )
                    }
                  >
                    <Trans>Whole workspace</Trans>
                  </option>
                  <option value="CLIENT">
                    <Trans>One client</Trans>
                  </option>
                  <option value="TASK">
                    <Trans>One task</Trans>
                  </option>
                </select>
              </label>
              {values.scope !== 'WORKSPACE' && (
                <label>
                  {values.scope === 'CLIENT' ? t`Client` : t`Task`}
                  <select
                    required
                    value={values.scopeId}
                    disabled={Boolean(budget)}
                    onChange={(event) =>
                      update({ scopeId: event.target.value })
                    }
                  >
                    <option value="">
                      <Trans>Select…</Trans>
                    </option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <Trans>Total limit (USD)</Trans>
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,6})?"
                  value={values.capUsd}
                  onChange={(event) => update({ capUsd: event.target.value })}
                />
              </label>
              {!budget && (
                <label>
                  <Trans>Previously spent (USD)</Trans>
                  <input
                    required
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,6})?"
                    value={values.openingSpentUsd}
                    onChange={(event) =>
                      update({ openingSpentUsd: event.target.value })
                    }
                  />
                  <small>
                    <Trans>
                      Enter a verified opening amount, including 0 if none. It
                      cannot be reset later.
                    </Trans>
                  </small>
                </label>
              )}
            </StyledDeliveryGrid>
            {!budget && (
              <label>
                <input
                  type="checkbox"
                  required
                  checked={values.confirmOpeningBalance}
                  onChange={(event) =>
                    update({ confirmOpeningBalance: event.target.checked })
                  }
                />
                <Trans>I verified the opening amount for this scope.</Trans>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={values.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              <Trans>Allow paid requests within this limit</Trans>
            </label>
            {!complete && (
              <small>
                <Trans>
                  Choose the scope and enter the limit. New limits also need a
                  verified opening amount.
                </Trans>
              </small>
            )}
            <StyledAiBudgetActions>
              <StyledDeliveryButton
                type="submit"
                data-primary="true"
                disabled={draft.stale || !complete}
              >
                <Trans>Save limit</Trans>
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
