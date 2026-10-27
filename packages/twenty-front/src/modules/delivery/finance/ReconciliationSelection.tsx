import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinancePaymentsQuery } from '~/generated-metadata/graphql';
import { type FinanceDestination } from '@/delivery/finance/ReconciliationSources';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PaymentsSnapshot = DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
type ReconciliationSelectionProps = {
  selectedCashId: string | null;
  selectedReceivableId: string | null;
  selectedEntryId: string | null;
  selectedCash: PaymentsSnapshot['selectedCash'] | undefined;
  selectedReceivable: PaymentsSnapshot['selectedReceivable'] | undefined;
  selectedEntry: PaymentsSnapshot['selectedEntry'] | undefined;
  currency: string;
  canManage: boolean;
  destination: FinanceDestination;
  onAction: (kind: 'PAYMENT' | 'SETTLEMENT' | 'MATCH') => void;
};
export const ReconciliationSelection = ({
  selectedCashId,
  selectedReceivableId,
  selectedEntryId,
  selectedCash,
  selectedReceivable,
  selectedEntry,
  currency,
  canManage,
  destination,
  onAction,
}: ReconciliationSelectionProps) => {
  const { t } = useLingui();
  const labels = useReconciliationLabels();
  const financeLabels = useFinanceLabels();
  return (
    <StyledDeliveryStack>
      {selectedCashId && !selectedCash && (
        <p>
          <Trans>This payment is unavailable or outside your access.</Trans>{' '}
          <Link
            to={destination({
              financeCash: null,
              financeSettlementsAfter: null,
              financeMatchesAfter: null,
            })}
          >
            <Trans>Clear payment selection</Trans>
          </Link>
        </p>
      )}
      {selectedCash && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>{selectedCash.title}</h3>
            <p>
              {labels.category(selectedCash.category)} · {selectedCash.date} ·{' '}
              {selectedCash.projectName ?? t`Company / unassigned`} ·{' '}
              {selectedCash.status === 'VOID' ? t`Voided` : t`Recorded`}
            </p>
            <h3>
              {formatFinanceAmountMicros(
                selectedCash.amountMicros,
                selectedCash.currency,
              )}
            </h3>
            {currency && currency !== selectedCash.currency && (
              <p>
                <Trans>This selected source uses another currency.</Trans>{' '}
                <Link
                  to={destination({
                    financeCurrency: selectedCash.currency,
                    financeCashAfter: null,
                    financeReceivablesAfter: null,
                    financeMatchEntriesAfter: null,
                  })}
                >
                  <Trans>Use this source’s currency</Trans>
                </Link>
              </p>
            )}
            {selectedCash.note && <p>{selectedCash.note}</p>}
            {selectedCash.evidenceUrl && (
              <a
                href={selectedCash.evidenceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Trans>Open payment evidence</Trans>
              </a>
            )}
            {selectedCash.sourceWarnings.map((warning) => (
              <p key={warning} role="status">
                {labels.warning(warning)}
              </p>
            ))}
            {selectedCash.status === 'VOID' ? (
              <p>
                <Trans>
                  This payment was voided. No amount is available to apply to
                  invoices or match to monthly entries.
                </Trans>
              </p>
            ) : (
              <>
                <p>
                  <Trans>
                    Invoice application and monthly matching track different
                    questions. Their balances are separate and must not be added
                    together.
                  </Trans>
                </p>
                {selectedCash.category === 'INCOME' && (
                  <p>
                    {t`Applied to invoices`}:{' '}
                    {formatFinanceAmountMicros(
                      selectedCash.settledMicros,
                      selectedCash.currency,
                    )}{' '}
                    · {t`Unapplied to invoices`}:{' '}
                    {formatFinanceAmountMicros(
                      selectedCash.remainingSettlementMicros,
                      selectedCash.currency,
                    )}
                  </p>
                )}
                <p>
                  {t`Matched to monthly entries`}:{' '}
                  {formatFinanceAmountMicros(
                    selectedCash.matchedMicros,
                    selectedCash.currency,
                  )}{' '}
                  · {t`Unmatched to monthly entries`}:{' '}
                  {formatFinanceAmountMicros(
                    selectedCash.remainingMatchMicros,
                    selectedCash.currency,
                  )}
                </p>
              </>
            )}
            {selectedCash.status !== 'VOID' &&
              ['EXPENSE', 'SALARY'].includes(selectedCash.category) && (
                <Link
                  to={`/delivery?view=finance&financeView=forecast&financeCurrency=${encodeURIComponent(selectedCash.currency)}&financeForecastKind=CASH&financeForecastSource=${encodeURIComponent(selectedCash.id)}`}
                >
                  <Trans>Review this payment in cash forecast</Trans>
                </Link>
              )}
            {canManage && selectedCash.status !== 'VOID' && (
              <StyledDeliveryRow>
                {selectedCash.category === 'INCOME' &&
                  selectedCash.remainingSettlementMicros !== '0' && (
                    <StyledDeliveryButton
                      data-primary="true"
                      onClick={() => onAction('SETTLEMENT')}
                    >
                      <Trans>Apply payment to invoice</Trans>
                    </StyledDeliveryButton>
                  )}
                {['INCOME', 'EXPENSE', 'SALARY'].includes(
                  selectedCash.category,
                ) &&
                  selectedCash.remainingMatchMicros !== '0' && (
                    <StyledDeliveryButton
                      data-primary={
                        selectedCash.category !== 'INCOME' ||
                        selectedCash.remainingSettlementMicros === '0'
                          ? 'true'
                          : undefined
                      }
                      onClick={() => onAction('MATCH')}
                    >
                      <Trans>Match to monthly entry</Trans>
                    </StyledDeliveryButton>
                  )}
              </StyledDeliveryRow>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      {selectedReceivableId && !selectedReceivable && (
        <p>
          <Trans>This receivable is unavailable or outside your access.</Trans>{' '}
          <Link
            to={destination({
              financeReceivable: null,
              financeSettlementsAfter: null,
            })}
          >
            <Trans>Clear receivable selection</Trans>
          </Link>
        </p>
      )}
      {selectedReceivable && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>{selectedReceivable.title}</h3>
            <p>
              {selectedReceivable.projectName ?? t`Company / unassigned`} ·{' '}
              {selectedReceivable.date}
              {selectedReceivable.dueDate
                ? ` · ${t`Due`}: ${selectedReceivable.dueDate}`
                : ''}
            </p>
            <p>
              {t`Invoice amount`}:{' '}
              {formatFinanceAmountMicros(
                selectedReceivable.amountMicros,
                selectedReceivable.currency,
              )}{' '}
              · {t`Payments applied`}:{' '}
              {formatFinanceAmountMicros(
                selectedReceivable.settledMicros,
                selectedReceivable.currency,
              )}{' '}
              · {t`Outstanding`}:{' '}
              {formatFinanceAmountMicros(
                selectedReceivable.outstandingMicros,
                selectedReceivable.currency,
              )}
            </p>
            {selectedReceivable.sourceWarnings.map((warning) => (
              <p key={warning} role="status">
                {labels.warning(warning)}
              </p>
            ))}
            {selectedReceivable.status !== 'VOID' &&
              selectedReceivable.outstandingMicros !== '0' && (
                <Link
                  to={`/delivery?view=finance&financeView=forecast&financeCurrency=${encodeURIComponent(selectedReceivable.currency)}&financeForecastKind=RECEIVABLE&financeForecastSource=${encodeURIComponent(selectedReceivable.id)}`}
                >
                  <Trans>Schedule this invoice’s collection</Trans>
                </Link>
              )}
            {canManage &&
              selectedReceivable.status !== 'VOID' &&
              selectedReceivable.outstandingMicros !== '0' && (
                <StyledDeliveryRow>
                  <StyledDeliveryButton onClick={() => onAction('PAYMENT')}>
                    <Trans>Record a payment for this invoice</Trans>
                  </StyledDeliveryButton>
                  <Link to={destination({ financeList: 'cash' })}>
                    <Trans>Choose an existing payment</Trans>
                  </Link>
                </StyledDeliveryRow>
              )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      {selectedEntryId && !selectedEntry && (
        <p>
          <Trans>
            This monthly source is unavailable or outside your access.
          </Trans>{' '}
          <Link
            to={destination({
              financeMatchEntry: null,
              financeMatchesAfter: null,
            })}
          >
            <Trans>Clear monthly selection</Trans>
          </Link>
        </p>
      )}
      {selectedEntry && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>{selectedEntry.title}</h3>
            <p>
              {selectedEntry.month} ·{' '}
              {financeLabels.entryKinds[selectedEntry.kind] ?? t`Monthly entry`}{' '}
              ·{' '}
              {financeLabels.entryStatuses[selectedEntry.status] ?? t`Recorded`}
            </p>
            {selectedEntry.allocations.map((allocation) => (
              <p key={allocation.projectId ?? 'company'}>
                {allocation.projectName ?? t`Company / unassigned`} ·{' '}
                {t`Recognized`}:{' '}
                {formatFinanceAmountMicros(
                  allocation.amountMicros,
                  selectedEntry.currency,
                )}{' '}
                · {t`Matched`}:{' '}
                {formatFinanceAmountMicros(
                  allocation.matchedMicros,
                  selectedEntry.currency,
                )}{' '}
                · {t`Still to match`}:{' '}
                {formatFinanceAmountMicros(
                  allocation.remainingMatchMicros,
                  selectedEntry.currency,
                )}
              </p>
            ))}
            <Link
              to={`/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(selectedEntry.id)}&financeMonth=${selectedEntry.month}&financeCurrency=${encodeURIComponent(selectedEntry.currency)}`}
            >
              <Trans>Open recognized entry</Trans>
            </Link>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
    </StyledDeliveryStack>
  );
};
