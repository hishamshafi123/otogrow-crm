import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinanceForecastQuery,
  type DeliveryFinanceForecastSourcesQuery,
  type DeliveryFinanceForecastAnchorInput,
  type DeliveryFinanceForecastItemInput,
  type DeliveryFinanceForecastRealizeInput,
  type SaveDeliveryFinanceForecastAnchorMutation,
  type SaveDeliveryFinanceForecastItemMutation,
  type RealizeDeliveryFinanceForecastOutflowMutation,
  type ReverseDeliveryFinanceForecastRealizationMutation,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type FinanceForecastSnapshot,
  type FinanceForecastSources,
} from '@/delivery/finance/finance-forecast.types';
import {
  GET_DELIVERY_FINANCE_FORECAST,
  GET_DELIVERY_FINANCE_FORECAST_SOURCES,
  SAVE_DELIVERY_FINANCE_FORECAST_ANCHOR,
  SAVE_DELIVERY_FINANCE_FORECAST_ITEM,
  REALIZE_DELIVERY_FINANCE_FORECAST_OUTFLOW,
  REVERSE_DELIVERY_FINANCE_FORECAST_REALIZATION,
} from '@/delivery/finance/delivery-finance-forecast.graphql';
import { FinanceForecastAnchorForm } from '@/delivery/finance/FinanceForecastAnchorForm';
import { FinanceForecastItemForm } from '@/delivery/finance/FinanceForecastItemForm';
import { FinanceForecastSourceReview } from '@/delivery/finance/FinanceForecastSourceReview';
import { FinanceForecastRealizationForm } from '@/delivery/finance/FinanceForecastRealizationForm';
import { FinanceForecastReasonForm } from '@/delivery/finance/FinanceForecastReasonForm';
import {
  FinanceForecastProjectionSummary,
  FinanceForecastTimeline,
} from '@/delivery/finance/FinanceForecastProjection';
import {
  FinanceForecastWorklists,
  FinanceForecastSourcesList,
  financeForecastPaymentSourceDestination,
} from '@/delivery/finance/FinanceForecastWorklists';
import { FinanceForecastHistory } from '@/delivery/finance/FinanceForecastHistory';
import { useFinanceForecastLabels } from '@/delivery/finance/useFinanceForecastLabels';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryFinanceForecastProps = { onChanged: () => Promise<unknown> };
type VerifiedForecastContentProps = { available: boolean; children: ReactNode };
const VerifiedForecastContent = ({
  available,
  children,
}: VerifiedForecastContentProps) => (available ? <>{children}</> : null);
type ForecastEditor =
  | { kind: 'ANCHOR' | 'MANUAL' | 'ITEM' | 'SOURCE' | 'REALIZE' | 'CANCEL' }
  | { kind: 'REVERSE'; id: string };
const StyledForecastBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const DeliveryFinanceForecast = ({
  onChanged,
}: DeliveryFinanceForecastProps) => {
  const permission = useWorkflowAccess();
  return (
    <ForecastWorkspace
      key={`${permission.scope}:${permission.lastVerifiedCanReadFinance}`}
      permission={permission}
      onChanged={onChanged}
    />
  );
};
const ForecastWorkspace = ({
  permission,
  onChanged,
}: DeliveryFinanceForecastProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const labels = useFinanceForecastLabels();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const currency = params.get('financeCurrency') || 'USD';
  const requestedDays = params.get('financeForecastDays') ?? '30';
  const horizonDays = requestedDays === '90' ? 90 : 30;
  const filtersValid =
    financeLabels.currencies.includes(currency) &&
    ['30', '90'].includes(requestedDays);
  const itemId = params.get('financeForecastItem');
  const sourceId = params.get('financeForecastSource');
  const kind = params.get('financeForecastKind');
  const kindValid = kind === 'RECEIVABLE' || kind === 'PLAN' || kind === 'CASH';
  const planMonth = params.get('financeForecastPlanMonth') ?? '';
  const planMonthValid = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(planMonth);
  const query = useQuery<DeliveryFinanceForecastQuery>(
    GET_DELIVERY_FINANCE_FORECAST,
    {
      variables: {
        input: {
          currency,
          horizonDays,
          selectedItemId: itemId,
          afterItemId: params.get('financeForecastItemsAfter'),
          afterExceptionKey: params.get('financeForecastExceptionsAfter'),
          afterRealizationId: params.get('financeForecastRealizationsAfter'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance || !filtersValid,
    },
  );
  const sourcesQuery = useQuery<DeliveryFinanceForecastSourcesQuery>(
    GET_DELIVERY_FINANCE_FORECAST_SOURCES,
    {
      variables: {
        input: {
          currency,
          kind: kind ?? 'RECEIVABLE',
          month: kind === 'PLAN' ? planMonth || null : null,
          afterId: params.get('financeForecastSourcesAfter'),
          selectedId: sourceId,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip:
        !permission.ready ||
        !permission.canReadFinance ||
        !filtersValid ||
        !kindValid ||
        (kind === 'PLAN' && !planMonthValid),
    },
  );
  const [saveAnchorMutation] =
    useMutation<SaveDeliveryFinanceForecastAnchorMutation>(
      SAVE_DELIVERY_FINANCE_FORECAST_ANCHOR,
    );
  const [saveItemMutation] =
    useMutation<SaveDeliveryFinanceForecastItemMutation>(
      SAVE_DELIVERY_FINANCE_FORECAST_ITEM,
    );
  const [realizeMutation] =
    useMutation<RealizeDeliveryFinanceForecastOutflowMutation>(
      REALIZE_DELIVERY_FINANCE_FORECAST_OUTFLOW,
    );
  const [reverseMutation] =
    useMutation<ReverseDeliveryFinanceForecastRealizationMutation>(
      REVERSE_DELIVERY_FINANCE_FORECAST_REALIZATION,
    );
  const candidate = query.data?.deliveryFinanceForecast;
  const available =
    filtersValid &&
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.currency === currency &&
    candidate.horizonDays === horizonDays;
  const [lastVerified, setLastVerified] =
    useState<FinanceForecastSnapshot | null>(null);
  if (available && candidate !== lastVerified) setLastVerified(candidate);
  const data = available ? candidate : lastVerified;
  const sourceCandidate = sourcesQuery.data?.deliveryFinanceForecastSources;
  const sourcesAvailable =
    available &&
    kindValid &&
    (kind !== 'PLAN' || planMonthValid) &&
    !sourcesQuery.error &&
    permission.matches(sourceCandidate) &&
    sourceCandidate?.currency === currency &&
    sourceCandidate.kind === kind;
  const [lastSources, setLastSources] = useState<FinanceForecastSources | null>(
    null,
  );
  if (sourcesAvailable && sourceCandidate !== lastSources)
    setLastSources(sourceCandidate);
  const sources = sourcesAvailable ? sourceCandidate : lastSources;
  const item =
    data?.selectedItem?.id === itemId
      ? data.selectedItem
      : data?.items.find((entry) => entry.id === itemId);
  const source =
    sources?.selectedSource?.id === sourceId
      ? sources.selectedSource
      : sources?.sources.find((entry) => entry.id === sourceId);
  const canManage =
    available && permission.canManageFinance && data?.canManage === true;
  const [editor, setEditor] = useState<ForecastEditor | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const destination = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    next.set('financeView', 'forecast');
    next.set('financeCurrency', currency);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/delivery?${next}`;
  };
  const openEditor = (value: ForecastEditor) =>
    requestAction(() => {
      setEditor(value);
      setFormVersion((version) => version + 1);
      setError('');
      setNotice('');
    });
  const closeEditor = () => setEditor(null);
  const perform = async <TResult,>(
    operation: () => Promise<TResult | null | undefined>,
  ): Promise<TResult | null> => {
    if (!available || !canManage || busy || query.loading) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await operation();
      if (!isDefined(result))
        throw new Error(t`The saved cash forecast change was not confirmed.`);
      setEditor(null);
      setHistoryVersion((version) => version + 1);
      const refresh = await Promise.allSettled([
        query.refetch(),
        ...(kindValid && (kind !== 'PLAN' || planMonthValid)
          ? [sourcesQuery.refetch()]
          : []),
        onChanged(),
      ]);
      if (refresh.some((entry) => entry.status === 'rejected'))
        setError(
          t`Saved, but the latest forecast could not refresh. Refresh before another change.`,
        );
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`This cash forecast change could not be saved. Your draft is kept.`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  const saveAnchor = async (input: DeliveryFinanceForecastAnchorInput) => {
    const result = await perform(
      async () =>
        (await saveAnchorMutation({ variables: { input } })).data
          ?.saveDeliveryFinanceForecastAnchor,
    );
    if (result)
      setNotice(
        result.replayed
          ? t`This earlier balance review was already processed. The current starting cash is shown.`
          : t`Starting cash confirmed. No actual cash record or monthly result was changed.`,
      );
    return Boolean(result);
  };
  const saveItem = async (input: DeliveryFinanceForecastItemInput) => {
    const result = await perform(
      async () =>
        (await saveItemMutation({ variables: { input } })).data
          ?.saveDeliveryFinanceForecastItem,
    );
    if (result)
      setNotice(
        result.replayed
          ? t`This earlier expectation review was already processed. Review its current status below.`
          : result.item.status === 'CANCELLED'
            ? t`Expectation cancelled. Actual payments and monthly results remain unchanged.`
            : t`Expectation saved. No actual payment, invoice settlement or monthly result was changed.`,
      );
    return Boolean(result);
  };
  const realize = async (input: DeliveryFinanceForecastRealizeInput) => {
    if (!sourcesAvailable || sources?.canManage !== true) return false;
    const result = await perform(
      async () =>
        (await realizeMutation({ variables: { input } })).data
          ?.realizeDeliveryFinanceForecastOutflow,
    );
    if (result)
      setNotice(
        result.realization.status === 'ACTIVE'
          ? result.replayed
            ? t`This recorded payment was already applied. Review its current application below.`
            : t`Recorded payment applied to the expectation. Cash was counted once; monthly matching is unchanged.`
          : t`This request was already processed and its application is now reversed. Review the retained history.`,
      );
    return Boolean(result);
  };
  const reload = async () => {
    try {
      const refreshed = (await query.refetch()).data?.deliveryFinanceForecast;
      if (
        !permission.matches(refreshed) ||
        refreshed?.currency !== currency ||
        refreshed.horizonDays !== horizonDays
      )
        throw new Error();
      if (editor?.kind === 'SOURCE' || editor?.kind === 'REALIZE') {
        const refreshedSources = (await sourcesQuery.refetch()).data
          ?.deliveryFinanceForecastSources;
        if (
          !permission.matches(refreshedSources) ||
          refreshedSources?.currency !== currency ||
          refreshedSources.kind !== kind
        )
          throw new Error();
      }
      setFormVersion((version) => version + 1);
    } catch {
      setError(t`The current source could not be checked. Your draft is kept.`);
    }
  };
  const needsSource = editor?.kind === 'SOURCE' || editor?.kind === 'REALIZE';
  const historyType = params.get('financeForecastHistoryType');
  const historyId = params.get('financeForecastHistoryId');
  const amount = (value: string | null | undefined) =>
    !isDefined(value)
      ? t`Not confirmed`
      : formatFinanceAmountMicros(value, currency);
  if (permission.ready && !permission.canReadFinance)
    return (
      <p>
        <Trans>Finance access is required to view cash forecasts.</Trans>
      </p>
    );
  return (
    <StyledDeliveryStack>
      <h2>
        <Trans>Cash forecast</Trans>
      </h2>
      <p>
        <Trans>
          Review recorded cash and expected collections and payments. This
          scenario is separate from monthly results and does not move money.
        </Trans>
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const next = new URLSearchParams(params);
          next.set('financeCurrency', String(fields.get('currency') ?? 'USD'));
          next.set('financeForecastDays', String(fields.get('days') ?? '30'));
          for (const key of [
            'financeForecastItem',
            'financeForecastSource',
            'financeForecastItemsAfter',
            'financeForecastExceptionsAfter',
            'financeForecastSourcesAfter',
            'financeForecastRealizationsAfter',
            'financeForecastHistoryId',
            'financeForecastHistoryType',
            'financeForecastHistoryBefore',
          ])
            next.delete(key);
          setParams(next);
        }}
      >
        <StyledDeliveryRow>
          <label>
            <Trans>Forecast currency</Trans>
            <select name="currency" defaultValue={currency}>
              {financeLabels.currencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Forecast horizon</Trans>
            <select name="days" defaultValue={requestedDays}>
              <option value="30">{t`30 days`}</option>
              <option value="90">{t`90 days`}</option>
            </select>
          </label>
          <StyledDeliveryButton type="submit" disabled={busy}>
            <Trans>Apply forecast filters</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </form>
      {!filtersValid && (
        <p role="alert">
          <Trans>
            Choose a supported currency and a 30- or 90-day horizon.
          </Trans>
        </p>
      )}
      {!available && (
        <p role={query.error || permission.error ? 'alert' : 'status'}>
          {query.error || permission.error
            ? t`Cash forecast could not be checked. Saved figures are hidden and your draft is kept.`
            : t`Checking current cash forecast…`}{' '}
          <StyledDeliveryButton
            type="button"
            disabled={busy || query.loading}
            onClick={() =>
              void (
                permission.ready ? query.refetch() : permission.refetch()
              ).catch(() => undefined)
            }
          >
            <Trans>Refresh cash forecast</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {!available && itemId && (
        <Link
          to={destination({
            financeForecastItem: null,
            financeForecastRealizationsAfter: null,
            financeForecastHistoryBefore: null,
            financeForecastHistoryId: null,
            financeForecastHistoryType: null,
          })}
        >
          <Trans>Clear expectation selection</Trans>
        </Link>
      )}
      {editor && !available && (
        <StyledDeliveryButton
          type="button"
          disabled={busy}
          onClick={() =>
            requestAction(() => {
              setEditor(null);
              setFormVersion((value) => value + 1);
            })
          }
        >
          <Trans>Discard cash forecast draft</Trans>
        </StyledDeliveryButton>
      )}
      <StyledForecastBoundary
        hidden={!available}
        disabled={!available || busy || query.loading}
      >
        {data && (
          <StyledDeliveryStack>
            <VerifiedForecastContent available={available}>
              {error && <p role="alert">{error}</p>}
              {notice && <p role="status">{notice}</p>}
              <StyledDeliveryRow>
                <strong>{currency}</strong>
                <span>
                  {data.businessDate && data.timezone
                    ? t`Business date: ${data.businessDate} · ${data.timezone}`
                    : t`Business date and starting cash are not confirmed`}
                </span>
                <StyledDeliveryButton
                  type="button"
                  disabled={busy || query.loading}
                  onClick={() => void query.refetch().catch(() => undefined)}
                >
                  <Trans>Refresh cash forecast</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </VerifiedForecastContent>
            <StyledDeliveryCard>
              <VerifiedForecastContent available={available}>
                <h3>
                  <Trans>Starting cash</Trans>
                </h3>
                {data.anchor ? (
                  <>
                    <p>
                      {amount(data.anchor.amountMicros)} · {t`Closing through`}{' '}
                      {data.anchor.closingDate} · {data.anchor.timezone}
                    </p>
                    <small>
                      {data.anchor.changedByName} ·{' '}
                      {new Date(data.anchor.changedAt).toLocaleString()}
                    </small>
                    <p>{data.anchor.note}</p>
                    {data.anchor.evidenceUrl && (
                      <a
                        href={data.anchor.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Trans>Balance evidence</Trans>
                      </a>
                    )}
                    <p>
                      {t`Recorded cash received since closing`}:{' '}
                      {amount(data.actualInflowMicros)} ·{' '}
                      {t`Recorded cash paid since closing`}:{' '}
                      {amount(data.actualOutflowMicros)}
                    </p>
                    <Link
                      to={destination({
                        financeForecastHistoryType: 'ANCHOR',
                        financeForecastHistoryId: data.anchor.id,
                        financeForecastHistoryBefore: null,
                      })}
                    >
                      <Trans>Starting cash history</Trans>
                    </Link>
                  </>
                ) : (
                  <p role="status">
                    <Trans>
                      Starting cash is unknown. Confirm a dated closing balance
                      before a cash projection can be calculated.
                    </Trans>
                  </p>
                )}
                {canManage && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openEditor({ kind: 'ANCHOR' })}
                  >
                    {data.anchor
                      ? t`Review starting cash`
                      : t`Set up starting cash`}
                  </StyledDeliveryButton>
                )}
              </VerifiedForecastContent>
              {editor?.kind === 'ANCHOR' && (
                <FinanceForecastAnchorForm
                  key={formVersion}
                  initial={data.anchor ?? null}
                  currency={currency}
                  busy={busy}
                  readOnly={!canManage}
                  onSave={saveAnchor}
                  onCancel={closeEditor}
                  onReload={() => void reload()}
                />
              )}
            </StyledDeliveryCard>
            <VerifiedForecastContent available={available}>
              {data.anchor && (
                <FinanceForecastProjectionSummary
                  projection={data}
                  currency={currency}
                  incomplete={!data.projectionComplete}
                />
              )}
              <FinanceForecastWorklists
                data={data}
                destination={destination}
                canManage={canManage}
                hasItemCursor={params.has('financeForecastItemsAfter')}
                hasExceptionCursor={params.has(
                  'financeForecastExceptionsAfter',
                )}
              />
              <StyledDeliveryRow>
                <Link
                  to={destination({
                    financeForecastKind: 'RECEIVABLE',
                    financeForecastSource: null,
                    financeForecastSourcesAfter: null,
                  })}
                >
                  <Trans>Schedule invoice collections</Trans>
                </Link>
                <Link
                  to={destination({
                    financeForecastKind: 'PLAN',
                    financeForecastSource: null,
                    financeForecastSourcesAfter: null,
                    financeForecastPlanMonth:
                      planMonth || data.businessDate?.slice(0, 7) || null,
                  })}
                >
                  <Trans>Review plan payments</Trans>
                </Link>
                <Link
                  to={destination({
                    financeForecastKind: 'CASH',
                    financeForecastSource: null,
                    financeForecastSourcesAfter: null,
                  })}
                >
                  <Trans>Review actual outgoing payments</Trans>
                </Link>
                {canManage && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openEditor({ kind: 'MANUAL' })}
                  >
                    <Trans>Add one-off expected payment</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
            </VerifiedForecastContent>
            {editor?.kind === 'MANUAL' && (
              <FinanceForecastItemForm
                key={formVersion}
                initial={null}
                source={null}
                owners={data.owners}
                currency={currency}
                busy={busy}
                readOnly={!canManage}
                onSave={saveItem}
                onCancel={closeEditor}
                onReload={() => void reload()}
              />
            )}
            {item && (
              <StyledDeliveryCard>
                <VerifiedForecastContent available={available}>
                  <h3>{item.title}</h3>
                  <p>
                    {labels.status(item.status)} · {t`Remaining`}:{' '}
                    {amount(item.remainingMicros)} · {t`Expected date`}:{' '}
                    {item.expectedDate ?? t`Not scheduled`}
                  </p>
                  <p>
                    {item.kind === 'COLLECTION'
                      ? t`Invoice balance at last review`
                      : t`Reviewed payment amount`}
                    : {amount(item.amountMicros)}
                    {item.kind === 'OUTFLOW' &&
                      ` · ${t`Applied actual payments`}: ${amount(item.appliedMicros)}`}
                  </p>
                  <p>
                    {t`Owner`}: {item.ownerName} · {t`Next action`}:{' '}
                    {item.nextActionDate}
                  </p>
                  <p>{item.note}</p>
                  {item.contractualDueDate && (
                    <p>
                      {t`Contractual invoice due date`}:{' '}
                      {item.contractualDueDate}
                    </p>
                  )}
                  {item.warnings.map((warning) => (
                    <p key={warning} role="status">
                      {labels.warning(warning)}
                    </p>
                  ))}
                  {item.sourceId &&
                    (item.sourceType === 'RECEIVABLE' ? (
                      <Link
                        to={financeForecastPaymentSourceDestination(
                          currency,
                          'RECEIVABLE',
                          item.sourceId,
                        )}
                      >
                        <Trans>Open original invoice</Trans>
                      </Link>
                    ) : item.sourceType === 'PLAN' ? (
                      <Link
                        to={`/delivery?view=finance&financeView=plans&financeCurrency=${currency}&financePlan=${item.sourceId}&financeMonth=${item.planMonth}`}
                      >
                        <Trans>Open cost plan</Trans>
                      </Link>
                    ) : null)}
                  <StyledDeliveryRow>
                    {canManage && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => openEditor({ kind: 'ITEM' })}
                      >
                        {item.status === 'CANCELLED'
                          ? t`Review reactivating expectation`
                          : t`Review expectation`}
                      </StyledDeliveryButton>
                    )}
                    {canManage && item.status === 'ACTIVE' && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => openEditor({ kind: 'CANCEL' })}
                      >
                        <Trans>Cancel expectation</Trans>
                      </StyledDeliveryButton>
                    )}
                    {item.kind === 'OUTFLOW' && item.status === 'ACTIVE' && (
                      <Link
                        to={destination({
                          financeForecastKind: 'CASH',
                          financeForecastSource: null,
                          financeForecastSourcesAfter: null,
                        })}
                      >
                        <Trans>Choose recorded payment to apply</Trans>
                      </Link>
                    )}
                    <Link
                      to={destination({
                        financeForecastHistoryType: 'ITEM',
                        financeForecastHistoryId: item.id,
                        financeForecastHistoryBefore: null,
                      })}
                    >
                      <Trans>Expectation history</Trans>
                    </Link>
                  </StyledDeliveryRow>
                </VerifiedForecastContent>
                {editor?.kind === 'ITEM' &&
                  (item.sourceType !== 'MANUAL' ? (
                    <FinanceForecastSourceReview
                      key={formVersion}
                      item={item}
                      owners={data.owners}
                      busy={busy}
                      readOnly={!canManage}
                      onSave={saveItem}
                      onCancel={closeEditor}
                      refreshItem={() => query.refetch()}
                    />
                  ) : (
                    <FinanceForecastItemForm
                      key={formVersion}
                      initial={item}
                      source={null}
                      owners={data.owners}
                      currency={currency}
                      busy={busy}
                      readOnly={!canManage}
                      onSave={saveItem}
                      onCancel={closeEditor}
                      onReload={() => void reload()}
                    />
                  ))}
                {editor?.kind === 'CANCEL' && (
                  <FinanceForecastReasonForm
                    key={formVersion}
                    label={t`Reason for cancelling expectation`}
                    buttonLabel={t`Cancel expected cash flow`}
                    snapshot={item.reviewToken}
                    busy={busy}
                    readOnly={!canManage}
                    onCancel={closeEditor}
                    onReload={() => void reload()}
                    onConfirm={(reason, commandId) =>
                      saveItem({
                        commandId,
                        id: item.id,
                        revision: item.revision,
                        status: 'CANCELLED',
                        sourceType: item.sourceType,
                        sourceId: item.sourceId,
                        planMonth: item.planMonth,
                        currency: item.currency,
                        title: item.title,
                        amountMicros: item.amountMicros,
                        expectedDate: item.expectedDate,
                        ownerId: item.ownerId,
                        nextActionDate: item.nextActionDate,
                        note: item.note,
                        expectedSourceReviewToken: item.sourceReviewToken,
                        reason,
                        acknowledgeSourceWarnings: false,
                      })
                    }
                  />
                )}
              </StyledDeliveryCard>
            )}
            {kindValid && (
              <StyledDeliveryCard>
                <VerifiedForecastContent available={available}>
                  <h3>
                    {kind === 'RECEIVABLE'
                      ? t`Outstanding invoice sources`
                      : kind === 'PLAN'
                        ? t`Plan-month payment suggestions`
                        : t`Recorded outgoing payments`}
                  </h3>
                  {kind === 'PLAN' && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        const next = new URLSearchParams(params);
                        next.set(
                          'financeForecastPlanMonth',
                          String(fields.get('planMonth') ?? ''),
                        );
                        next.delete('financeForecastSourcesAfter');
                        next.delete('financeForecastSource');
                        setParams(next);
                      }}
                    >
                      <label>
                        <Trans>Plan service month</Trans>
                        <input
                          name="planMonth"
                          type="month"
                          required
                          defaultValue={planMonth}
                        />
                      </label>
                      <StyledDeliveryButton type="submit">
                        <Trans>Find plan suggestions</Trans>
                      </StyledDeliveryButton>
                    </form>
                  )}
                </VerifiedForecastContent>
                {kind === 'PLAN' && !planMonthValid ? (
                  <VerifiedForecastContent available={available}>
                    <p>
                      <Trans>
                        Choose a service month to find eligible plan
                        suggestions.
                      </Trans>
                    </p>
                  </VerifiedForecastContent>
                ) : (
                  <>
                    {available && !sourcesAvailable && (
                      <p role={sourcesQuery.error ? 'alert' : 'status'}>
                        {sourcesQuery.error
                          ? t`Source details could not be checked. Saved source figures are hidden and your draft is kept.`
                          : t`Checking forecast sources…`}{' '}
                        <StyledDeliveryButton
                          type="button"
                          disabled={busy || sourcesQuery.loading}
                          onClick={() =>
                            void sourcesQuery.refetch().catch(() => undefined)
                          }
                        >
                          <Trans>Refresh forecast sources</Trans>
                        </StyledDeliveryButton>
                      </p>
                    )}
                    {available && !sourcesAvailable && sourceId && (
                      <Link
                        to={destination({
                          financeForecastSource: null,
                          financeForecastSourcesAfter: null,
                        })}
                      >
                        <Trans>Clear forecast source selection</Trans>
                      </Link>
                    )}
                    <StyledForecastBoundary
                      hidden={!sourcesAvailable}
                      disabled={
                        !sourcesAvailable || busy || sourcesQuery.loading
                      }
                    >
                      {sourcesAvailable && sources && (
                        <FinanceForecastSourcesList
                          data={sources}
                          destination={destination}
                          hasCursor={params.has('financeForecastSourcesAfter')}
                        />
                      )}
                      {source && (
                        <StyledDeliveryStack>
                          <VerifiedForecastContent available={sourcesAvailable}>
                            <h4>{source.title}</h4>
                            <p>
                              {t`Original recorded amount`}:{' '}
                              {amount(source.amountMicros)} ·{' '}
                              {source.sourceType === 'CASH'
                                ? t`Unapplied payment`
                                : t`Remaining amount`}
                              : {amount(source.remainingMicros)}
                            </p>
                            {source.date && (
                              <p>
                                {t`Original record date`}: {source.date}
                              </p>
                            )}
                            {source.dueDate && (
                              <p>
                                {t`Contractual due date`}: {source.dueDate}
                              </p>
                            )}
                            {source.suggestedDate && (
                              <p>
                                {t`Suggested payment date`}:{' '}
                                {source.suggestedDate}
                              </p>
                            )}
                            {source.warnings.map((warning) => (
                              <p key={warning}>{labels.warning(warning)}</p>
                            ))}
                            {source.sourceType === 'CASH' ||
                            source.sourceType === 'RECEIVABLE' ? (
                              <Link
                                to={financeForecastPaymentSourceDestination(
                                  currency,
                                  source.sourceType,
                                  source.id,
                                )}
                              >
                                <Trans>
                                  Open original cash or invoice record
                                </Trans>
                              </Link>
                            ) : null}
                            {source.occurrenceItemId ? (
                              <Link
                                to={destination({
                                  financeForecastItem: source.occurrenceItemId,
                                  financeForecastRealizationsAfter: null,
                                })}
                              >
                                <Trans>Open existing expectation</Trans>
                              </Link>
                            ) : (
                              source.sourceType !== 'CASH' &&
                              canManage &&
                              sources?.canManage && (
                                <StyledDeliveryButton
                                  type="button"
                                  disabled={!source.eligible}
                                  onClick={() => openEditor({ kind: 'SOURCE' })}
                                >
                                  {source.sourceType === 'RECEIVABLE'
                                    ? t`Schedule this collection`
                                    : t`Confirm plan-month payment`}
                                </StyledDeliveryButton>
                              )
                            )}
                            {source.sourceType === 'CASH' &&
                              (!item ||
                                item.kind !== 'OUTFLOW' ||
                                item.status !== 'ACTIVE') && (
                                <p>
                                  <Trans>
                                    Open an active expected payment from the
                                    follow-up list, then choose this recorded
                                    payment to apply.
                                  </Trans>
                                </p>
                              )}
                            {source.sourceType === 'CASH' &&
                              item?.kind === 'OUTFLOW' &&
                              item.status === 'ACTIVE' &&
                              canManage &&
                              sources?.canManage && (
                                <StyledDeliveryButton
                                  type="button"
                                  disabled={
                                    !source.eligible ||
                                    !isDefined(source.remainingMicros) ||
                                    !isDefined(item.remainingMicros) ||
                                    source.remainingMicros === '0' ||
                                    item.remainingMicros === '0' ||
                                    !item.ownerEligible ||
                                    (item.sourceType === 'PLAN' &&
                                      (!isDefined(item.sourceReviewToken) ||
                                        item.warnings.some((warning) =>
                                          [
                                            'SOURCE_CHANGED',
                                            'MISSING_SOURCE',
                                          ].includes(warning),
                                        )))
                                  }
                                  onClick={() =>
                                    openEditor({ kind: 'REALIZE' })
                                  }
                                >
                                  <Trans>Apply to selected expectation</Trans>
                                </StyledDeliveryButton>
                              )}
                          </VerifiedForecastContent>
                          {editor?.kind === 'SOURCE' && (
                            <FinanceForecastItemForm
                              key={formVersion}
                              initial={null}
                              source={source}
                              owners={data.owners}
                              currency={currency}
                              busy={busy}
                              readOnly={
                                !canManage ||
                                !sourcesAvailable ||
                                sources?.canManage !== true
                              }
                              onSave={async (input) =>
                                sourcesAvailable && sources?.canManage === true
                                  ? saveItem(input)
                                  : false
                              }
                              onCancel={closeEditor}
                              onReload={() => void reload()}
                            />
                          )}
                          {editor?.kind === 'REALIZE' && item && (
                            <FinanceForecastRealizationForm
                              key={formVersion}
                              item={item}
                              cash={source}
                              busy={busy}
                              readOnly={
                                !canManage ||
                                !sourcesAvailable ||
                                sources?.canManage !== true
                              }
                              onSave={realize}
                              onCancel={closeEditor}
                              onReload={() => void reload()}
                            />
                          )}
                        </StyledDeliveryStack>
                      )}
                    </StyledForecastBoundary>
                    {available && needsSource && !sourcesAvailable && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => requestAction(closeEditor)}
                      >
                        <Trans>Discard source review</Trans>
                      </StyledDeliveryButton>
                    )}
                  </>
                )}
              </StyledDeliveryCard>
            )}
            {item?.kind === 'OUTFLOW' && (
              <section aria-label={t`Actual payment applications`}>
                <VerifiedForecastContent available={available}>
                  <h3>
                    <Trans>Applied outgoing payments</Trans>
                  </h3>
                  {!data.realizations.length && (
                    <p>
                      <Trans>
                        No recorded payment applications on this page.
                      </Trans>
                    </p>
                  )}
                </VerifiedForecastContent>
                {data.realizations.map((relation) => (
                  <article key={relation.id}>
                    <VerifiedForecastContent available={available}>
                      <strong>
                        {relation.cashTitle} → {relation.targetTitle}
                      </strong>
                      <p>
                        {amount(relation.amountMicros)} ·{' '}
                        {labels.status(relation.status)} ·{' '}
                        {relation.createdByName} ·{' '}
                        {new Date(relation.createdAt).toLocaleString()}
                      </p>
                      <p>{relation.note}</p>
                      {relation.reversalReason && (
                        <p>
                          {t`Reversal reason`}: {relation.reversalReason}
                        </p>
                      )}
                      <StyledDeliveryRow>
                        <Link
                          to={financeForecastPaymentSourceDestination(
                            currency,
                            'CASH',
                            relation.cashId,
                          )}
                        >
                          <Trans>Open recorded payment</Trans>
                        </Link>
                        <Link
                          to={destination({
                            financeForecastHistoryType: 'REALIZATION',
                            financeForecastHistoryId: relation.id,
                            financeForecastHistoryBefore: null,
                          })}
                        >
                          <Trans>Application history</Trans>
                        </Link>
                        {canManage && relation.status === 'ACTIVE' && (
                          <StyledDeliveryButton
                            type="button"
                            onClick={() =>
                              openEditor({ kind: 'REVERSE', id: relation.id })
                            }
                          >
                            <Trans>Reverse payment application</Trans>
                          </StyledDeliveryButton>
                        )}
                      </StyledDeliveryRow>
                    </VerifiedForecastContent>
                    {editor?.kind === 'REVERSE' &&
                      editor.id === relation.id && (
                        <FinanceForecastReasonForm
                          key={formVersion}
                          label={t`Reason for reversing payment application`}
                          buttonLabel={t`Reverse this application`}
                          snapshot={`${relation.id}:${relation.revision}:${relation.status}`}
                          busy={busy}
                          readOnly={!canManage}
                          onCancel={closeEditor}
                          onReload={() => void reload()}
                          onConfirm={async (reason) => {
                            const result = await perform(
                              async () =>
                                (
                                  await reverseMutation({
                                    variables: {
                                      input: {
                                        id: relation.id,
                                        revision: relation.revision,
                                        reason,
                                      },
                                    },
                                  })
                                ).data
                                  ?.reverseDeliveryFinanceForecastRealization,
                            );
                            if (result)
                              setNotice(
                                t`Payment application reversed. The actual payment and monthly matching remain unchanged.`,
                              );
                            return Boolean(result);
                          }}
                        />
                      )}
                  </article>
                ))}
                <VerifiedForecastContent available={available}>
                  {data.nextRealizationId && (
                    <Link
                      to={destination({
                        financeForecastRealizationsAfter:
                          data.nextRealizationId,
                      })}
                    >
                      <Trans>More payment applications</Trans>
                    </Link>
                  )}
                  {params.has('financeForecastRealizationsAfter') && (
                    <Link
                      to={destination({
                        financeForecastRealizationsAfter: null,
                      })}
                    >
                      <Trans>First payment applications</Trans>
                    </Link>
                  )}
                </VerifiedForecastContent>
              </section>
            )}
            <VerifiedForecastContent available={available}>
              {historyId &&
                (historyType === 'ANCHOR' ||
                  historyType === 'ITEM' ||
                  historyType === 'REALIZATION') && (
                  <StyledDeliveryCard>
                    <h3>
                      <Trans>Recorded forecast changes</Trans>
                    </h3>
                    <FinanceForecastHistory
                      key={`${historyType}:${historyId}:${historyVersion}`}
                      sourceType={historyType}
                      sourceId={historyId}
                      enabled={available}
                    />
                  </StyledDeliveryCard>
                )}
              {data.anchor && (
                <FinanceForecastTimeline
                  projection={data}
                  currency={currency}
                  incomplete={!data.projectionComplete}
                />
              )}
            </VerifiedForecastContent>
          </StyledDeliveryStack>
        )}
      </StyledForecastBoundary>
    </StyledDeliveryStack>
  );
};
