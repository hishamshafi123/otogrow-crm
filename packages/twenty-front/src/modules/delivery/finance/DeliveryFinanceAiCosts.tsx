import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinanceAiCostsQuery,
  type DeliveryFinanceAiCostPrepareInput,
  type PrepareDeliveryFinanceAiCostMutation,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  GET_DELIVERY_FINANCE_AI_COSTS,
  PREPARE_DELIVERY_FINANCE_AI_COST,
} from '@/delivery/finance/delivery-finance-ai-cost.graphql';
import { FinanceAiCostImportForm } from '@/delivery/finance/FinanceAiCostImportForm';
import { FinanceAiCostSourceDetails } from '@/delivery/finance/FinanceAiCostSourceDetails';
import { type FinanceAiCostSnapshot } from '@/delivery/finance/finance-ai-cost.types';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { StyledFinanceNavigation } from '@/delivery/finance/financeStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryFinanceAiCostsProps = { onChanged: () => Promise<unknown> };
const StyledAiCostBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
const currentServiceMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
export const DeliveryFinanceAiCosts = ({
  onChanged,
}: DeliveryFinanceAiCostsProps) => {
  const permission = useWorkflowAccess();
  return (
    <AiCostsWorkspace
      key={`${permission.scope}:${permission.lastVerifiedCanReadFinance}`}
      permission={permission}
      onChanged={onChanged}
    />
  );
};
const AiCostsWorkspace = ({
  permission,
  onChanged,
}: DeliveryFinanceAiCostsProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const labels = useFinanceAiCostLabels();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const filter = params.get('financeAiFilter') ?? 'NEEDS_REVIEW';
  const filterValid = Object.keys(labels.filters).includes(filter);
  const selectedId = params.get('financeAiSpend');
  const month = params.get('financeMonth') ?? currentServiceMonth();
  const query = useQuery<DeliveryFinanceAiCostsQuery>(
    GET_DELIVERY_FINANCE_AI_COSTS,
    {
      variables: {
        input: {
          filter,
          afterSpendId: params.get('financeAiAfter'),
          selectedSpendId: selectedId,
          afterEvidenceId: params.get('financeAiEvidenceAfter'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance || !filterValid,
    },
  );
  const [prepare] = useMutation<PrepareDeliveryFinanceAiCostMutation>(
    PREPARE_DELIVERY_FINANCE_AI_COST,
  );
  const candidate = query.data?.deliveryFinanceAiCosts;
  const available =
    filterValid &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.filter === filter;
  const [lastVerified, setLastVerified] =
    useState<FinanceAiCostSnapshot | null>(null);
  if (available && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const data = available && isDefined(candidate) ? candidate : lastVerified;
  const source =
    data?.selectedSource?.id === selectedId
      ? data.selectedSource
      : data?.sources.find((item) => item.id === selectedId);
  const canManage = permission.canManageFinance && data?.canManage === true;
  const [editing, setEditing] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{
    text: string;
    entryId: string;
    month?: string;
  } | null>(null);
  const destination = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    next.set('financeView', 'ai-costs');
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/delivery?${next}`;
  };
  const save = async (input: DeliveryFinanceAiCostPrepareInput) => {
    if (!available || !canManage || busy) return false;
    setBusy(true);
    setError('');
    setNotice(null);
    try {
      const response = await prepare({ variables: { input } });
      const result = response.data?.prepareDeliveryFinanceAiCost;
      if (!result)
        throw new Error(t`The saved AI-cost entry was not confirmed.`);
      setEditing(false);
      const previous = [
        source?.claim.currentEntry,
        source?.claim.replacementEntry,
      ].find((entry) => entry?.id === result.entryId);
      setNotice({
        entryId: result.entryId,
        month: result.replayed ? previous?.month : input.month,
        text:
          result.status === 'DRAFT'
            ? t`AI-cost draft saved. Review its allocation and post it separately; cash and spending limits are unchanged.`
            : result.status === 'POSTED'
              ? t`This request already has a posted entry. Review the saved source and history.`
              : t`This request was already processed and its entry is now voided. Review history before preparing another cost.`,
      });
      const refreshed = await Promise.allSettled([
        query.refetch(),
        onChanged(),
      ]);
      if (refreshed.some((item) => item.status === 'rejected'))
        setError(
          t`Saved, but the latest sources could not refresh. Refresh before another change.`,
        );
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`The AI-cost draft could not be saved. Your review is kept.`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    try {
      const response = await query.refetch();
      if (!permission.matches(response.data?.deliveryFinanceAiCosts))
        throw new Error();
      setFormVersion((version) => version + 1);
    } catch {
      setError(t`The latest charge could not be checked. Your draft is kept.`);
    }
  };
  if (!permission.ready && !lastVerified)
    return (
      <p role="status">
        <Trans>Checking finance access…</Trans>
      </p>
    );
  if (permission.ready && !permission.canReadFinance)
    return (
      <p>
        <Trans>Finance access is required to inspect AI costs.</Trans>
      </p>
    );
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h2>
          <Trans>AI costs</Trans>
        </h2>
        <StyledDeliveryButton
          disabled={busy || query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh AI costs</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        <Trans>
          Review recorded production AI charges in USD before adding them to
          monthly results. This does not record or send a payment.
        </Trans>
      </p>
      {!permission.ready && (
        <p role="status">
          <Trans>
            Your finance access could not be verified. Saved information is
            hidden and your draft is kept.
          </Trans>{' '}
          <StyledDeliveryButton
            onClick={() => void permission.refetch().catch(() => undefined)}
          >
            <Trans>Retry finance access</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <StyledFinanceNavigation aria-label={t`AI-cost filters`}>
        {Object.entries(labels.filters).map(([value, label]) => (
          <Link
            key={value}
            aria-current={filter === value ? 'page' : undefined}
            to={destination({
              financeAiFilter: value,
              financeAiAfter: null,
              financeAiEvidenceAfter: null,
            })}
          >
            {label}
          </Link>
        ))}
      </StyledFinanceNavigation>
      {!filterValid && (
        <p role="alert">
          <Trans>Choose a valid AI-cost filter.</Trans>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status">
          {notice.text}{' '}
          <Link
            to={`/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(notice.entryId)}${notice.month ? `&financeMonth=${notice.month}` : ''}&financeCurrency=USD`}
          >
            <Trans>Open saved monthly entry</Trans>
          </Link>
        </p>
      )}
      {query.error && (
        <p role="alert">
          <Trans>
            AI-cost sources could not be checked. Saved figures are hidden and
            your draft is kept. Refresh to retry.
          </Trans>
        </p>
      )}
      {editing && !available && (
        <StyledDeliveryButton
          disabled={busy}
          onClick={() => requestAction(() => setEditing(false))}
        >
          <Trans>Discard AI-cost draft</Trans>
        </StyledDeliveryButton>
      )}
      {!data && !query.error && filterValid && (
        <p role="status">
          <Trans>Loading recorded AI costs…</Trans>
        </p>
      )}
      <StyledAiCostBoundary
        hidden={!available}
        disabled={!available || busy || query.loading}
      >
        <StyledDeliveryStack>
          {source && (
            <FinanceAiCostSourceDetails
              source={source}
              canManage={canManage}
              canReadBudget={
                permission.canManageRoles && data?.canReadBudget === true
              }
              editing={editing}
              hasEvidenceCursor={params.has('financeAiEvidenceAfter')}
              destination={destination}
              onPrepare={() =>
                requestAction(() => {
                  setEditing(true);
                  setError('');
                })
              }
            />
          )}
          {selectedId && !source && (
            <p>
              <Trans>
                This AI charge is unavailable or outside your access.
              </Trans>{' '}
              <Link
                to={destination({
                  financeAiSpend: null,
                  financeAiEvidenceAfter: null,
                })}
              >
                <Trans>Clear AI-charge selection</Trans>
              </Link>
            </p>
          )}
          {editing && source && (
            <StyledDeliveryCard>
              <FinanceAiCostImportForm
                key={`${source.id}:${formVersion}`}
                source={source}
                projects={data?.projects ?? []}
                month={month}
                busy={busy}
                readOnly={!available || !canManage || query.loading}
                onSave={save}
                onCancel={() => setEditing(false)}
                onReload={() => void reload()}
              />
            </StyledDeliveryCard>
          )}
          <h3>
            <Trans>Recorded requests</Trans>
          </h3>
          {!data?.sources.length && (
            <p>
              <Trans>
                No AI charges in this view. Change the filter to include other
                recorded or unavailable requests.
              </Trans>
            </p>
          )}
          {data?.sources.map((item) => (
            <StyledDeliveryCard key={item.id}>
              <StyledDeliveryRow>
                <div>
                  <strong>
                    {item.modelId || t`Model identity unavailable`}
                  </strong>
                  <p>
                    {item.projectName ?? t`Company / unassigned source`} ·{' '}
                    {labels.status(item)}
                  </p>
                  <p>
                    {t`Original ledger charge`}:{' '}
                    {item.settledAmountMicros === null ||
                    item.settledAmountMicros === undefined
                      ? t`Not confirmed`
                      : formatFinanceAmountMicros(
                          item.settledAmountMicros,
                          item.currency,
                        )}{' '}
                    · {item.settledAt ? t`Recorded` : t`Requested`}{' '}
                    {new Date(
                      item.settledAt ?? item.createdAt,
                    ).toLocaleString()}
                  </p>
                  {item.claim.currentEntry && (
                    <p>
                      {t`Current monthly entry`}:{' '}
                      {formatFinanceAmountMicros(
                        item.claim.currentEntry.amountMicros,
                        item.currency,
                      )}{' '}
                      · {item.claim.currentEntry.month} ·{' '}
                      {financeLabels.entryStatuses[
                        item.claim.currentEntry.status
                      ] ?? t`Needs review`}
                    </p>
                  )}
                  {item.claim.replacementEntry && (
                    <p>
                      {item.claim.replacementEntry.status === 'DRAFT'
                        ? t`Pending correction`
                        : t`Correction entry`}
                      :{' '}
                      {formatFinanceAmountMicros(
                        item.claim.replacementEntry.amountMicros,
                        item.currency,
                      )}{' '}
                      · {item.claim.replacementEntry.month} ·{' '}
                      {financeLabels.entryStatuses[
                        item.claim.replacementEntry.status
                      ] ?? t`Needs review`}
                    </p>
                  )}
                </div>
                <Link
                  to={destination({
                    financeAiSpend: item.id,
                    financeAiEvidenceAfter: null,
                  })}
                >
                  <Trans>Review AI charge</Trans>
                </Link>
              </StyledDeliveryRow>
            </StyledDeliveryCard>
          ))}
          <StyledDeliveryRow>
            {data?.nextSpendId && (
              <Link to={destination({ financeAiAfter: data.nextSpendId })}>
                <Trans>More AI charges</Trans>
              </Link>
            )}
            {params.has('financeAiAfter') && (
              <Link to={destination({ financeAiAfter: null })}>
                <Trans>First AI charges</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </StyledAiCostBoundary>
    </StyledDeliveryStack>
  );
};
