import { isDefined } from 'twenty-shared/utils';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useQuery } from '@apollo/client/react';
import { useSearchParams, Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceEntryHistoryQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_FINANCE_HISTORY } from '@/delivery/finance/delivery-finance.graphql';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceEntryHistoryProps = { entryId: string; currency: string };
export const FinanceEntryHistory = ({
  entryId,
  currency,
}: FinanceEntryHistoryProps) => {
  const { t } = useLingui();
  const labels = useFinanceLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const beforeId = params.get('financeHistoryBefore');
  const query = useQuery<DeliveryFinanceEntryHistoryQuery>(
    GET_DELIVERY_FINANCE_HISTORY,
    {
      variables: { input: { entryId, beforeId }, identity: permission.scope },
      fetchPolicy: 'no-cache',
      skip: !permission.ready || !permission.canReadFinance,
    },
  );
  const data =
    !query.error &&
    permission.matches(query.data?.deliveryFinanceEntryHistory) &&
    query.data?.deliveryFinanceEntryHistory.entryId === entryId
      ? query.data.deliveryFinanceEntryHistory
      : null;
  const destination = (cursor: string | null) => {
    const next = new URLSearchParams(params);
    if (cursor) next.set('financeHistoryBefore', cursor);
    else next.delete('financeHistoryBefore');
    return `/delivery?${next}`;
  };
  const actionLabels: Record<string, string> = {
    FINANCE_ENTRY_PREPARED: t`Cost draft prepared`,
    FINANCE_ENTRY_SAVED: t`Draft saved`,
    FINANCE_ENTRY_POSTED: t`Posted to monthly results`,
    FINANCE_ENTRY_VOIDED: t`Voided`,
    FINANCE_AI_COST_PREPARED: t`AI-cost draft prepared`,
    FINANCE_AI_COST_POSTED: t`AI cost posted to monthly results`,
  };
  return (
    <StyledDeliveryStack>
      <h4>
        <Trans>Entry history</Trans>
      </h4>
      {query.error ? (
        <>
          <p role="alert">
            <Trans>Entry history could not be checked.</Trans>
          </p>
          <StyledDeliveryButton
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Retry history</Trans>
          </StyledDeliveryButton>
        </>
      ) : !data ? (
        <p role="status">
          <Trans>Loading entry history…</Trans>
        </p>
      ) : (
        <>
          {!data.events.length && (
            <p>
              <Trans>No entry events in this view.</Trans>
            </p>
          )}
          {data.events.map((event) => (
            <div key={event.id}>
              <strong>
                {actionLabels[event.action] ?? t`Entry event recorded`}
              </strong>
              <p>
                {event.actorName} · {new Date(event.createdAt).toLocaleString()}{' '}
                · {t`Revision ${event.revision}`}
              </p>
              {(isDefined(event.beforeAmountMicros) ||
                isDefined(event.afterAmountMicros)) && (
                <p>
                  {!isDefined(event.beforeAmountMicros)
                    ? '—'
                    : formatFinanceAmountMicros(
                        event.beforeAmountMicros,
                        currency,
                      )}{' '}
                  →{' '}
                  {!isDefined(event.afterAmountMicros)
                    ? '—'
                    : formatFinanceAmountMicros(
                        event.afterAmountMicros,
                        currency,
                      )}
                </p>
              )}
              {(isDefined(event.beforeStatus) ||
                isDefined(event.afterStatus)) && (
                <p>
                  {t`State`}:{' '}
                  {event.beforeStatus
                    ? (labels.entryStatuses[event.beforeStatus] ??
                      t`Earlier state`)
                    : '—'}{' '}
                  →{' '}
                  {event.afterStatus
                    ? (labels.entryStatuses[event.afterStatus] ??
                      t`Recorded state`)
                    : '—'}
                </p>
              )}
              {event.reason && <p>{event.reason}</p>}
            </div>
          ))}
          {data.nextBeforeId && (
            <Link to={destination(data.nextBeforeId)}>
              <Trans>Older entry events</Trans>
            </Link>
          )}
        </>
      )}
      {beforeId && (
        <Link to={destination(null)}>
          <Trans>Latest entry events</Trans>
        </Link>
      )}
    </StyledDeliveryStack>
  );
};
