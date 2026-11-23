import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useRevisionLabels } from '@/delivery/revisions/useRevisionLabels';
import {
  type DeliveryRevisionsQuery,
  type DeliveryRevisionSaveInput,
} from '~/generated-metadata/graphql';
type RevisionRound =
  DeliveryRevisionsQuery['deliveryRevisions']['rounds'][number];
type RevisionEditorProps = {
  taskId: string;
  initial: RevisionRound;
  latest: RevisionRound | undefined;
  canManage: boolean;
  canManageFinance: boolean;
  onSave: (input: DeliveryRevisionSaveInput) => Promise<boolean>;
  onClose: () => void;
};
export const RevisionEditor = ({
  taskId,
  initial,
  latest,
  canManage,
  canManageFinance,
  onSave,
  onClose,
}: RevisionEditorProps) => {
  const { t } = useLingui();
  const { causes } = useRevisionLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const focusFirstField = useCallback((form: HTMLFormElement | null) => {
    form?.querySelector<HTMLSelectElement>('select:not(:disabled)')?.focus();
  }, []);
  const values = (row: RevisionRound) => ({
    cause: row.cause,
    effortMinutes: row.effortMinutes?.toString() ?? '',
    internalCost:
      row.internalCost === null || row.internalCost === undefined
        ? ''
        : (row.internalCost / 100).toFixed(2),
    proposedCharge: ((row.proposedCharge ?? 0) / 100).toFixed(2),
    currency: row.currency ?? '',
  });
  const [opened, setOpened] = useState(initial);
  const [draft, setDraft] = useState(values(initial));
  const [baseline, setBaseline] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stale = latest !== undefined && latest.revision !== opened.revision;
  useDeliveryDraftStatus({
    dirty: JSON.stringify(draft) !== baseline,
    saving: busy,
  });
  const financialReady =
    !canManageFinance ||
    Boolean(draft.currency) ||
    (draft.internalCost === '' && Number(draft.proposedCharge) === 0);
  return (
    <form
      ref={focusFirstField}
      aria-label={t`Edit revision round`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || stale || !financialReady) return;
        setBusy(true);
        setError('');
        const input = {
          taskId,
          id: opened.id,
          revision: opened.revision,
          cause: draft.cause,
          effortMinutes:
            draft.effortMinutes === '' ? null : Number(draft.effortMinutes),
          ...(canManageFinance
            ? {
                internalCost:
                  draft.internalCost === ''
                    ? null
                    : Math.round(Number(draft.internalCost) * 100),
                proposedCharge: Math.round(Number(draft.proposedCharge) * 100),
                currency: draft.currency || null,
              }
            : {}),
        };
        try {
          if (await onSave(input)) {
            setBaseline(JSON.stringify(draft));
            onClose();
          } else
            setError(
              t`Revision details could not be confirmed. Your draft is kept. Check current history before retrying.`,
            );
        } catch {
          setError(
            t`Revision details could not be confirmed. Your draft is kept. Check current history before retrying.`,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h4>{t`Round ${opened.round}`}</h4>
        {stale && (
          <div role="alert">
            <p>
              <Trans>This round changed while you were editing.</Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                requestAction(() => {
                  setOpened(latest);
                  setDraft(values(latest));
                  setBaseline(JSON.stringify(values(latest)));
                  setError('');
                })
              }
            >
              <Trans>Reload latest round</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <fieldset disabled={busy || !canManage}>
          <StyledDeliveryGrid>
            <label>
              <Trans>Reason category</Trans>
              <select
                value={draft.cause}
                onChange={(event) =>
                  setDraft({ ...draft, cause: event.target.value })
                }
              >
                {Object.entries(causes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Recorded revision effort (minutes)</Trans>
              <input
                type="number"
                min={0}
                max={100000}
                step={1}
                value={draft.effortMinutes}
                onChange={(event) =>
                  setDraft({ ...draft, effortMinutes: event.target.value })
                }
              />
            </label>
          </StyledDeliveryGrid>
        </fieldset>
        <small>
          <Trans>
            Record time spent on this round when known. Blank means unrecorded;
            this does not change the remaining capacity estimate.
          </Trans>
        </small>
        {canManageFinance && (
          <>
            <fieldset disabled={busy}>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={draft.currency}
                    onChange={(event) =>
                      setDraft({ ...draft, currency: event.target.value })
                    }
                  >
                    <option value="">{t`Choose currency`}</option>
                    {[
                      'INR',
                      'USD',
                      'QAR',
                      'AED',
                      'EUR',
                      'GBP',
                      'SGD',
                      'AUD',
                      'CAD',
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Recorded internal cost</Trans>
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    step="0.01"
                    value={draft.internalCost}
                    onChange={(event) =>
                      setDraft({ ...draft, internalCost: event.target.value })
                    }
                  />
                </label>
                <label>
                  <Trans>Proposed client charge</Trans>
                  <input
                    required
                    type="number"
                    min={0}
                    max={1000000000}
                    step="0.01"
                    value={draft.proposedCharge}
                    onChange={(event) =>
                      setDraft({ ...draft, proposedCharge: event.target.value })
                    }
                  />
                </label>
              </StyledDeliveryGrid>
            </fieldset>
            <p>
              <Trans>
                The charge defaults to zero. Recording a proposal does not bill
                the client or create a payment. Cost is recorded separately from
                cash and must not duplicate salary/AI allocations.
              </Trans>
            </p>
            {!financialReady && (
              <p role="alert">
                <Trans>
                  Choose a currency for the cost or proposed charge.
                </Trans>
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="submit"
            disabled={
              busy ||
              stale ||
              !financialReady ||
              (!canManage && !canManageFinance)
            }
          >
            <Trans>Save revision details</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Cancel revision edit</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
