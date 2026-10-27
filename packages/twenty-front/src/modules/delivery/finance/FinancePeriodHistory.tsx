import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinancePeriodHistoryQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_FINANCE_PERIOD_HISTORY } from '@/delivery/finance/delivery-finance-period.graphql';
import { FinancePeriodSummary } from '@/delivery/finance/FinancePeriodSummary';
import { useFinancePeriodLabels } from '@/delivery/finance/useFinancePeriodLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinancePeriodHistoryProps = { month: string; enabled: boolean };

export const FinancePeriodHistory = ({
  month,
  enabled,
}: FinancePeriodHistoryProps) => {
  const { t } = useLingui();
  const labels = useFinancePeriodLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const beforeId = params.get('financePeriodHistoryBefore');
  const query = useQuery<DeliveryFinancePeriodHistoryQuery>(
    GET_DELIVERY_FINANCE_PERIOD_HISTORY,
    {
      variables: { input: { month, beforeId }, identity: permission.scope },
      fetchPolicy: 'no-cache',
      skip: !enabled || !permission.ready || !permission.canReadFinance,
    },
  );
  const candidate = query.data?.deliveryFinancePeriodHistory;
  const data =
    enabled &&
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.month === month
      ? candidate
      : null;
  const destination = (cursor: string | null) => {
    const next = new URLSearchParams(params);
    if (cursor) next.set('financePeriodHistoryBefore', cursor);
    else next.delete('financePeriodHistoryBefore');
    return `/delivery?${next}`;
  };
  return (
    <StyledDeliveryStack>
      {query.error ? (
        <>
          <p role="alert">
            <Trans>The month’s status history could not be checked.</Trans>
          </p>
          <StyledDeliveryButton
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Retry month history</Trans>
          </StyledDeliveryButton>
        </>
      ) : !data ? (
        <p role="status">
          <Trans>Loading month history…</Trans>
        </p>
      ) : (
        <>
          {!data.events.length && (
            <p>
              <Trans>No lock or reopen events for this month.</Trans>
            </p>
          )}
          {data.events.map((event) => (
            <section
              key={event.id}
              aria-label={
                event.action === 'FINANCE_PERIOD_LOCKED'
                  ? t`Month locked`
                  : event.action === 'FINANCE_PERIOD_REOPENED'
                    ? t`Month reopened`
                    : t`Month status recorded`
              }
            >
              <strong>
                {labels.status(event.beforeStatus)} →{' '}
                {labels.status(event.afterStatus)}
              </strong>
              <p>
                {event.actorName} · {new Date(event.createdAt).toLocaleString()}{' '}
                · {t`Version ${event.revision}`}
              </p>
              <p>{event.reason}</p>
              <FinancePeriodSummary summaries={event.summaries} showProjects />
            </section>
          ))}
          {data.nextBeforeId && (
            <Link to={destination(data.nextBeforeId)}>
              <Trans>Older month events</Trans>
            </Link>
          )}
        </>
      )}
      {beforeId && (
        <Link to={destination(null)}>
          <Trans>Latest month events</Trans>
        </Link>
      )}
    </StyledDeliveryStack>
  );
};
