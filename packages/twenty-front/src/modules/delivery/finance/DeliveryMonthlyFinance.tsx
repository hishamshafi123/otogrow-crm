import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type DeliveryFinanceQuery,
  type DeliveryFinancePlanInput,
  type DeliveryFinanceEntryInput,
  type SaveDeliveryFinancePlanMutation,
  type SaveDeliveryFinanceEntryMutation,
  type PrepareDeliveryFinanceMonthMutation,
  type PostDeliveryFinanceEntryMutation,
  type VoidDeliveryFinanceEntryMutation,
  type PostDeliveryFinanceAiCostMutation,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { FinancePlanForm } from '@/delivery/finance/FinancePlanForm';
import { FinanceEntryForm } from '@/delivery/finance/FinanceEntryForm';
import { FinanceEntryHistory } from '@/delivery/finance/FinanceEntryHistory';
import { FinanceAiCostOrigin } from '@/delivery/finance/FinanceAiCostOrigin';
import { FinanceAiCostPostForm } from '@/delivery/finance/FinanceAiCostPostForm';
import { POST_DELIVERY_FINANCE_AI_COST } from '@/delivery/finance/delivery-finance-ai-cost.graphql';
import { FinanceMonthlyResults } from '@/delivery/finance/FinanceMonthlyResults';
import { FinancePeriodPanel } from '@/delivery/finance/FinancePeriodPanel';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { financePaymentDestination } from '@/delivery/finance/finance-payment-destination';
import {
  GET_DELIVERY_FINANCE,
  SAVE_DELIVERY_FINANCE_PLAN,
  SAVE_DELIVERY_FINANCE_ENTRY,
  PREPARE_DELIVERY_FINANCE_MONTH,
  POST_DELIVERY_FINANCE_ENTRY,
  VOID_DELIVERY_FINANCE_ENTRY,
} from '@/delivery/finance/delivery-finance.graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceSnapshot = DeliveryFinanceQuery['deliveryFinance'];
type FinancePlan = FinanceSnapshot['plans'][number];
type FinanceEntry = FinanceSnapshot['entries'][number];
type FinanceEditor =
  | { kind: 'PLAN'; initial: FinancePlan | null }
  | { kind: 'ENTRY'; initial: FinanceEntry | null };
type DeliveryMonthlyFinanceProps = {
  view: 'monthly' | 'plans';
  onChanged: () => Promise<unknown>;
};
const StyledFinanceBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
const StyledInlinePanel = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  margin-top: 14px;
  padding-top: 14px;
