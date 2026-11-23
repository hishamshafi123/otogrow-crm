import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import {
  type FinanceForecastSnapshot,
  type FinanceForecastSources,
} from '@/delivery/finance/finance-forecast.types';
import { useFinanceForecastLabels } from '@/delivery/finance/useFinanceForecastLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { StyledFinanceSection } from '@/delivery/finance/financeStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type FinanceForecastDestination = (
  changes: Record<string, string | null>,
) => string;
type FinanceForecastWorklistsProps = {
  data: FinanceForecastSnapshot;
  destination: FinanceForecastDestination;
  canManage: boolean;
  hasItemCursor: boolean;
  hasExceptionCursor: boolean;
};
const paymentSourceDestination = (
  currency: string,
  sourceType: string | null,
  sourceId: string | null,
) => {
  const params = new URLSearchParams({
    view: 'finance',
    financeView: 'payments',
    financeCurrency: currency,
  });
  if (sourceId && sourceType === 'RECEIVABLE')
    params.set('financeReceivable', sourceId);
  if (sourceId && sourceType === 'CASH') params.set('financeCash', sourceId);
  return `/delivery?${params}`;
};
export const FinanceForecastWorklists = ({
  data,
  destination,
  canManage,
  hasItemCursor,
  hasExceptionCursor,
}: FinanceForecastWorklistsProps) => {
  const { t } = useLingui();
  const labels = useFinanceForecastLabels();
  const amount = (value: string | null | undefined) =>
    !isDefined(value)
      ? t`Amount not confirmed`
      : formatFinanceAmountMicros(value, data.currency);
  return (
    <StyledDeliveryStack>
      <StyledFinanceSection aria-label={t`Unresolved cash forecast items`}>
        <h3>{t`Needs attention (${data.exceptionCount})`}</h3>
        <p>
          {t`Known collections outside the dated scenario`}:{' '}
          {amount(data.knownUnscheduledInflowMicros)} ·{' '}
          {t`Known payments outside the dated scenario`}:{' '}
          {amount(data.knownUnscheduledOutflowMicros)}
        </p>
        {data.unknownCollectionCount > 0 && (
          <p>{t`Collections with unconfirmed balances: ${data.unknownCollectionCount}`}</p>
        )}
        {data.unappliedActualOutflowMicros !== '0' && (
          <p>
            {t`Recorded outgoing payments not yet applied`}:{' '}
            {amount(data.unappliedActualOutflowMicros)}
          </p>
        )}
        {!data.exceptions.length && (
          <p>
            <Trans>
              No unresolved items on this page. This scenario still depends on
              complete recorded cash and reviewed expectations.
            </Trans>
          </p>
        )}
        {data.exceptions.map((exception) => (
          <article key={exception.key}>
            {exception.code === 'REPORTING_DATE_NOT_SET' ||
            exception.code === 'ANCHOR_NOT_SET' ? (
              <>
                <strong>
                  <Trans>Starting cash not configured</Trans>
                </strong>
                <p>
                  {canManage
                    ? t`Confirm starting cash and the reporting time zone in the Starting cash section above.`
                    : t`A finance operator must confirm starting cash and the reporting time zone in the Starting cash section above.`}
                </p>
              </>
            ) : (
              <>
                <strong>
                  {exception.title ?? t`Financial record needs review`}
                </strong>
                <p>
                  {labels.warning(exception.code)}{' '}
                  {exception.date && ` · ${exception.date}`} ·{' '}
                  {amount(exception.amountMicros)}
                </p>
                {exception.itemId ? (
                  <Link
                    to={destination({
                      financeForecastItem: exception.itemId,
                      financeForecastHistoryBefore: null,
                    })}
                  >
                    <Trans>Review expectation</Trans>
                  </Link>
                ) : exception.sourceId &&
                  (exception.sourceType === 'CASH' ||
                    exception.sourceType === 'RECEIVABLE') ? (
                  <StyledDeliveryRow>
                    {(exception.sourceType === 'RECEIVABLE' ||
                      exception.code === 'UNAPPLIED_ACTUAL_OUTFLOW') && (
                      <Link
                        to={destination({
                          financeForecastKind: exception.sourceType,
                          financeForecastSource: exception.sourceId,
                          financeForecastSourcesAfter: null,
                        })}
                      >
                        {exception.sourceType === 'CASH'
                          ? t`Review outgoing payment`
                          : t`Review collection source`}
                      </Link>
                    )}
                    <Link
                      to={paymentSourceDestination(
                        data.currency,
                        exception.sourceType,
                        exception.sourceId,
                      )}
                    >
                      <Trans>Open original record</Trans>
                    </Link>
                  </StyledDeliveryRow>
                ) : (
                  <Link
                    to={`/delivery?view=finance&financeCurrency=${data.currency}`}
                  >
                    <Trans>Review cash records</Trans>
                  </Link>
                )}
              </>
            )}
          </article>
        ))}
        <StyledDeliveryRow>
          {data.nextExceptionKey && (
            <Link
              to={destination({
                financeForecastExceptionsAfter: data.nextExceptionKey,
              })}
            >
              <Trans>More unresolved items</Trans>
            </Link>
          )}
          {hasExceptionCursor && (
            <Link to={destination({ financeForecastExceptionsAfter: null })}>
              <Trans>First unresolved items</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </StyledFinanceSection>
      <StyledFinanceSection aria-label={t`Expected cash follow-up`}>
        <h3>{t`Expected collections and payments (${data.itemCount})`}</h3>
        {!data.items.length && (
          <p>
            <Trans>
              No expectations on this page. Schedule an outstanding invoice or
              review an expected payment.
            </Trans>
          </p>
        )}
        {data.items.map((item) => (
          <article key={item.id}>
            <strong>
              <Link
                to={destination({
                  financeForecastItem: item.id,
                  financeForecastRealizationsAfter: null,
                  financeForecastHistoryBefore: null,
                })}
              >
                {item.title}
              </Link>
            </strong>
            <p>
              {item.kind === 'COLLECTION' ? t`Collection` : t`Payment`} ·{' '}
              {labels.status(item.status)} · {t`Remaining`}:{' '}
              {amount(item.remainingMicros)} · {t`Expected date`}:{' '}
              {item.expectedDate ?? t`Not scheduled`}
            </p>
            <p>
              {t`Owner`}: {item.ownerName || t`Needs reassignment`}
              {!item.ownerEligible && ` · ${t`Needs reassignment`}`} ·{' '}
              {t`Next action`}: {item.nextActionDate}
            </p>
            {item.status === 'ACTIVE' && !item.eligible && (
              <small>
                <Trans>Excluded from the dated scenario until reviewed.</Trans>
              </small>
            )}
            {item.warnings.length > 0 && (
              <details>
                <summary>
                  <Trans>Review warnings</Trans>
                </summary>
                <ul>
                  {item.warnings.map((warning) => (
                    <li key={warning}>{labels.warning(warning)}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
        <StyledDeliveryRow>
          {data.nextItemId && (
            <Link
              to={destination({ financeForecastItemsAfter: data.nextItemId })}
            >
              <Trans>More expectations</Trans>
            </Link>
          )}
          {hasItemCursor && (
            <Link to={destination({ financeForecastItemsAfter: null })}>
              <Trans>First expectations</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </StyledFinanceSection>
    </StyledDeliveryStack>
  );
};

type FinanceForecastSourcesListProps = {
  data: FinanceForecastSources;
  destination: FinanceForecastDestination;
  hasCursor: boolean;
};
export const FinanceForecastSourcesList = ({
  data,
  destination,
  hasCursor,
}: FinanceForecastSourcesListProps) => {
  const { t } = useLingui();
  const labels = useFinanceForecastLabels();
  const amount = (value: string | null | undefined) =>
    !isDefined(value)
      ? t`Not confirmed`
      : formatFinanceAmountMicros(value, data.currency);
  return (
    <section aria-label={t`Forecast source options`}>
      <StyledDeliveryStack>
        {!data.sources.length && (
          <p>
            <Trans>No matching sources on this page.</Trans>
          </p>
        )}
        {data.sources.map((source) => (
          <article key={source.id}>
            <strong>
              <Link to={destination({ financeForecastSource: source.id })}>
                {source.title}
              </Link>
            </strong>
            <p>
              {source.sourceType === 'RECEIVABLE'
                ? t`Original invoice`
                : source.sourceType === 'CASH'
                  ? t`Recorded outgoing payment`
                  : t`Plan amount`}
              : {amount(source.amountMicros)} ·{' '}
              {source.sourceType === 'CASH'
                ? t`Unapplied`
                : source.sourceType === 'RECEIVABLE'
                  ? t`Outstanding`
                  : t`Suggested payment date`}
              :{' '}
              {source.sourceType === 'PLAN'
                ? (source.suggestedDate ?? t`Not scheduled`)
                : amount(source.remainingMicros)}
            </p>
            {source.occurrenceItemId && (
              <Link
                to={destination({
                  financeForecastItem: source.occurrenceItemId,
                  financeForecastRealizationsAfter: null,
                })}
              >
                <Trans>Open existing expectation</Trans>
              </Link>
            )}
            {!source.eligible && (
              <p>{labels.warning(source.warnings[0] ?? '')}</p>
            )}
          </article>
        ))}
        <StyledDeliveryRow>
          {data.nextId && (
            <Link
              to={destination({
                financeForecastSourcesAfter: data.nextId,
                financeForecastSource: null,
              })}
            >
              <Trans>More source options</Trans>
            </Link>
          )}
          {hasCursor && (
            <Link
              to={destination({
                financeForecastSourcesAfter: null,
                financeForecastSource: null,
              })}
            >
              <Trans>First source options</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};

export { paymentSourceDestination as financeForecastPaymentSourceDestination };
