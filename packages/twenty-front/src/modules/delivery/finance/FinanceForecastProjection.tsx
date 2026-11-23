import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { isDefined } from 'twenty-shared/utils';
import { type FinanceForecastProjection } from '@/delivery/finance/finance-forecast.types';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type FinanceForecastProjectionSummaryProps = {
  projection: FinanceForecastProjection;
  currency: string;
  incomplete: boolean;
};
type FinanceForecastTimelineProps = FinanceForecastProjectionSummaryProps;
const StyledForecastTotals = styled.dl`
  display: grid;
  gap: 20px 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
  }
  dd {
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin: 6px 0 0;
    overflow-wrap: anywhere;
  }
  > div:last-child {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    grid-column: 1 / -1;
    dd {
      font-size: 14px;
      margin: 0;
    }
  }
  > div[data-shortfall='true'] {
    background: ${themeCssVariables.color.orange3};
    border: 1px solid ${themeCssVariables.color.orange6};
    border-radius: 10px;
    padding: 12px 16px;
    dt {
      color: ${themeCssVariables.color.orange11};
      font-size: 14px;
      font-weight: 600;
    }
    dd {
      font-size: 22px;
    }
  }
  @container (max-width: 460px) {
    grid-template-columns: minmax(0, 1fr);
  }
  @container (min-width: 800px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;
const StyledForecastDays = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;
const StyledForecastDay = styled.li`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 8px 16px;
  grid-template-columns: minmax(100px, 1fr) repeat(3, minmax(0, 1fr));
  overflow-wrap: anywhere;
  padding: 12px 0;
  @media (max-width: 600px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    time,
    strong {
      grid-column: 1 / -1;
    }
  }
`;

export const FinanceForecastProjectionSummary = ({
  projection,
  currency,
  incomplete,
}: FinanceForecastProjectionSummaryProps) => {
  const { t } = useLingui();
  const hasCashShortfall = isDefined(projection.firstNegativeDate);
  const amount = (value: string | null | undefined) =>
    !isDefined(value)
      ? t`Not confirmed`
      : formatFinanceAmountMicros(value, currency);
  return (
    <section aria-label={t`Reviewed cash scenario`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Reviewed cash scenario</Trans>
        </h3>
        {incomplete && (
          <p role="status">
            <strong>
              <Trans>Incomplete information</Trans>
            </strong>{' '}
            <Trans>
              These balances include only the reviewed dated items. Resolve the
              exceptions before relying on this scenario.
            </Trans>
          </p>
        )}
        <StyledForecastTotals>
          <div>
            <dt>
              <Trans>Recorded cash today</Trans>
            </dt>
            <dd>{amount(projection.currentCashMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Expected collections</Trans>
            </dt>
            <dd>{amount(projection.expectedInflowMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Expected payments</Trans>
            </dt>
            <dd>{amount(projection.expectedOutflowMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Projected closing cash</Trans>
            </dt>
            <dd>{amount(projection.endingCashMicros)}</dd>
          </div>
          <div
            data-shortfall={hasCashShortfall ? 'true' : undefined}
            role={hasCashShortfall ? 'status' : undefined}
          >
            <dt>
              <Trans>First negative daily close</Trans>
            </dt>
            <dd>
              {projection.firstNegativeDate === undefined
                ? t`Not confirmed`
                : (projection.firstNegativeDate ??
                  t`None in the reviewed dated items`)}
            </dd>
          </div>
        </StyledForecastTotals>
        <small>
          <Trans>
            Daily closing balances combine each day’s expected collections and
            payments. They do not show the order of payments within a day.
          </Trans>
        </small>
      </StyledDeliveryStack>
    </section>
  );
};

export const FinanceForecastTimeline = ({
  projection,
  currency,
  incomplete,
}: FinanceForecastTimelineProps) => {
  const { t } = useLingui();
  return (
    <details>
      <summary>{t`Daily closing scenario (${projection.timeline.length} days)`}</summary>
      <StyledDeliveryStack>
        {incomplete && (
          <p>
            <Trans>
              Only eligible dated expectations are included. Review the
              unresolved items above.
            </Trans>
          </p>
        )}
        <StyledForecastDays aria-label={t`Daily projected cash`}>
          {projection.timeline.map((day) => (
            <StyledForecastDay
              key={day.date}
              aria-label={t`Closing scenario for ${day.date}`}
            >
              <time dateTime={day.date}>{day.date}</time>
              <span>
                {t`Collections`}:{' '}
                {formatFinanceAmountMicros(day.inflowMicros, currency)}
              </span>
              <span>
                {t`Payments`}:{' '}
                {formatFinanceAmountMicros(day.outflowMicros, currency)}
              </span>
              <strong>
                {t`Closing cash`}:{' '}
                {formatFinanceAmountMicros(day.closingMicros, currency)}
              </strong>
            </StyledForecastDay>
          ))}
        </StyledForecastDays>
      </StyledDeliveryStack>
    </details>
  );
};
