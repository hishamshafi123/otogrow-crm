import { useState } from 'react';
import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { AiBudgetLimitForm } from '@/otogrow-ai-budget/AiBudgetLimitForm';
import { AiPriceForm } from '@/otogrow-ai-budget/AiPriceForm';
import { AiSpendReconcileForm } from '@/otogrow-ai-budget/AiSpendReconcileForm';
import { AiSpendHistory } from '@/otogrow-ai-budget/AiSpendHistory';
import {
  type AiBudget,
  type AiPrice,
  type AiSpend,
} from '@/otogrow-ai-budget/aiBudget.types';
import {
  StyledAiBudgetActions,
  StyledAiBudgetList,
  StyledAiBudgetMetrics,
} from '@/otogrow-ai-budget/aiBudgetStyles';
import {
  GET_AI_BUDGET,
  RECONCILE_AI_SPEND,
  SAVE_AI_BUDGET,
  SAVE_AI_PRICE,
} from '@/otogrow-ai-budget/otogrow-ai-budget.graphql';
import {
  type OtogrowAiBudgetSnapshotQuery,
  type OtogrowAiBudgetSnapshotQueryVariables,
  type SaveOtogrowAiBudgetMutation,
  type SaveOtogrowAiBudgetMutationVariables,
  type SaveOtogrowAiPriceMutation,
  type SaveOtogrowAiPriceMutationVariables,
  type ReconcileOtogrowAiSpendMutation,
  type ReconcileOtogrowAiSpendMutationVariables,
} from '~/generated-metadata/graphql';

type Editor =
  | { kind: 'limit'; budget?: AiBudget }
  | { kind: 'price'; profile?: AiPrice }
  | { kind: 'reconcile'; spend: AiSpend };
