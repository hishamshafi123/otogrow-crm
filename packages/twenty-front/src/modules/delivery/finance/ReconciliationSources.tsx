import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinancePaymentsQuery } from '~/generated-metadata/graphql';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PaymentsSnapshot = DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
export type ReconciliationList = 'cash' | 'receivables' | 'monthly';
export type FinanceDestination = (
  changes: Record<string, string | null>,
) => string;
type ReconciliationSourcesProps = {
  data: PaymentsSnapshot;
  list: ReconciliationList;
  destination: FinanceDestination;
  hasCursor: boolean;
};
export const ReconciliationSources = ({
  data,
  list,
  destination,
  hasCursor,
}: ReconciliationSourcesProps) => {
  const { t } = useLingui();
  const labels = useReconciliationLabels();
  const financeLabels = useFinanceLabels();
  const rows = list === 'cash' ? data.cash : data.receivables;
  const cursorKey =
    list === 'cash'
      ? 'financeCashAfter'
      : list === 'receivables'
        ? 'financeReceivablesAfter'
        : 'financeMatchEntriesAfter';
  const next =
    list === 'cash'
      ? data.nextCashId
      : list === 'receivables'
        ? data.nextReceivableId
        : data.nextEntryId;
  const total =
    list === 'cash'
      ? data.cashTotal
      : list === 'receivables'
        ? data.receivableTotal
        : data.entryTotal;
  return (
    <StyledDeliveryStack>
      <h3>
        {list === 'cash'
          ? t`Recorded payments (${total})`
          : list === 'receivables'
            ? t`Receivables (${total})`
            : t`Monthly sources (${total})`}
      </h3>
      {list === 'monthly' ? (
        <>
          <p>
            <Trans>
              Only posted allocations can receive a new payment match. Draft and
              voided entries remain available through Monthly results.
            </Trans>
          </p>
          {!data.entries.length && (
            <p>
              <Trans>No monthly sources in this view.</Trans>
            </p>
          )}
          {data.entries.map((entry) => (
            <StyledDeliveryCard key={entry.id}>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <div>
                    <strong>{entry.title}</strong>
                    <p>
                      {entry.month} · {entry.currency} ·{' '}
                      {financeLabels.entryKinds[entry.kind] ?? t`Monthly entry`}{' '}
                      ·{' '}
                      {financeLabels.entryStatuses[entry.status] ?? t`Recorded`}
                    </p>
                  </div>
                  <Link
                    to={destination({
                      financeMatchEntry: entry.id,
                      financeMatchesAfter: null,
                    })}
                  >
                    <Trans>Review monthly source</Trans>
                  </Link>
                </StyledDeliveryRow>
                {entry.allocations.map((allocation) => (
                  <p key={allocation.projectId ?? 'company'}>
                    {allocation.projectName ?? t`Company / unassigned`} ·{' '}
                    {t`Still to match`}:{' '}
                    {formatFinanceAmountMicros(
                      allocation.remainingMatchMicros,
                      entry.currency,
                    )}
                  </p>
                ))}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
        </>
      ) : (
        <>
          {!rows.length && (
            <p>
              {list === 'cash'
                ? t`No recorded payments in this view. Record money that already moved, or add the source in Cash records.`
                : t`No receivables in this view. Create an invoice or receivable record in Cash records first.`}
            </p>
          )}
          {rows.map((source) => (
            <StyledDeliveryCard key={source.id}>
              <StyledDeliveryRow>
                <div>
                  <strong>{source.title}</strong>
                  <p>
                    {source.date} ·{' '}
                    {list === 'cash'
                      ? labels.category(source.category)
                      : t`Receivable`}{' '}
                    · {source.projectName ?? t`Company / unassigned`}
                  </p>
                  <p>
                    {formatFinanceAmountMicros(
                      source.amountMicros,
                      source.currency,
                    )}{' '}
                    ·{' '}
                    {source.status === 'VOID'
                      ? t`Voided`
                      : list === 'receivables'
                        ? source.outstandingMicros === '0'
                          ? t`Fully paid`
                          : source.settledMicros === '0'
                            ? t`Unpaid`
                            : t`Partially paid`
                        : t`Recorded`}
                  </p>
                  <p>
                    {source.status === 'VOID' ? (
                      <Trans>No amount is available for new links.</Trans>
                    ) : (
                      <>
                        {list === 'receivables'
                          ? t`Outstanding`
                          : t`Not yet matched to monthly entries`}
                        :{' '}
                        {formatFinanceAmountMicros(
                          list === 'receivables'
                            ? source.outstandingMicros
                            : source.remainingMatchMicros,
                          source.currency,
                        )}
                      </>
                    )}
                  </p>
                  {source.dueDate && (
                    <p>
                      {t`Due`}: {source.dueDate}
                    </p>
                  )}
                </div>
                <Link
                  to={destination(
                    list === 'cash'
                      ? {
                          financeCash: source.id,
                          financeSettlementsAfter: null,
                          financeMatchesAfter: null,
                        }
                      : {
                          financeReceivable: source.id,
                          financeSettlementsAfter: null,
                        },
                  )}
                >
                  {list === 'cash' ? t`Review payment` : t`Review receivable`}
                </Link>
              </StyledDeliveryRow>
            </StyledDeliveryCard>
          ))}
        </>
      )}
      <StyledDeliveryRow>
        {next && (
          <Link to={destination({ [cursorKey]: next })}>
            <Trans>More sources</Trans>
          </Link>
        )}
        {hasCursor && (
          <Link to={destination({ [cursorKey]: null })}>
            <Trans>First sources</Trans>
          </Link>
        )}
      </StyledDeliveryRow>
    </StyledDeliveryStack>
  );
};
