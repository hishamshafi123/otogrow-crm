import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryFinanceForecastHistoryQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_FINANCE_FORECAST_HISTORY } from '@/delivery/finance/delivery-finance-forecast.graphql';
import { useFinanceForecastLabels } from '@/delivery/finance/useFinanceForecastLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceForecastHistoryProps = {
  sourceType: 'ANCHOR' | 'ITEM' | 'REALIZATION';
  sourceId: string;
  enabled: boolean;
};
export const FinanceForecastHistory = ({
  sourceType,
  sourceId,
  enabled,
}: FinanceForecastHistoryProps) => {
  const { t } = useLingui();
  const labels = useFinanceForecastLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const query = useQuery<DeliveryFinanceForecastHistoryQuery>(
    GET_DELIVERY_FINANCE_FORECAST_HISTORY,
    {
      variables: {
        input: {
          sourceType,
          sourceId,
          beforeId: params.get('financeForecastHistoryBefore'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      skip: !enabled || !permission.ready || !permission.canReadFinance,
    },
  );
  const data = query.data?.deliveryFinanceForecastHistory;
  const available =
    enabled &&
    permission.ready &&
    permission.canReadFinance &&
    !query.loading &&
    !query.error &&
    permission.matches(data) &&
    data?.events.every(
      (event) => event.sourceType === sourceType && event.sourceId === sourceId,
    );
  const destination = (beforeId: string | null) => {
    const next = new URLSearchParams(params);
    if (beforeId) next.set('financeForecastHistoryBefore', beforeId);
    else next.delete('financeForecastHistoryBefore');
    return `/delivery?${next}`;
  };
  if (!available || !data)
    return (
      <p role={query.error ? 'alert' : 'status'}>
        {query.error
          ? t`Forecast history could not be checked. Saved details are hidden.`
          : t`Checking forecast history…`}{' '}
        <StyledDeliveryButton
          type="button"
          disabled={query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh forecast history</Trans>
        </StyledDeliveryButton>
      </p>
    );
  return (
    <section aria-label={t`Cash forecast history`}>
      <StyledDeliveryStack>
        {!data.events.length && (
          <p>
            <Trans>No recorded changes for this forecast source.</Trans>
          </p>
        )}
        {data.events.map((event) => (
          <article key={event.id} aria-label={labels.action(event.action)}>
            <strong>
              {labels.action(event.action)} · {t`Version`} {event.revision}
            </strong>
            <p>
              {event.actorName || t`Former finance operator`} ·{' '}
              {new Date(event.createdAt).toLocaleString()}
            </p>
            {event.title && <p>{event.title}</p>}
            {event.currency && isDefined(event.amountMicros) && (
              <p>
                {t`Recorded amount`}:{' '}
                {formatFinanceAmountMicros(event.amountMicros, event.currency)}
              </p>
            )}
            {event.date && (
              <p>
                {t`Recorded date`}: {event.date}
              </p>
            )}
            {event.originSourceType && (
              <p>
                {t`Reviewed source`}:{' '}
                {event.originSourceType === 'PLAN'
                  ? t`Monthly cost plan`
                  : event.originSourceType === 'RECEIVABLE'
                    ? t`Invoice`
                    : event.originSourceType === 'MANUAL'
                      ? t`One-off expected payment`
                      : event.originSourceType === 'CASH'
                        ? t`Recorded outgoing payment`
                        : t`Financial source`}
                {event.planMonth ? ` · ${event.planMonth}` : ''}
                {isDefined(event.sourceRevision)
                  ? ` · ${t`Source version`} ${event.sourceRevision}`
                  : ''}
              </p>
            )}
            {isDefined(event.sourceAmountMicros) && event.currency && (
              <p>
                {t`Source amount at review`}:{' '}
                {formatFinanceAmountMicros(
                  event.sourceAmountMicros,
                  event.currency,
                )}
              </p>
            )}
            {event.originSourceId && event.originSourceType === 'PLAN' && (
              <Link
                to={`/delivery?view=finance&financeView=plans&financePlan=${encodeURIComponent(event.originSourceId)}${event.currency ? `&financeCurrency=${encodeURIComponent(event.currency)}` : ''}${event.planMonth ? `&financeMonth=${event.planMonth}` : ''}`}
              >
                <Trans>Open original cost plan</Trans>
              </Link>
            )}
            {event.originSourceId &&
              event.originSourceType === 'RECEIVABLE' && (
                <Link
                  to={`/delivery?view=finance&financeView=payments&financeReceivable=${encodeURIComponent(event.originSourceId)}${event.currency ? `&financeCurrency=${encodeURIComponent(event.currency)}` : ''}`}
                >
                  <Trans>Open original invoice</Trans>
                </Link>
              )}
            {event.cashId && (
              <p>
                {t`Recorded payment date`}:{' '}
                {event.cashDate ?? t`Not recorded in this event`}{' '}
                <Link
                  to={`/delivery?view=finance&financeView=payments&financeCash=${encodeURIComponent(event.cashId)}${event.currency ? `&financeCurrency=${encodeURIComponent(event.currency)}` : ''}`}
                >
                  <Trans>Open recorded payment</Trans>
                </Link>
              </p>
            )}
            {event.itemId && (
              <Link
                to={`/delivery?view=finance&financeView=forecast&financeForecastItem=${encodeURIComponent(event.itemId)}${event.currency ? `&financeCurrency=${encodeURIComponent(event.currency)}` : ''}`}
              >
                <Trans>Open expected payment</Trans>
              </Link>
            )}
            {event.reversedAt && (
              <p>
                {t`Application reversed at`}:{' '}
                {new Date(event.reversedAt).toLocaleString()}
              </p>
            )}
            {event.timezone && (
              <p>
                {t`Reporting time zone`}: {event.timezone}
              </p>
            )}
            {event.evidenceUrl && /^https?:\/\//i.test(event.evidenceUrl) && (
              <a href={event.evidenceUrl} target="_blank" rel="noreferrer">
                <Trans>Recorded balance evidence</Trans>
              </a>
            )}
            {event.ownerName && (
              <p>
                {t`Owner`}: {event.ownerName}
              </p>
            )}
            {event.beforeStatus && event.afterStatus && (
              <p>
                {labels.status(event.beforeStatus)} →{' '}
                {labels.status(event.afterStatus)}
              </p>
            )}
            <p>
              {t`Reason`}: {event.reason}
            </p>
            {event.note && event.note !== event.reason && <p>{event.note}</p>}
          </article>
        ))}
        {data.nextBeforeId && (
          <Link to={destination(data.nextBeforeId)}>
            <Trans>Earlier forecast changes</Trans>
          </Link>
        )}
        {params.has('financeForecastHistoryBefore') && (
          <Link to={destination(null)}>
            <Trans>Latest forecast changes</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