type OtogrowAiBudgetProps = { workspace: DeliveryWorkspace };
export const OtogrowAiBudget = ({ workspace }: OtogrowAiBudgetProps) => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const section = ['history', 'prices'].includes(
    params.get('spendingView') ?? '',
  )
    ? params.get('spendingView')
    : 'limits';
  const cursor = params.get('spendingCursor');
  const needsAttention = params.get('spendingAttention') === 'true';
  const canView =
    workspace.actor.isAdmin &&
    permission.canManageRoles &&
    workspace.actor.memberId === permission.access?.memberId;
  const query = useQuery<
    OtogrowAiBudgetSnapshotQuery,
    OtogrowAiBudgetSnapshotQueryVariables & { identity: string | null }
  >(GET_AI_BUDGET, {
    variables: {
      input: { cursor: cursor ?? undefined, limit: 20, needsAttention },
      identity: permission.scopeKey,
    },
    skip: !canView,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 15000,
  });
  const [saveLimit, savingLimit] = useMutation<
    SaveOtogrowAiBudgetMutation,
    SaveOtogrowAiBudgetMutationVariables
  >(SAVE_AI_BUDGET, { fetchPolicy: 'no-cache' });
  const [savePrice, savingPrice] = useMutation<
    SaveOtogrowAiPriceMutation,
    SaveOtogrowAiPriceMutationVariables
  >(SAVE_AI_PRICE, { fetchPolicy: 'no-cache' });
  const [reconcile, reconciling] = useMutation<
    ReconcileOtogrowAiSpendMutation,
    ReconcileOtogrowAiSpendMutationVariables
  >(RECONCILE_AI_SPEND, { fetchPolicy: 'no-cache' });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy =
    savingLimit.loading || savingPrice.loading || reconciling.loading;
  const candidate = query.data?.otogrowAiBudgetSnapshot;
  const snapshot =
    canView &&
    !query.error &&
    candidate?.workspaceId === permission.access?.workspaceId &&
    candidate?.memberId === permission.access?.memberId &&
    candidate?.userWorkspaceId === permission.access?.userWorkspaceId
      ? candidate
      : undefined;
  const changeView = (nextSection: string) =>
    requestAction(() => {
      const next = new URLSearchParams(params);
      next.set('spendingView', nextSection);
      next.delete('spendingCursor');
      setEditor(null);
      setError('');
      setNotice('');
      setParams(next);
    });
  const edit = (next: Editor) =>
    requestAction(() => {
      setEditor(next);
      setError('');
      setNotice('');
    });
  const save = async (action: () => Promise<unknown>) => {
    if (busy || !snapshot) return false;
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save. Your edits are still here.`,
      );
      return false;
    }
    setNotice(t`Saved.`);
    try {
      await query.refetch();
    } catch {
      setNotice(
        t`Saved, but the latest view could not load. Refresh before making another change.`,
      );
    }
    return true;
  };
  const page = (nextCursor?: string | null, attention = needsAttention) =>
    requestAction(() => {
      const next = new URLSearchParams(params);
      if (nextCursor) next.set('spendingCursor', nextCursor);
      else next.delete('spendingCursor');
      if (attention) next.set('spendingAttention', 'true');
      else next.delete('spendingAttention');
      setEditor(null);
      setParams(next);
    });
  if (permission.loading)
    return (
      <p role="status">
        <Trans>Checking spending access…</Trans>
      </p>
    );
  if (permission.error)
    return (
      <StyledDeliveryCard>
        <p role="alert">
          <Trans>Could not verify access. Spending details are hidden.</Trans>
        </p>
        <StyledDeliveryButton onClick={() => void permission.refetch()}>
          <Trans>Check access again</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryCard>
    );
  if (!canView)
    return (
      <p role="alert">
        <Trans>AI spending settings are available to administrators.</Trans>
      </p>
    );
  const workspaceBudget = snapshot?.budgets.find(
    (budget) => budget.scope === 'WORKSPACE',
  );
  const states: Record<string, string> = {
    RESERVED: t`Reserved`,
    DISPATCHED: t`Processing`,
    SETTLED: t`Recorded`,
    UNCERTAIN: t`Needs reconciliation`,
    RELEASED: t`Released before dispatch`,
  };
  return (
    <StyledDeliveryStack>
      <div>
        <h2>
          <Trans>OS production AI spending</Trans>
        </h2>
        <p>
          <Trans>
            Controls for task assistants, inbox drafts and supported media
            requests. Native CRM chat, search and other provider activity are
            outside this budget.
          </Trans>
        </p>
      </div>
      {notice && <p role="status">{notice}</p>}
      <StyledAiBudgetActions aria-label={t`Spending views`}>
        {[
          { id: 'limits', label: t`Limits` },
          { id: 'history', label: t`Usage & charges` },
          { id: 'prices', label: t`Model pricing` },
        ].map((item) => (
          <StyledDeliveryButton
            key={item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => changeView(item.id)}
          >
            {item.label}
          </StyledDeliveryButton>
        ))}
        <StyledDeliveryButton
          disabled={query.loading || busy}
          onClick={() => {
            setError('');
            void query.refetch().catch(() => undefined);
          }}
        >
          <Trans>Refresh spending</Trans>
        </StyledDeliveryButton>
      </StyledAiBudgetActions>
      {error && <p role="alert">{error}</p>}
      {query.error ? (
        <StyledDeliveryCard>
          <p role="alert">
            <Trans>
              Spending could not load. Check your connection and access, then
              retry. Reset the history if its page is no longer available.
            </Trans>
          </p>
          <StyledAiBudgetActions>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton onClick={() => page(null, false)}>
              <Trans>Reset history</Trans>
            </StyledDeliveryButton>
          </StyledAiBudgetActions>
        </StyledDeliveryCard>
      ) : !snapshot ? (
        <p role="status">
          <Trans>Loading spending…</Trans>
        </p>
      ) : (
        <>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h3>
                  {!snapshot.configured
                    ? t`Workspace limit needed`
                    : workspaceBudget?.enabled
                      ? t`Workspace limit enabled`
                      : t`Paid requests paused`}
                </h3>
                {snapshot.unresolvedCount > 0 && (
                  <StyledDeliveryButton
                    onClick={() =>
                      requestAction(() => {
                        const next = new URLSearchParams(params);
                        next.set('spendingView', 'history');
                        next.set('spendingAttention', 'true');
                        next.delete('spendingCursor');
                        setEditor(null);
                        setParams(next);
                      })
                    }
                  >{t`${snapshot.unresolvedCount} charges need attention`}</StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
              <StyledAiBudgetMetrics>
                <div>
                  <dt>
                    <Trans>Recorded cost</Trans>
                  </dt>
                  <dd>{t`USD ${formatAiAmount(snapshot.chargedUsd)}`}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Held for requests</Trans>
                  </dt>
                  <dd>{t`USD ${formatAiAmount(snapshot.heldUsd)}`}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Remaining workspace limit</Trans>
                  </dt>
                  <dd>
                    {workspaceBudget
                      ? t`USD ${formatAiAmount(workspaceBudget.remainingUsd)}`
                      : t`Not set`}
                  </dd>
                </div>
              </StyledAiBudgetMetrics>
              <small>
                <Trans>
                  Recorded cost includes opening balances. Holds are not
                  confirmed charges. Client and task limits also apply;
                  available workspace balance alone does not make a request
                  eligible.
                </Trans>
              </small>
              {!snapshot.configured && (
                <p>
                  <Trans>
                    No spending limit is configured. Earlier provider charges
                    are not included until a verified opening balance is
                    entered.
                  </Trans>
                </p>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          {section === 'limits' && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h3>
                    <Trans>Spending limits</Trans>
                  </h3>
                  <StyledDeliveryButton onClick={() => edit({ kind: 'limit' })}>
                    <Trans>Add limit</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <p>
                  <Trans>
                    The workspace limit is required. Optional client and task
                    limits add tighter caps. Unconfigured clients and tasks
                    inherit the workspace limit.
                  </Trans>
                </p>
                {editor?.kind === 'limit' && (
                  <AiBudgetLimitForm
                    key={editor.budget?.id ?? 'new'}
                    budget={
                      snapshot.budgets.find(
                        (item) => item.id === editor.budget?.id,
                      ) ?? editor.budget
                    }
                    snapshot={snapshot}
                    busy={busy}
                    save={(input) =>
                      save(() => saveLimit({ variables: { input } }))
                    }
                    close={() => setEditor(null)}
                  />
                )}
                <StyledAiBudgetList>
                  {snapshot.budgets.map((budget) => (
                    <li key={budget.id}>
                      <StyledDeliveryStack>
                        <StyledDeliveryRow>
                          <div>
                            <h3>{budget.scopeName}</h3>
                            <small>
                              {budget.scope === 'WORKSPACE'
                                ? t`Whole workspace`
                                : budget.scope === 'CLIENT'
                                  ? t`Client`
                                  : t`Task`}
                            </small>
                          </div>
                          <StyledAiBudgetActions>
                            <StyledDeliveryBadge>
                              {budget.enabled ? t`Enabled` : t`Paused`}
                            </StyledDeliveryBadge>
                            <StyledDeliveryButton
                              aria-label={t`Edit limit for ${budget.scopeName}`}
                              onClick={() => edit({ kind: 'limit', budget })}
                            >
                              <Trans>Edit limit</Trans>
                            </StyledDeliveryButton>
                          </StyledAiBudgetActions>
                        </StyledDeliveryRow>
                        <p>{t`Limit: USD ${formatAiAmount(budget.capUsd)} · Recorded: USD ${formatAiAmount(budget.chargedUsd)} · Held: USD ${formatAiAmount(budget.heldUsd)} · Remaining: USD ${formatAiAmount(budget.remainingUsd)}`}</p>
                        <small>{t`Opening balance: USD ${formatAiAmount(budget.openingSpentUsd)}`}</small>
                      </StyledDeliveryStack>
                    </li>
                  ))}
                </StyledAiBudgetList>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          {section === 'prices' && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h3>
                    <Trans>Verified model prices</Trans>
                  </h3>
                  <StyledDeliveryButton onClick={() => edit({ kind: 'price' })}>
                    <Trans>Add pricing</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <p>
                  <Trans>
                    Administrators supply and verify the pricing evidence.
                    Missing or disabled prices block paid requests. Image and
                    video generation billed per image or second is unavailable
                    until its billing adapter is supported.
                  </Trans>
                </p>
                {editor?.kind === 'price' && (
                  <AiPriceForm
                    key={editor.profile?.id ?? 'new'}
                    profile={
                      snapshot.priceProfiles.find(
                        (item) => item.id === editor.profile?.id,
                      ) ?? editor.profile
                    }
                    busy={busy}
                    save={(input) =>
                      save(() => savePrice({ variables: { input } }))
                    }
                    close={() => setEditor(null)}
                  />
                )}
                {!snapshot.priceProfiles.length && (
                  <p>
                    <Trans>No verified model pricing yet.</Trans>
                  </p>
                )}
                <StyledAiBudgetList>
                  {snapshot.priceProfiles.map((profile) => (
                    <li key={profile.id}>
                      <StyledDeliveryStack>
                        <StyledDeliveryRow>
                          <h3>{profile.modelId}</h3>
                          <StyledAiBudgetActions>
                            <StyledDeliveryBadge>
                              {profile.enabled ? t`Enabled` : t`Disabled`}
                            </StyledDeliveryBadge>
                            <StyledDeliveryButton
                              aria-label={t`Edit pricing for ${profile.modelId}`}
                              onClick={() => edit({ kind: 'price', profile })}
                            >
                              <Trans>Edit pricing</Trans>
                            </StyledDeliveryButton>
                          </StyledAiBudgetActions>
                        </StyledDeliveryRow>
                        <small>
                          {profile.kind === 'INSPECTION'
                            ? t`Image inspection`
                            : t`Text assistance`}{' '}
                          · {t`Version ${profile.revision}`} ·{' '}
                          {formatActivityTime(profile.verifiedAt)}
                        </small>
                        <p>{profile.source}</p>
                        <p>{t`Input USD ${profile.pricing.inputUsdPerMillionTokens} / output USD ${profile.pricing.outputUsdPerMillionTokens} per million tokens`}</p>
                      </StyledDeliveryStack>
                    </li>
                  ))}
                </StyledAiBudgetList>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          {section === 'history' && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h3>
                    <Trans>Usage & charges</Trans>
                  </h3>
                  <label>
                    <input
                      type="checkbox"
                      checked={needsAttention}
                      onChange={(event) => page(null, event.target.checked)}
                    />
                    <Trans>Needs attention only</Trans>
                  </label>
                </StyledDeliveryRow>
                <small>
                  {snapshot.coverageStartedAt
                    ? t`Recorded since ${formatActivityTime(snapshot.coverageStartedAt)}. Times in UTC.`
                    : t`No recorded production requests yet.`}
                </small>
                {editor?.kind === 'reconcile' && (
                  <AiSpendReconcileForm
                    key={editor.spend.id}
                    spend={
                      snapshot.recentSpend.find(
                        (item) => item.id === editor.spend.id,
                      ) ?? { ...editor.spend, revision: -1 }
                    }
                    busy={busy}
                    save={(input) =>
                      save(() => reconcile({ variables: { input } }))
                    }
                    close={() => setEditor(null)}
                  />
                )}
                {!snapshot.recentSpend.length && (
                  <p role="status">
                    {needsAttention
                      ? t`No charges need attention in this view.`
                      : t`No requests on this page.`}
                  </p>
                )}
                <StyledAiBudgetList>
                  {snapshot.recentSpend.map((spend) => (
                    <li key={spend.id}>
                      <StyledDeliveryStack>
                        <StyledDeliveryRow>
                          <div>
                            <h3>
                              {spend.taskName ??
                                spend.clientName ??
                                spend.modelId}
                            </h3>
                            <small>{formatActivityTime(spend.createdAt)}</small>
                          </div>
                          <StyledDeliveryBadge>
                            {states[spend.state] ?? spend.state}
                          </StyledDeliveryBadge>
                        </StyledDeliveryRow>
                        <p>
                          {spend.actualUsd === null ||
                          spend.actualUsd === undefined
                            ? t`Confirmed charge unavailable · Held USD ${formatAiAmount(spend.heldUsd)}`
                            : t`Confirmed USD ${formatAiAmount(spend.actualUsd)} · Held USD ${formatAiAmount(spend.heldUsd)}`}
                        </p>
                        {spend.attentionReason && (
                          <p>{spend.attentionReason}</p>
                        )}
                        {spend.reportedActualUsd &&
                          spend.reportedActualUsd !== spend.actualUsd && (
                            <p>
                              {t`Later provider evidence: USD ${formatAiAmount(spend.reportedActualUsd)}. The higher amount counts toward spending limits; the earlier reconciliation remains in history.`}
                            </p>
                          )}
                        <details>
                          <summary>
                            <Trans>Request and pricing evidence</Trans>
                          </summary>
                          <StyledDeliveryStack>
                            <p>
                              {spend.modelId} ·{' '}
                              {spend.sourceKind === 'TASK_AGENT'
                                ? t`Task assistant`
                                : spend.sourceKind === 'INBOX_DRAFT'
                                  ? t`Inbox draft`
                                  : t`Media request`}
                            </p>
                            <p>{t`Maximum reserved: USD ${formatAiAmount(spend.reservedUsd)}`}</p>
                            <p>
                              {spend.boundSource === 'MODEL_CONTEXT'
                                ? t`Reservation uses the verified full model context bound, not an estimate of this prompt.`
                                : t`Reservation uses provider-confirmed input counts.`}
                            </p>
                            <p>{t`Pricing version ${spend.priceRevision} · Verified ${formatActivityTime(spend.priceVerifiedAt)}`}</p>
                            <p>{spend.priceSource}</p>
                            <small>{t`Run reference: ${spend.sourceRunId}`}</small>
                          </StyledDeliveryStack>
                        </details>
                        <AiSpendHistory spendId={spend.id} />
                        {spend.state === 'UNCERTAIN' && (
                          <StyledAiBudgetActions>
                            <StyledDeliveryButton
                              onClick={() => edit({ kind: 'reconcile', spend })}
                            >
                              <Trans>Resolve charge</Trans>
                            </StyledDeliveryButton>
                          </StyledAiBudgetActions>
                        )}
                      </StyledDeliveryStack>
                    </li>
                  ))}
                </StyledAiBudgetList>
                <StyledAiBudgetActions>
                  {cursor && (
                    <StyledDeliveryButton
                      disabled={query.loading}
                      onClick={() => page()}
                    >
                      <Trans>Latest requests</Trans>
                    </StyledDeliveryButton>
                  )}
                  {snapshot.nextCursor && (
                    <StyledDeliveryButton
                      disabled={query.loading}
                      onClick={() => page(snapshot.nextCursor)}
                    >
                      <Trans>Older requests</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledAiBudgetActions>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};
