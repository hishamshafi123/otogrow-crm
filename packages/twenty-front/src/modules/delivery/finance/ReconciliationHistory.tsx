import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryFinancePaymentsQuery,
  type DeliveryFinanceReverseRelationInput,
} from '~/generated-metadata/graphql';
import { type FinanceDestination } from '@/delivery/finance/ReconciliationSources';
import { ReconciliationReverseForm } from '@/delivery/finance/ReconciliationReverseForm';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ReconciliationHistoryProps = {
  data: DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
  destination: FinanceDestination;
  busy: boolean;
  canManage: boolean;
  editing: boolean;
  hasSettlementCursor: boolean;
  hasMatchCursor: boolean;
  onReverse: (input: DeliveryFinanceReverseRelationInput) => Promise<boolean>;
};
export const ReconciliationHistory = ({
  data,
  destination,
  busy,
  canManage,
  editing,
  hasSettlementCursor,
  hasMatchCursor,
  onReverse,
}: ReconciliationHistoryProps) => {
  const { t } = useLingui();
  return (
    <StyledDeliveryStack>
      {(['SETTLEMENT', 'MATCH'] as const).map((kind) => {
        const rows = kind === 'SETTLEMENT' ? data.settlements : data.matches;
        const next =
          kind === 'SETTLEMENT' ? data.nextSettlementId : data.nextMatchId;
        const cursorKey =
          kind === 'SETTLEMENT'
            ? 'financeSettlementsAfter'
            : 'financeMatchesAfter';
        const hasCursor =
          kind === 'SETTLEMENT' ? hasSettlementCursor : hasMatchCursor;
        return (
          <section
            key={kind}
            aria-label={
              kind === 'SETTLEMENT'
                ? t`Invoice payment history`
                : t`Monthly matching history`
            }
          >
            <h3>
              {kind === 'SETTLEMENT'
                ? t`Invoice payment links (${data.settlementTotal})`
                : t`Monthly matches (${data.matchTotal})`}
            </h3>
            {!rows.length && (
              <p>
                {kind === 'SETTLEMENT'
                  ? t`No invoice payment links for the selected sources.`
                  : t`No monthly payment matches for the selected sources.`}
              </p>
            )}
            <StyledDeliveryStack>
              {rows.map((relation) => (
                <StyledDeliveryCard key={relation.id}>
                  <StyledDeliveryStack>
                    <strong>
                      {relation.cashTitle} → {relation.targetTitle}
                    </strong>
                    <p>
                      {formatFinanceAmountMicros(
                        relation.amountMicros,
                        relation.currency,
                      )}{' '}
                      · {relation.status === 'ACTIVE' ? t`Active` : t`Reversed`}
                      {relation.month ? ` · ${relation.month}` : ''} ·{' '}
                      {relation.projectName ?? t`Company / unassigned`}
                    </p>
                    <p>
                      {relation.createdByName} ·{' '}
                      {new Date(relation.createdAt).toLocaleString()}
                    </p>
                    {relation.reversedAt && (
                      <p>
                        {t`Reversed by`}:{' '}
                        {relation.reversedByName ?? t`Former team member`} ·{' '}
                        {new Date(relation.reversedAt).toLocaleString()}
                      </p>
                    )}
                    {relation.reversalReason && (
                      <p>{relation.reversalReason}</p>
                    )}
                    <StyledDeliveryRow>
                      <Link
                        to={destination({
                          financeCash: relation.cashId,
                          financeSettlementsAfter: null,
                          financeMatchesAfter: null,
                        })}
                      >
                        <Trans>Open payment</Trans>
                      </Link>
                      {relation.receivableId && (
                        <Link
                          to={destination({
                            financeReceivable: relation.receivableId,
                            financeSettlementsAfter: null,
                          })}
                        >
                          <Trans>Open receivable</Trans>
                        </Link>
                      )}
                      {relation.entryId && (
                        <Link
                          to={`/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(relation.entryId)}${relation.month ? `&financeMonth=${relation.month}` : ''}&financeCurrency=${encodeURIComponent(relation.currency)}`}
                        >
                          <Trans>Open recognized entry</Trans>
                        </Link>
                      )}
                    </StyledDeliveryRow>
                    {relation.legacy && (
                      <p>
                        <Trans>
                          This preserved link came from the earlier full-payment
                          workflow. Correct it through the original receipt in
                          Cash records.
                        </Trans>
                      </p>
                    )}
                    <ReconciliationReverseForm
                      relation={relation}
                      canManage={canManage}
                      busy={busy}
                      editing={editing}
                      onReverse={onReverse}
                    />
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
              ))}
            </StyledDeliveryStack>
            <StyledDeliveryRow>
              {next && (
                <Link to={destination({ [cursorKey]: next })}>
                  <Trans>More links</Trans>
                </Link>
              )}
              {hasCursor && (
                <Link to={destination({ [cursorKey]: null })}>
                  <Trans>Latest links</Trans>
                </Link>
              )}
            </StyledDeliveryRow>
          </section>
        );
      })}
    </StyledDeliveryStack>
  );
};
