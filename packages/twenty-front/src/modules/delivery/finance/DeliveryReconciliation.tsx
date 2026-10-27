import { StyledFinanceNavigation } from '@/delivery/finance/financeStyles';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinancePaymentsQuery,
  type DeliveryFinancePaymentInput,
  type DeliveryFinanceReverseRelationInput,
  type RecordDeliveryFinancePaymentMutation,
  type SettleDeliveryFinanceReceivableMutation,
  type MatchDeliveryFinanceCashMutation,
  type ReverseDeliveryFinanceRelationMutation,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { ReconciliationPaymentForm } from '@/delivery/finance/ReconciliationPaymentForm';
import {
  ReconciliationAllocationForm,
  type ReconciliationAllocationInput,
} from '@/delivery/finance/ReconciliationAllocationForm';
import {
  ReconciliationSources,
  type ReconciliationList,
} from '@/delivery/finance/ReconciliationSources';
import { ReconciliationHistory } from '@/delivery/finance/ReconciliationHistory';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { ReconciliationSelection } from '@/delivery/finance/ReconciliationSelection';
import {
  GET_DELIVERY_FINANCE_PAYMENTS,
  RECORD_DELIVERY_FINANCE_PAYMENT,
  SETTLE_DELIVERY_FINANCE_RECEIVABLE,
  MATCH_DELIVERY_FINANCE_CASH,
  REVERSE_DELIVERY_FINANCE_RELATION,
} from '@/delivery/finance/delivery-finance-payments.graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PaymentsSnapshot = DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
type DeliveryReconciliationProps = { onChanged: () => Promise<unknown> };
type PaymentEditor = 'PAYMENT' | 'SETTLEMENT' | 'MATCH';
const StyledPaymentBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
const cashLedgerDate = () => new Date().toISOString().slice(0, 10);
export const DeliveryReconciliation = ({
  onChanged,
}: DeliveryReconciliationProps) => {
  const permission = useWorkflowAccess();
  return (
    <PaymentsWorkspace
      key={`${permission.scope}:${permission.lastVerifiedCanReadFinance}`}
      permission={permission}
      onChanged={onChanged}
    />
  );
};
const PaymentsWorkspace = ({
  onChanged,
  permission,
}: DeliveryReconciliationProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const currency = params.get('financeCurrency') ?? '';
  const currencyValid =
    !currency || financeLabels.currencies.includes(currency);
  const selectedCashId = params.get('financeCash');
  const selectedReceivableId = params.get('financeReceivable');
  const selectedEntryId = params.get('financeMatchEntry');
  const requestedList = params.get('financeList');
  const list: ReconciliationList =
    requestedList === 'receivables' || requestedList === 'monthly'
      ? requestedList
      : 'cash';
  const query = useQuery<DeliveryFinancePaymentsQuery>(
    GET_DELIVERY_FINANCE_PAYMENTS,
    {
      variables: {
        input: {
          currency: currency || null,
          selectedCashId,
          selectedReceivableId,
          selectedEntryId,
          afterCashId: params.get('financeCashAfter'),
          afterReceivableId: params.get('financeReceivablesAfter'),
          afterEntryId: params.get('financeMatchEntriesAfter'),
          afterSettlementId: params.get('financeSettlementsAfter'),
          afterMatchId: params.get('financeMatchesAfter'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance || !currencyValid,
    },
  );
  const [recordPayment] = useMutation<RecordDeliveryFinancePaymentMutation>(
    RECORD_DELIVERY_FINANCE_PAYMENT,
  );
  const [settle] = useMutation<SettleDeliveryFinanceReceivableMutation>(
    SETTLE_DELIVERY_FINANCE_RECEIVABLE,
  );
  const [match] = useMutation<MatchDeliveryFinanceCashMutation>(
    MATCH_DELIVERY_FINANCE_CASH,
  );
  const [reverse] = useMutation<ReverseDeliveryFinanceRelationMutation>(
    REVERSE_DELIVERY_FINANCE_RELATION,
  );
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<PaymentEditor | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; to?: string } | null>(
    null,
  );
  const candidate = query.data?.deliveryFinancePayments;
  const available =
    currencyValid &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.currency === (currency || null);
  const [lastVerified, setLastVerified] = useState<PaymentsSnapshot | null>(
    null,
  );
  if (available && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const data = available && isDefined(candidate) ? candidate : lastVerified;
  const canManage = permission.canManageFinance && data?.canManage === true;
  const selectedCash =
    data?.selectedCash?.id === selectedCashId
      ? data.selectedCash
      : data?.cash.find((item) => item.id === selectedCashId);
  const selectedReceivable =
    data?.selectedReceivable?.id === selectedReceivableId
      ? data.selectedReceivable
      : data?.receivables.find((item) => item.id === selectedReceivableId);
  const selectedEntry =
    data?.selectedEntry?.id === selectedEntryId
      ? data.selectedEntry
      : data?.entries.find((item) => item.id === selectedEntryId);
  const receivables =
    isDefined(selectedReceivable) &&
    !data?.receivables.some((item) => item.id === selectedReceivable.id)
      ? [selectedReceivable, ...(data?.receivables ?? [])]
      : (data?.receivables ?? []);
  const entries =
    isDefined(selectedEntry) &&
    !data?.entries.some((item) => item.id === selectedEntry.id)
      ? [selectedEntry, ...(data?.entries ?? [])]
      : (data?.entries ?? []);
  const destination = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    next.set('financeView', 'payments');
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
          t`Saved, but the payment view could not refresh. Refresh source details before another change.`,
        );
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`This change could not be saved. Your draft is kept.`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  const openEditor = (kind: PaymentEditor) =>
    requestAction(() => {
      setEditor(kind);
      setEditorVersion((previous) => previous + 1);
      setError('');
    });
  const savePayment = async (input: DeliveryFinancePaymentInput) => {
    const result = await perform(() => recordPayment({ variables: { input } }));
    const id = result?.data?.recordDeliveryFinancePayment;
    if (!id) return false;
    setEditor(null);
    setNotice({
      text: t`Payment recorded. Apply it to an invoice or match it to posted monthly results separately.`,
      to: destination({
        financeCash: id,
        financeSettlementsAfter: null,
        financeMatchesAfter: null,
      }),
    });
    return true;
  };
  const saveAllocation = async (value: ReconciliationAllocationInput) => {
    const result = await perform(async () => {
      if (value.kind === 'SETTLEMENT')
        return (await settle({ variables: { input: value.input } })).data
          ?.settleDeliveryFinanceReceivable;
      return (await match({ variables: { input: value.input } })).data
        ?.matchDeliveryFinanceCash;
    });
    if (!result) return false;
    setEditor(null);
    setNotice({
      text:
        value.kind === 'SETTLEMENT'
          ? t`Invoice payment linked. The remaining invoice balance has been recalculated; no new cash or revenue was created.`
          : t`Payment matched to its monthly allocation. Cash and recognized results are unchanged.`,
    });
    return true;
  };
  const reverseRelation = async (
    input: DeliveryFinanceReverseRelationInput,
  ) => {
    const result = await perform(
      async () =>
        (await reverse({ variables: { input } })).data
          ?.reverseDeliveryFinanceRelation,
    );
    if (result)
      setNotice({
        text: t`Link reversed and history retained. The actual payment and monthly entry are unchanged.`,
      });
    return Boolean(result);
  };
  const reloadEditor = async () => {
    try {
      const result = await query.refetch();
      if (
        !permission.matches(result.data?.deliveryFinancePayments) ||
        result.data?.deliveryFinancePayments.currency !== (currency || null)
      )
        throw new Error();
      setEditorVersion((previous) => previous + 1);
    } catch {
      setError(
        t`Source details could not be refreshed. Your draft is still kept.`,
      );
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
        <Trans>
          Finance access is required to inspect payments and matching.
        </Trans>
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
        <h2>
          <Trans>Payments and matching</Trans>
        </h2>
        <StyledDeliveryButton
          disabled={busy || query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh payments</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        <Trans>
          Record money that already moved, then link it to invoices and posted
          monthly entries. These links do not send payments or recognize income
          or costs again.
        </Trans>
      </p>
      <form
        key={currency}
        aria-label={t`Payment currency filter`}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          requestAction(() => {
            const next = new URLSearchParams(params);
            const value = String(fields.get('currency') ?? '');
            if (value) next.set('financeCurrency', value);
            else next.delete('financeCurrency');
            for (const key of [
              'financeCashAfter',
              'financeReceivablesAfter',
              'financeMatchEntriesAfter',
              'financeSettlementsAfter',
              'financeMatchesAfter',
            ])
              next.delete(key);
            setParams(next);
          });
        }}
      >
        <StyledDeliveryRow>
          <label>
            <Trans>Currency</Trans>
            <select name="currency" defaultValue={currency}>
              <option value="">{t`All currencies — kept separate`}</option>
              {financeLabels.currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <StyledDeliveryButton type="submit" disabled={busy}>
            <Trans>Apply currency</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </form>
      {!currencyValid && (
        <p role="alert">
          <Trans>Choose a supported currency before reviewing payments.</Trans>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status">
          {notice.text}
          {notice.to && (
            <>
              {' '}
              <Link to={notice.to}>
                <Trans>Open recorded payment</Trans>
              </Link>
            </>
          )}
        </p>
      )}
      {editor && !available && (
        <StyledDeliveryButton
          disabled={busy}
          onClick={() => requestAction(() => setEditor(null))}
        >
          <Trans>Discard payment draft</Trans>
        </StyledDeliveryButton>
      )}
      {!editor && !available && isDefined(lastVerified) && (
        <StyledDeliveryButton
          disabled={busy}
          onClick={() =>
            requestAction(() => setHistoryVersion((previous) => previous + 1))
          }
        >
          <Trans>Discard reversal drafts</Trans>
        </StyledDeliveryButton>
      )}
      {query.error && (
        <p role="alert">
          <Trans>
            Payment sources could not be checked. Saved figures are hidden and
            drafts are kept. Refresh to retry.
          </Trans>
        </p>
      )}
      {!data && !query.error && currencyValid && (
        <p role="status">
          <Trans>Loading payment sources…</Trans>
        </p>
      )}
      {editor && permission.ready && !canManage && (
        <p role="status">
          <Trans>
            Your edit access changed. This draft is kept with read-only access
            until an administrator restores editing.
          </Trans>
        </p>
      )}
      <StyledPaymentBoundary
        hidden={!available}
        disabled={!available || busy || query.loading}
      >
        <StyledDeliveryStack>
          {(data?.rejectedCashCount ?? 0) > 0 && (
            <p role="status">
              <Trans>
                Some older cash records need correction before they can be
                matched. Their amounts are not silently treated as zero.
              </Trans>{' '}
              <Link to="/delivery?view=finance">
                <Trans>Review Cash records</Trans>
              </Link>
            </p>
          )}
          {canManage && (
            <StyledDeliveryRow>
              <StyledDeliveryButton
                data-primary={selectedCash ? undefined : 'true'}
                onClick={() => openEditor('PAYMENT')}
              >
                <Trans>Record money already moved</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          )}
          {editor && (
            <StyledDeliveryCard>
              {editor === 'PAYMENT' ? (
                <ReconciliationPaymentForm
                  key={`payment:${editorVersion}`}
                  date={cashLedgerDate()}
                  currency={currency || selectedReceivable?.currency || 'USD'}
                  projects={data?.projects ?? []}
                  invoice={selectedReceivable ?? undefined}
                  busy={busy}
                  readOnly={!canManage || !available || query.loading}
                  onSave={savePayment}
                  onCancel={() => setEditor(null)}
                />
              ) : (
                <ReconciliationAllocationForm
                  key={`${editor}:${selectedCashId}:${editorVersion}`}
                  kind={editor}
                  cashes={isDefined(selectedCash) ? [selectedCash] : []}
                  receivables={receivables}
                  entries={entries}
                  initialCashId={selectedCash?.id}
                  initialReceivableId={selectedReceivable?.id}
                  initialEntryId={selectedEntry?.id}
                  busy={busy}
                  readOnly={!canManage || !available || query.loading}
                  onSave={saveAllocation}
                  onCancel={() => setEditor(null)}
                  onReload={() => void reloadEditor()}
                />
              )}
            </StyledDeliveryCard>
          )}
          <ReconciliationSelection
            selectedCashId={selectedCashId}
            selectedReceivableId={selectedReceivableId}
            selectedEntryId={selectedEntryId}
            selectedCash={selectedCash}
            selectedReceivable={selectedReceivable}
            selectedEntry={selectedEntry}
            currency={currency}
            canManage={canManage}
            destination={destination}
            onAction={openEditor}
          />
          <StyledFinanceNavigation aria-label={t`Payment sources`}>
            <StyledDeliveryRow>
              <Link
                aria-current={list === 'cash' ? 'page' : undefined}
                to={destination({ financeList: 'cash' })}
              >
                <Trans>Payments</Trans>
              </Link>
              <Link
                aria-current={list === 'receivables' ? 'page' : undefined}
                to={destination({ financeList: 'receivables' })}
              >
                <Trans>Receivables</Trans>
              </Link>
              <Link
                aria-current={list === 'monthly' ? 'page' : undefined}
                to={destination({ financeList: 'monthly' })}
              >
                <Trans>Posted monthly sources</Trans>
              </Link>
            </StyledDeliveryRow>
          </StyledFinanceNavigation>
          {data && (
            <ReconciliationSources
              data={data}
              list={list}
              destination={destination}
              hasCursor={params.has(
                list === 'cash'
                  ? 'financeCashAfter'
                  : list === 'receivables'
                    ? 'financeReceivablesAfter'
                    : 'financeMatchEntriesAfter',
              )}
            />
          )}
          {data &&
            (selectedCashId || selectedReceivableId || selectedEntryId) && (
              <ReconciliationHistory
                key={`history:${historyVersion}`}
                data={data}
                destination={destination}
                busy={busy}
                canManage={canManage}
                editing={editor !== null}
                hasSettlementCursor={params.has('financeSettlementsAfter')}
                hasMatchCursor={params.has('financeMatchesAfter')}
                onReverse={reverseRelation}
              />
            )}
        </StyledDeliveryStack>
      </StyledPaymentBoundary>
    </StyledDeliveryStack>
  );
};