`;
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const validMonth = (value: string) =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const DeliveryMonthlyFinance = ({
  view,
  onChanged,
}: DeliveryMonthlyFinanceProps) => {
  const permission = useWorkflowAccess();
  return (
    <MonthlyFinanceWorkspace
      key={`${permission.scope}:${permission.lastVerifiedCanReadFinance}`}
      view={view}
      onChanged={onChanged}
      permission={permission}
    />
  );
};
const MonthlyFinanceWorkspace = ({
  view,
  onChanged,
  permission,
}: DeliveryMonthlyFinanceProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const labels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const preparationReasons: Record<string, string> = {
    SOURCE_PLAN_CHANGED: t`The plan changed during preparation. Review it before preparing this month again.`,
    SOURCE_MEMBER_INACTIVE: t`The employee is no longer active. Review the cost plan and any historical obligation.`,
  };
  const [params, setParams] = useSearchParams();
  const month = params.get('financeMonth') ?? currentMonth();
  const currency = params.get('financeCurrency') ?? '';
  const selectedPlanId = params.get('financePlan');
  const selectedEntryId = params.get('financeEntry');
  const filtersValid =
    validMonth(month) && (!currency || labels.currencies.includes(currency));
  const query = useQuery<DeliveryFinanceQuery>(GET_DELIVERY_FINANCE, {
    variables: {
      input: {
        month,
        currency: currency || null,
        afterPlanId: params.get('financePlansAfter'),
        afterEntryId: params.get('financeEntriesAfter'),
        selectedPlanId,
        selectedEntryId,
      },
      identity: permission.scope,
    },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !permission.ready || !permission.canReadFinance || !filtersValid,
  });
  const [savePlan] = useMutation<SaveDeliveryFinancePlanMutation>(
    SAVE_DELIVERY_FINANCE_PLAN,
  );
  const [saveEntry] = useMutation<SaveDeliveryFinanceEntryMutation>(
    SAVE_DELIVERY_FINANCE_ENTRY,
  );
  const [prepare] = useMutation<PrepareDeliveryFinanceMonthMutation>(
    PREPARE_DELIVERY_FINANCE_MONTH,
  );
  const [post] = useMutation<PostDeliveryFinanceEntryMutation>(
    POST_DELIVERY_FINANCE_ENTRY,
  );
  const [postAiCost] = useMutation<PostDeliveryFinanceAiCostMutation>(
    POST_DELIVERY_FINANCE_AI_COST,
  );
  const [voidEntry] = useMutation<VoidDeliveryFinanceEntryMutation>(
    VOID_DELIVERY_FINANCE_ENTRY,
  );
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<FinanceEditor | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [periodVersion, setPeriodVersion] = useState(0);
  const [error, setError] = useState('');
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(() =>
    params.has('financeHistoryBefore') ? selectedEntryId : null,
  );
  const [notice, setNotice] = useState<{
    text: string;
    to?: string;
    targetId?: string;
  } | null>(null);
  const [preparation, setPreparation] = useState<
    PrepareDeliveryFinanceMonthMutation['prepareDeliveryFinanceMonth'] | null
  >(null);
  const candidate = query.data?.deliveryFinance;
  const available =
    filtersValid &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.month === month &&
    candidate.currency === (currency || null);
  const [lastVerified, setLastVerified] = useState<FinanceSnapshot | null>(
    null,
  );
  if (available && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const data = available && isDefined(candidate) ? candidate : lastVerified;
  const canManage = permission.canManageFinance && data?.canManage === true;
  const monthLocked = data?.period?.status === 'LOCKED';
  const selectedPlan =
    (data?.selectedPlan?.id === selectedPlanId ? data.selectedPlan : null) ??
    data?.plans.find((plan) => plan.id === selectedPlanId) ??
    null;
  const selectedEntry =
    (data?.selectedEntry?.id === selectedEntryId ? data.selectedEntry : null) ??
    data?.entries.find((entry) => entry.id === selectedEntryId) ??
    null;
  const destination = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/delivery?${next}`;
  };
  const perform = async <TData,>(
    operation: () => Promise<TData>,
  ): Promise<TData | null> => {
    if (!available || !canManage || busy) return null;
    setBusy(true);
    setError('');
    setNotice(null);
    try {
      const result = await operation();
      const refresh = await Promise.allSettled([query.refetch(), onChanged()]);
      if (refresh.some((item) => item.status === 'rejected'))
        setError(
          t`Saved, but finance could not refresh. Your source records remain saved; refresh before another change.`,
        );
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Finance could not save this change. Your draft is preserved.`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  const editPlan = (initial: FinancePlan | null) =>
    requestAction(() => {
      setError('');
      setPeriodVersion((value) => value + 1);
      setEditor({ kind: 'PLAN', initial });
    });
  const editEntry = (initial: FinanceEntry | null) =>
    requestAction(() => {
      setError('');
      setPeriodVersion((value) => value + 1);
      setEditor({ kind: 'ENTRY', initial });
    });
  const savePlanDraft = async (input: DeliveryFinancePlanInput) => {
    const result = await perform(() => savePlan({ variables: { input } }));
    const id = result?.data?.saveDeliveryFinancePlan;
    if (!id) return false;
    setEditor(null);
    setNotice({
      text: t`Monthly cost plan saved. No payment was recorded.`,
      to: destination({ financeView: 'plans', financePlan: id }),
      targetId: id,
    });
    return true;
  };
  const saveEntryDraft = async (input: DeliveryFinanceEntryInput) => {
    const result = await perform(() => saveEntry({ variables: { input } }));
    const id = result?.data?.saveDeliveryFinanceEntry;
    if (!id) return false;
    setEditor(null);
    setNotice({
      text: t`Monthly draft saved. Review and post it to include it in results.`,
      to: destination({ financeView: 'monthly', financeEntry: id }),
      targetId: id,
    });
    return true;
  };
  const noticeShownInline =
    available &&
    Boolean(notice?.targetId) &&
    ((view === 'plans' &&
      Boolean(data?.plans.some((plan) => plan.id === notice?.targetId))) ||
      (view === 'monthly' &&
        Boolean(data?.entries.some((entry) => entry.id === notice?.targetId))));
  const prepareMonth = async (afterPlanId: string | null) => {
    const result = await perform(() =>
      prepare({
        variables: {
          input: { month, currency: currency || null, afterPlanId },
        },
      }),
    );
    if (result?.data) {
      setPreparation(result.data.prepareDeliveryFinanceMonth);
      setNotice({
        text: t`Monthly cost drafts prepared. Review each amount and allocation before posting.`,
      });
    }
  };
  if (!permission.ready && !isDefined(lastVerified))
    return (
      <p role="status">
        <Trans>Checking finance access…</Trans>
      </p>
    );
  if (permission.ready && !permission.canReadFinance)
    return (
      <p>
        <Trans>Finance access is required to view monthly results.</Trans>
      </p>
    );
  return (
    <StyledDeliveryStack>
      {!permission.ready && (
        <p role="status">
          <Trans>
            Your finance access could not be verified. Saved figures are hidden
            and your draft is kept.
          </Trans>{' '}
          <StyledDeliveryButton
            disabled={busy}
            onClick={() => void permission.refetch().catch(() => undefined)}
          >
            <Trans>Retry finance access</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <StyledDeliveryRow>
        <h2>{view === 'plans' ? t`Monthly cost plans` : t`Monthly results`}</h2>
        <StyledDeliveryButton
          disabled={busy || query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh monthly finance</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        {view === 'plans' ? (
          <Trans>
            Set salary and overhead amounts, then prepare drafts for monthly
            review. This does not record a payment.
          </Trans>
        ) : (
          <Trans>
            Review posted revenue and costs for a service month. Payments stay
            in Cash records.
          </Trans>
        )}
      </p>
      {view === 'monthly' && (
        <Link
          to={destination({
            financeView: 'ai-costs',
            financeAiFilter: 'NEEDS_REVIEW',
          })}
        >
          <Trans>Review AI costs for monthly results</Trans>
        </Link>
      )}
      <form
        key={`${month}:${currency}`}
        aria-label={t`Monthly finance filters`}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          requestAction(() => {
            const next = new URLSearchParams(params);
            next.set('financeMonth', String(fields.get('month')));
            const nextCurrency = String(fields.get('currency') ?? '');
            if (nextCurrency) next.set('financeCurrency', nextCurrency);
            else next.delete('financeCurrency');
            for (const key of [
              'financePlansAfter',
              'financeEntriesAfter',
              'financePlan',
              'financeEntry',
              'financeHistoryBefore',
              'financePeriodBlockersAfter',
              'financePeriodHistoryBefore',
            ])
              next.delete(key);
            setPreparation(null);
            setEditor(null);
            setParams(next);
          });
        }}
      >
        <StyledDeliveryRow>
          <label>
            <Trans>Service month</Trans>
            <input name="month" type="month" required defaultValue={month} />
          </label>
          <label>
            <Trans>Currency</Trans>
            <select name="currency" defaultValue={currency}>
              <option value="">{t`All currencies — kept separate`}</option>
              {labels.currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <StyledDeliveryButton type="submit" disabled={busy}>
            <Trans>Apply month</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </form>
      {!filtersValid && (
        <p role="alert">
          <Trans>Choose a valid service month and supported currency.</Trans>
        </p>
      )}
      {error && (!editor || !available) && <p role="alert">{error}</p>}
      {editor && !available && permission.ready && !canManage && (
        <p role="status">
          <Trans>
            Your edit permission changed. This draft is preserved with read-only
            access; an administrator must restore editing before it can be
            saved.
          </Trans>
        </p>
      )}
      {notice && !noticeShownInline && (
        <p role="status">
          {notice.text}
          {notice.to && (
            <>
              {' '}
              <Link to={notice.to}>
                <Trans>Open saved record</Trans>
              </Link>
            </>
          )}
        </p>
      )}
      {isDefined(lastVerified) && !available && (
        <StyledDeliveryButton
          disabled={busy}
          onClick={() =>
            requestAction(() => {
              setEditor(null);
              setDraftVersion((previous) => previous + 1);
              setPeriodVersion((previous) => previous + 1);
            })
          }
        >
          <Trans>Discard monthly finance draft</Trans>
        </StyledDeliveryButton>
      )}
      {query.error && (
        <p role="alert">
          <Trans>
            Monthly finance could not be checked. Drafts are preserved. Refresh
            to retry; saved results are hidden until access is verified.
          </Trans>
        </p>
      )}
      {!data && !query.error && filtersValid && (
        <p role="status">
          <Trans>Loading monthly finance…</Trans>
        </p>
      )}
      {view === 'monthly' && (
        <FinancePeriodPanel
          key={`period:${month}:${periodVersion}`}
          month={month}
          period={data?.period}
          available={available}
          busy={busy}
          canManage={canManage}
          onStartReview={(open) =>
            requestAction(() => {
              setEditor(null);
              setDraftVersion((value) => value + 1);
              open();
            })
          }
          onChanged={async () => {
            const updates = await Promise.allSettled([
              query.refetch(),
              onChanged(),
            ]);
            if (updates.some((item) => item.status === 'rejected'))
              throw new Error(t`The latest monthly results could not refresh.`);
          }}
        />
      )}
      <StyledFinanceBoundary
        key={draftVersion}
        hidden={!available}
        disabled={!available || busy || query.loading}
      >
        <StyledDeliveryStack>
          {canManage && (
            <StyledDeliveryRow>
              {view === 'plans' ? (
                <StyledDeliveryButton
                  data-primary="true"
                  onClick={() => editPlan(null)}
                >
                  <Trans>Add monthly cost plan</Trans>
                </StyledDeliveryButton>
              ) : (
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={monthLocked}
                  onClick={() => editEntry(null)}
                >
                  <Trans>Add monthly entry</Trans>
                </StyledDeliveryButton>
              )}
              <StyledDeliveryButton
                disabled={!data?.planTotal || editor !== null || monthLocked}
                onClick={() => void prepareMonth(null)}
              >
                <Trans>Prepare this month’s cost drafts</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          )}
          {monthLocked && (
            <p role="status">
              <Trans>
                This month’s recorded results are locked. Reopen the month
                before preparing or changing recognized entries. Payments,
                matching and plan configuration remain available.
              </Trans>{' '}
              <Link to={destination({ financeView: 'monthly' })}>
                <Trans>Review month status</Trans>
              </Link>
            </p>
          )}
          {preparation && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <p>{t`${preparation.createdCount} new drafts · ${preparation.existingCount} already prepared`}</p>
                {preparation.skipped.map((item) => (
                  <p key={item.planId}>
                    {data?.plans.find((plan) => plan.id === item.planId)
                      ?.name ?? t`Cost plan`}
                    :{' '}
                    {preparationReasons[item.reason] ??
                      t`This plan needs review before its monthly draft can be prepared.`}{' '}
                    <Link
                      to={destination({
                        financeView: 'plans',
                        financePlan: item.planId,
                        financeEntry: null,
                      })}
                    >
                      <Trans>Review skipped plan</Trans>
                    </Link>
                  </p>
                ))}
                {preparation.nextPlanId && (
                  <StyledDeliveryButton
                    onClick={() =>
                      void prepareMonth(preparation.nextPlanId ?? null)
                    }
                  >
                    <Trans>Continue preparing remaining plans</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          {(() => {
            const selectedPlanInList =
              view === 'plans' &&
              Boolean(
                selectedPlan &&
                data?.plans.some((plan) => plan.id === selectedPlan.id),
              );
            const editingPlanInList =
              view === 'plans' &&
              Boolean(
                editor?.kind === 'PLAN' &&
                editor.initial &&
                data?.plans.some((plan) => plan.id === editor.initial?.id),
              );
            const editingSelectedPlanStandalone =
              view === 'plans' &&
              Boolean(
                editor?.kind === 'PLAN' &&
                editor.initial &&
                !editingPlanInList &&
                selectedPlan?.id === editor.initial.id,
              );
            const showTopPlanEditor =
              editor?.kind === 'PLAN' &&
              !editingPlanInList &&
              !editingSelectedPlanStandalone;

            const selectedEntryInList =
              view === 'monthly' &&
              Boolean(
                selectedEntry &&
                data?.entries.some((entry) => entry.id === selectedEntry.id),
              );
            const editingEntryInList =
              view === 'monthly' &&
              Boolean(
                editor?.kind === 'ENTRY' &&
                editor.initial &&
                data?.entries.some((entry) => entry.id === editor.initial?.id),
              );
            const editingSelectedEntryStandalone =
              view === 'monthly' &&
              Boolean(
                editor?.kind === 'ENTRY' &&
                editor.initial &&
                !editingEntryInList &&
                selectedEntry?.id === editor.initial.id,
              );
            const showTopEntryEditor =
              editor?.kind === 'ENTRY' &&
              !editingEntryInList &&
              !editingSelectedEntryStandalone;

            const renderEditorBanners = () => (
              <>
                {error && <p role="alert">{error}</p>}
                {permission.ready && !canManage && (
                  <p role="status">
                    <Trans>
                      Your edit permission changed. This draft is preserved with
                      read-only access; an administrator must restore editing
                      before it can be saved.
                    </Trans>
                  </p>
                )}
              </>
            );

            const renderPlanEditor = () => {
              if (editor?.kind !== 'PLAN') return null;
              return (
                <StyledDeliveryStack>
                  {renderEditorBanners()}
                  <FinancePlanForm
                    key={
                      editor.initial
                        ? `${editor.initial.id}:${editor.initial.revision}`
                        : 'new-plan'
                    }
                    month={month}
                    initial={editor.initial}
                    members={data?.members ?? []}
                    busy={busy}
                    readOnly={!canManage || !available || query.loading}
                    latestRevision={
                      editor.initial
                        ? data?.selectedPlan?.id === editor.initial.id
                          ? (data?.selectedPlan?.revision ?? -1)
                          : (data?.plans.find(
                              (plan) => plan.id === editor.initial?.id,
                            )?.revision ?? -1)
                        : 0
                    }
                    onSave={savePlanDraft}
                    onCancel={() => setEditor(null)}
                    onReload={() => {
                      const current =
                        data?.selectedPlan &&
                        data.selectedPlan.id === editor.initial?.id
                          ? data.selectedPlan
                          : data?.plans.find(
                              (plan) => plan.id === editor.initial?.id,
                            );
                      if (current)
                        setEditor({ kind: 'PLAN', initial: current });
                      else
                        setError(
                          t`This plan is not available in the current source view. Your draft is still preserved.`,
                        );
                    }}
                  />
                </StyledDeliveryStack>
              );
            };

            const renderEntryEditor = () => {
              if (editor?.kind !== 'ENTRY') return null;
              return (
                <StyledDeliveryStack>
                  {renderEditorBanners()}
                  <FinanceEntryForm
                    key={
                      editor.initial
                        ? `${editor.initial.id}:${editor.initial.revision}`
                        : 'new-entry'
                    }
                    month={month}
                    initial={editor.initial}
                    projects={data?.projects ?? []}
                    busy={busy}
                    readOnly={!canManage || !available || query.loading}
                    latestRevision={
                      editor.initial
                        ? data?.selectedEntry?.id === editor.initial.id
                          ? (data?.selectedEntry?.revision ?? -1)
                          : (data?.entries.find(
                              (entry) => entry.id === editor.initial?.id,
                            )?.revision ?? -1)
                        : 0
                    }
                    onSave={saveEntryDraft}
                    onCancel={() => setEditor(null)}
                    onReload={() => {
                      const current =
                        data?.selectedEntry &&
                        data.selectedEntry.id === editor.initial?.id
                          ? data.selectedEntry
                          : data?.entries.find(
                              (entry) => entry.id === editor.initial?.id,
                            );
                      if (current)
                        setEditor({ kind: 'ENTRY', initial: current });
                      else
                        setError(
                          t`This entry is not available in the current source view. Your draft is still preserved.`,
                        );
                    }}
                  />
                </StyledDeliveryStack>
              );
            };

            const renderPlanDetails = (
              plan: FinancePlan,
              isEditingThis: boolean,
              includeHeading: boolean,
            ) => (
              <StyledDeliveryStack>
                {includeHeading && <h3>{plan.name}</h3>}
                <p>
                  {formatFinanceAmountMicros(
                    plan.monthlyAmountMicros,
                    plan.currency,
                  )}{' '}
                  · {t`Expected due day ${plan.dueDay}`}
                </p>
                <p>
                  <Trans>
                    Shorter months use their last calendar day. Preparation
                    creates a draft, never a payment.
                  </Trans>
                </p>
                {plan.memberId && plan.memberActive === false && (
                  <p role="status">
                    <Trans>
                      This employee is no longer active. Historical obligations
                      remain available for review.
                    </Trans>
                  </p>
                )}
                {canManage && !isEditingThis && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => editPlan(plan)}
                  >
                    <Trans>Edit cost plan</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            );

            const renderEntryDetails = (
              entry: FinanceEntry,
              isEditingThis: boolean,
            ) => (
              <StyledDeliveryStack>
                <h3>{entry.title}</h3>
                <p>
                  {entry.month} ·{' '}
                  {labels.entryStatuses[entry.status] ?? entry.status} ·{' '}
                  {formatFinanceAmountMicros(
                    entry.amountMicros,
                    entry.currency,
                  )}
                </p>
                {(entry.month !== month ||
                  (currency && entry.currency !== currency)) && (
                  <p>
                    <Trans>
                      This source is outside the selected month or currency.
                    </Trans>{' '}
                    <Link
                      to={destination({
                        financeMonth: entry.month,
                        financeCurrency: entry.currency,
                        financeEntriesAfter: null,
                        financePlansAfter: null,
                      })}
                    >
                      <Trans>Open its month and currency</Trans>
                    </Link>
                  </p>
                )}
                <p>
                  {labels.sourceTypes[entry.sourceType] ?? entry.sourceType}
                  {entry.sourcePlan
                    ? ` · ${entry.sourcePlan.name} · v${entry.sourcePlan.revision}`
                    : ''}
                </p>
                {entry.status !== 'DRAFT' && (
                  <Link
                    to={financePaymentDestination({
                      entryId: entry.id,
                      currency: entry.currency,
                    })}
                  >
                    <Trans>Review payments matched to this entry</Trans>
                  </Link>
                )}
                {entry.sourcePlan && (
                  <StyledDeliveryStack>
                    <h4>
                      <Trans>Saved cost-plan source</Trans>
                    </h4>
                    <p>
                      {entry.sourcePlan.name} ·{' '}
                      {t`Revision ${entry.sourcePlan.revision}`} ·{' '}
                      {formatFinanceAmountMicros(
                        entry.sourcePlan.monthlyAmountMicros,
                        entry.currency,
                      )}
                    </p>
                    <p>
                      {entry.sourcePlan.memberName ?? t`Company overhead`} ·{' '}
                      {entry.sourcePlan.startMonth}
                      {entry.sourcePlan.endMonth
                        ? ` → ${entry.sourcePlan.endMonth}`
                        : ''}
                    </p>
                    <p>{t`Original expected due day ${entry.sourcePlan.dueDay}`}</p>
                    <Link
                      to={destination({
                        financeView: 'plans',
                        financePlan: entry.sourcePlan.planId,
                        financeEntry: null,
                        financeHistoryBefore: null,
                      })}
                    >
                      <Trans>Review current cost plan</Trans>
                    </Link>
                  </StyledDeliveryStack>
                )}
                {entry.sourceAiSpend && (
                  <FinanceAiCostOrigin origin={entry.sourceAiSpend} />
                )}
                {entry.dueDate && (
                  <p>
                    {t`Expected payment date`}: {entry.dueDate} ·{' '}
                    <Trans>No payment is recorded by this entry.</Trans>
                  </p>
                )}
                {entry.note && <p>{entry.note}</p>}
                {entry.evidenceUrl && (
                  <a href={entry.evidenceUrl} target="_blank" rel="noreferrer">
                    <Trans>Open source evidence</Trans>
                  </a>
                )}
                {entry.allocations.map((allocation) => (
                  <p key={allocation.projectId ?? 'company'}>
                    {allocation.projectName ?? t`Company / unassigned`}:{' '}
                    {formatFinanceAmountMicros(
                      allocation.amountMicros,
                      entry.currency,
                    )}
                  </p>
                ))}
                {entry.voidReason && (
                  <p>
                    {t`Voided because`}: {entry.voidReason}
                  </p>
                )}
                {(entry.lockedMonths ?? []).length > 0 && (
                  <p role="status">
                    <Trans>
                      This entry affects locked monthly results. Reopen each
                      listed month before editing, posting or voiding it.
                    </Trans>{' '}
                    {entry.lockedMonths.map((lockedMonth) => (
                      <Link
                        key={lockedMonth}
                        to={destination({
                          financeView: 'monthly',
                          financeMonth: lockedMonth,
                          financeCurrency: null,
                        })}
                      >
                        {t`Review reopening ${lockedMonth}`}{' '}
                      </Link>
                    ))}
                  </p>
                )}
                {entry.status === 'DRAFT' && (
                  <>
                    {canManage && !isEditingThis && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={(entry.lockedMonths ?? []).length > 0}
                        onClick={() => editEntry(entry)}
                      >
                        <Trans>Edit monthly draft</Trans>
                      </StyledDeliveryButton>
                    )}
                    {entry.sourceType === 'AI_SPEND' ? (
                      <FinanceAiCostPostForm
                        entry={entry}
                        canManage={canManage}
                        busy={busy}
                        disabled={
                          editor !== null ||
                          (entry.lockedMonths ?? []).length > 0 ||
                          entry.remainingAllocationMicros !== '0'
                        }
                        onPost={async (input) => {
                          const result = await perform(() =>
                            postAiCost({ variables: { input } }),
                          );
                          const saved = result?.data?.postDeliveryFinanceAiCost;
                          if (saved)
                            setNotice({
                              text:
                                saved.status === 'POSTED'
                                  ? saved.replayed
                                    ? t`This AI cost is already posted. Cash and AI spending remain unchanged.`
                                    : entry.sourceAiSpend?.replacesEntryId
                                      ? t`Correction posted. The prior entry was voided and its monthly payment matches were reversed. Cash and AI spending remain unchanged.`
                                      : t`AI cost posted. Cash and AI spending remain unchanged.`
                                  : t`This request was already processed. Review the entry’s current status and history before another change.`,
                            });
                          return Boolean(saved);
                        }}
                      />
                    ) : (
                      canManage && (
                        <DeliveryGuardedForm
                          key={`post:${entry.id}`}
                          revision={entry.revision}
                          snapshot={JSON.stringify({
                            id: entry.id,
                            revision: entry.revision,
                            sourceReviewToken: entry.sourceReviewToken,
                          })}
                          busy={busy}
                          disabled={
                            editor !== null ||
                            (entry.lockedMonths ?? []).length > 0 ||
                            entry.remainingAllocationMicros !== '0'
                          }
                          onSave={async (fields, revision) => {
                            const result = await perform(() =>
                              post({
                                variables: {
                                  input: {
                                    id: entry.id,
                                    revision,
                                    acknowledgeSourceWarnings:
                                      fields.get('acknowledge') === 'on',
                                    expectedSourceReviewToken:
                                      entry.sourceReviewToken,
                                  },
                                },
                              }),
                            );
                            if (result)
                              setNotice({
                                text: t`Entry posted to monthly results. Cash and payments remain separate.`,
                              });
                            return Boolean(result);
                          }}
                        >
                          <StyledDeliveryStack>
                            {entry.sourceWarnings.map((warning) => (
                              <p key={warning} role="status">
                                {labels.warning(warning)}
                              </p>
                            ))}
                            {entry.sourceWarnings.length > 0 && (
                              <label>
                                <input
                                  type="checkbox"
                                  name="acknowledge"
                                  required
                                />
                                <Trans>
                                  I reviewed the changed source and confirm this
                                  saved obligation belongs in this month.
                                </Trans>
                              </label>
                            )}
                            {entry.remainingAllocationMicros !== '0' && (
                              <p>
                                <Trans>
                                  Allocate the full amount before posting,
                                  including any explicit company share.
                                </Trans>
                              </p>
                            )}
                            <StyledDeliveryButton type="submit">
                              <Trans>Post reviewed entry</Trans>
                            </StyledDeliveryButton>
                          </StyledDeliveryStack>
                        </DeliveryGuardedForm>
                      )
                    )}
                  </>
                )}
                {canManage && entry.status !== 'VOID' && (
                  <details>
                    <summary>{t`Void this entry`}</summary>
                    <DeliveryGuardedForm
                      key={`void:${entry.id}`}
                      revision={entry.revision}
                      snapshot={JSON.stringify({
                        id: entry.id,
                        revision: entry.revision,
                        status: entry.status,
                      })}
                      busy={busy}
                      disabled={
                        editor !== null || (entry.lockedMonths ?? []).length > 0
                      }
                      onSave={async (fields, revision) => {
                        const result = await perform(() =>
                          voidEntry({
                            variables: {
                              input: {
                                id: entry.id,
                                revision,
                                reason: String(fields.get('reason') ?? ''),
                              },
                            },
                          }),
                        );
                        if (result)
                          setNotice({
                            text: t`Entry voided. Its source and history remain available; cash is unchanged.`,
                          });
                        return Boolean(result);
                      }}
                    >
                      <StyledDeliveryStack>
                        <label>
                          <Trans>Reason for voiding</Trans>
                          <textarea name="reason" required maxLength={2000} />
                        </label>
                        <p>
                          <Trans>
                            The source and history stay available. Posted
                            amounts stop contributing to monthly results. No
                            cash entry is changed.
                          </Trans>
                        </p>
                        <StyledDeliveryButton type="submit">
                          <Trans>Void entry and retain history</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryStack>
                    </DeliveryGuardedForm>
                  </details>
                )}
                <details
                  key={entry.id}
                  open={historyEntryId === entry.id}
                  onToggle={(event) =>
                    setHistoryEntryId(
                      event.currentTarget.open ? entry.id : null,
                    )
                  }
                >
                  <summary>{t`Source and correction history`}</summary>
                  {historyEntryId === entry.id && (
                    <FinanceEntryHistory
                      key={entry.id}
                      entryId={entry.id}
                      currency={entry.currency}
                    />
                  )}
                </details>
              </StyledDeliveryStack>
            );

            return (
              <>
                {showTopPlanEditor && (
                  <StyledDeliveryCard>{renderPlanEditor()}</StyledDeliveryCard>
                )}
                {showTopEntryEditor && (
                  <StyledDeliveryCard>{renderEntryEditor()}</StyledDeliveryCard>
                )}
                {view === 'monthly' && (
                  <FinanceMonthlyResults summaries={data?.summaries ?? []} />
                )}
                {view === 'plans' ? (
                  <>
                    <h3>{t`Cost plans (${data?.planTotal ?? 0})`}</h3>
                    {selectedPlanId && !selectedPlan && (
                      <p>
                        <Trans>
                          This cost plan is unavailable or outside your access.
                        </Trans>
                      </p>
                    )}
                    {selectedPlan && !selectedPlanInList && (
                      <StyledDeliveryCard key={`selected-${selectedPlan.id}`}>
                        {renderPlanDetails(
                          selectedPlan,
                          editingSelectedPlanStandalone,
                          true,
                        )}
                        {editingSelectedPlanStandalone && (
                          <StyledInlinePanel>
                            {renderPlanEditor()}
                          </StyledInlinePanel>
                        )}
                      </StyledDeliveryCard>
                    )}
                    {!data?.plans.length && (
                      <p>
                        <Trans>
                          No cost plans in this view. Add salary or overhead
                          with an explicit amount, currency and effective month.
                        </Trans>
                      </p>
                    )}
                    {data?.plans.map((plan) => {
                      const isSelected = selectedPlan?.id === plan.id;
                      const isEditing =
                        editor?.kind === 'PLAN' &&
                        editor.initial?.id === plan.id;
                      return (
                        <StyledDeliveryCard key={plan.id}>
                          <StyledDeliveryRow>
                            <div>
                              <strong>{plan.name}</strong>
                              <p>
                                {labels.planTypes[plan.type] ?? plan.type} ·{' '}
                                {formatFinanceAmountMicros(
                                  plan.monthlyAmountMicros,
                                  plan.currency,
                                )}{' '}
                                · {plan.active ? t`Active` : t`Inactive`}
                              </p>
                              <p>
                                {plan.memberName ?? t`Company overhead`} ·{' '}
                                {plan.startMonth}
                                {plan.endMonth ? ` → ${plan.endMonth}` : ''}
                              </p>
                            </div>
                            <StyledDeliveryRow>
                              {canManage && !isEditing && (
                                <StyledDeliveryButton
                                  type="button"
                                  aria-label={t`Edit ${plan.name}`}
                                  onClick={() => editPlan(plan)}
                                >
                                  <Trans>Edit</Trans>
                                </StyledDeliveryButton>
                              )}
                              {isSelected ? (
                                <Link
                                  to={destination({
                                    financePlan: null,
                                    financeEntry: null,
                                  })}
                                >
                                  <Trans>Hide details</Trans>
                                </Link>
                              ) : (
                                <Link
                                  to={destination({
                                    financePlan: plan.id,
                                    financeEntry: null,
                                  })}
                                >
                                  <Trans>Review plan</Trans>
                                </Link>
                              )}
                            </StyledDeliveryRow>
                          </StyledDeliveryRow>
                          {noticeShownInline &&
                            notice &&
                            notice.targetId === plan.id && (
                              <StyledInlinePanel>
                                <p role="status">{notice.text}</p>
                              </StyledInlinePanel>
                            )}
                          {isSelected &&
                            !isEditing &&
                            isDefined(selectedPlan) && (
                              <StyledInlinePanel>
                                {renderPlanDetails(selectedPlan, false, false)}
                              </StyledInlinePanel>
                            )}
                          {isEditing && (
                            <StyledInlinePanel>
                              {renderPlanEditor()}
                            </StyledInlinePanel>
                          )}
                        </StyledDeliveryCard>
                      );
                    })}
                    <StyledDeliveryRow>
                      {data?.nextPlanId && (
                        <Link
                          to={destination({
                            financePlansAfter: data.nextPlanId,
                            financePlan: null,
                          })}
                        >
                          <Trans>More cost plans</Trans>
                        </Link>
                      )}
                      {params.has('financePlansAfter') && (
                        <Link to={destination({ financePlansAfter: null })}>
                          <Trans>First cost plans</Trans>
                        </Link>
                      )}
                    </StyledDeliveryRow>
                  </>
                ) : (
                  <>
                    <h3>{t`Monthly entries (${data?.entryTotal ?? 0})`}</h3>
                    {selectedEntryId && !selectedEntry && (
                      <p>
                        <Trans>
                          This monthly entry is unavailable or outside your
                          access.
                        </Trans>
                      </p>
                    )}
                    {selectedEntry && !selectedEntryInList && (
                      <StyledDeliveryCard key={selectedEntry.id}>
                        {renderEntryDetails(
                          selectedEntry,
                          editingSelectedEntryStandalone,
                        )}
                        {editingSelectedEntryStandalone && (
                          <StyledInlinePanel>
                            {renderEntryEditor()}
                          </StyledInlinePanel>
                        )}
                      </StyledDeliveryCard>
                    )}
                    {!data?.entries.length && (
                      <p>
                        <Trans>No monthly entries in this view.</Trans>
                      </p>
                    )}
                    {data?.entries.map((entry) => {
                      const isSelected = selectedEntry?.id === entry.id;
                      const isEditing =
                        editor?.kind === 'ENTRY' &&
                        editor.initial?.id === entry.id;
                      const canQuickEdit =
                        canManage &&
                        entry.status === 'DRAFT' &&
                        (entry.lockedMonths ?? []).length === 0;
                      return (
                        <StyledDeliveryCard key={entry.id}>
                          <StyledDeliveryRow>
                            <div>
                              <strong>{entry.title}</strong>
                              <p>
                                {labels.entryStatuses[entry.status] ??
                                  entry.status}{' '}
                                · {labels.entryKinds[entry.kind] ?? entry.kind}{' '}
                                ·{' '}
                                {formatFinanceAmountMicros(
                                  entry.amountMicros,
                                  entry.currency,
                                )}
                              </p>
                              {entry.status === 'DRAFT' &&
                                entry.remainingAllocationMicros !== '0' && (
                                  <small>
                                    {t`Still to allocate`}:{' '}
                                    {formatFinanceAmountMicros(
                                      entry.remainingAllocationMicros,
                                      entry.currency,
                                    )}
                                  </small>
                                )}
                            </div>
                            <StyledDeliveryRow>
                              {canQuickEdit && !isSelected && !isEditing && (
                                <StyledDeliveryButton
                                  type="button"
                                  aria-label={t`Edit ${entry.title}`}
                                  onClick={() => editEntry(entry)}
                                >
                                  <Trans>Edit</Trans>
                                </StyledDeliveryButton>
                              )}
                              {isSelected ? (
                                <Link
                                  to={destination({
                                    financeEntry: null,
                                    financePlan: null,
                                    financeHistoryBefore: null,
                                  })}
                                >
                                  <Trans>Hide details</Trans>
                                </Link>
                              ) : (
                                <Link
                                  to={destination({
                                    financeEntry: entry.id,
                                    financePlan: null,
                                    financeHistoryBefore: null,
                                  })}
                                >
                                  <Trans>Review entry</Trans>
                                </Link>
                              )}
                            </StyledDeliveryRow>
                          </StyledDeliveryRow>
                          {noticeShownInline &&
                            notice &&
                            notice.targetId === entry.id && (
                              <StyledInlinePanel>
                                <p role="status">{notice.text}</p>
                              </StyledInlinePanel>
                            )}
                          {isSelected && isDefined(selectedEntry) && (
                            <StyledInlinePanel key={selectedEntry.id}>
                              {renderEntryDetails(selectedEntry, isEditing)}
                            </StyledInlinePanel>
                          )}
                          {isEditing && (
                            <StyledInlinePanel>
                              {renderEntryEditor()}
                            </StyledInlinePanel>
                          )}
                        </StyledDeliveryCard>
                      );
                    })}
                    <StyledDeliveryRow>
                      {data?.nextEntryId && (
                        <Link
                          to={destination({
                            financeEntriesAfter: data.nextEntryId,
                            financeEntry: null,
                          })}
                        >
                          <Trans>More monthly entries</Trans>
                        </Link>
                      )}
                      {params.has('financeEntriesAfter') && (
                        <Link to={destination({ financeEntriesAfter: null })}>
                          <Trans>First monthly entries</Trans>
                        </Link>
                      )}
                    </StyledDeliveryRow>
                  </>
                )}
              </>
            );
          })()}
        </StyledDeliveryStack>
      </StyledFinanceBoundary>
    </StyledDeliveryStack>
  );
};
