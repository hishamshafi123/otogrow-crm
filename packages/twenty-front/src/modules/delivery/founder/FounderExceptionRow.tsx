import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDateWithoutTime, isDefined } from 'twenty-shared/utils';
import { type FounderException } from '@/delivery/founder/founder.types';
import { founderActionDestination } from '@/delivery/founder/founder-action-destination';
import { useFounderLabels } from '@/delivery/founder/useFounderLabels';
import {
  StyledFounderEvidence,
  StyledFounderHeading,
} from '@/delivery/founder/founderStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type FounderExceptionRowProps = { item: FounderException };
const evidenceDate = (value: string) => {
  if (isDateWithoutTime(value) || /^\d{4}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString(undefined, { timeZone: 'UTC' })} UTC`
    : value;
};
export const FounderExceptionRow = ({ item }: FounderExceptionRowProps) => {
  const { t } = useLingui();
  const labels = useFounderLabels();
  const financeLabels = useFinanceLabels();
  const { evidence } = item;
  const date =
    item.sourceType === 'TASK'
      ? item.dueAt
      : item.sourceType === 'MONTHLY_RESULT'
        ? (item.nextAction.serviceMonth ?? evidence.date)
        : (item.dueAt ?? evidence.date ?? item.occurredAt);
  const dateLabel =
    item.sourceType === 'TASK'
      ? t`Due`
      : item.sourceType === 'COMMITMENT'
        ? t`Period review date`
        : item.sourceType === 'MONTHLY_RESULT'
          ? t`Result month`
          : item.reasonCode === 'FORECAST_NEGATIVE_CLOSING'
            ? t`First negative daily close`
            : item.reasonCode === 'FORECAST_NEXT_ACTION_OVERDUE'
              ? t`Follow-up date`
              : item.sourceType === 'FORECAST_ITEM'
                ? t`Expected date`
                : [
                      'FORECAST_UNKNOWN_COLLECTION',
                      'FORECAST_UNSCHEDULED_COLLECTION',
                    ].includes(item.reasonCode)
                  ? t`Invoice due`
                  : ['MANUAL_REPORT', 'META_REPORT'].includes(item.sourceType)
                    ? t`Report date`
                    : t`Evidence dated`;
  const amountLabel =
    item.reasonCode === 'FORECAST_NEGATIVE_CLOSING'
      ? t`Projected daily closing balance`
      : item.sourceType === 'FORECAST_ITEM'
        ? t`Remaining expected amount`
        : [
              'FORECAST_UNKNOWN_COLLECTION',
              'FORECAST_UNSCHEDULED_COLLECTION',
            ].includes(item.reasonCode)
          ? t`Remaining invoice balance`
          : item.reasonCode === 'FORECAST_UNAPPLIED_OUTFLOW'
            ? t`Unapplied actual payment`
            : item.reasonCode === 'FORECAST_ANCHOR_MISSING'
              ? t`Starting cash`
              : t`Amount in this evidence`;
  const destination = founderActionDestination(
    item.nextAction,
    financeLabels.currencies,
  );
  const amount = (value: string | null | undefined) =>
    !isDefined(value) || !evidence.currency
      ? t`Amount not confirmed`
      : formatFinanceAmountMicros(value, evidence.currency);
  const owner =
    item.ownerState === 'ACTIVE'
      ? (item.ownerName ?? t`Owner name unavailable`)
      : item.ownerState === 'UNASSIGNED'
        ? t`Unassigned — review ownership in the source`
        : item.ownerName
          ? t`${item.ownerName} — owner unavailable`
          : t`Assigned owner unavailable`;
  const monetary =
    item.domain === 'FINANCE' || isDefined(evidence.amountMicros);
  const hasMonthlyTotals = [
    evidence.revenueMicros,
    evidence.costMicros,
    evidence.resultMicros,
  ].some(isDefined);
  return (
    <article aria-label={item.title}>
      <StyledDeliveryStack>
        <StyledFounderHeading>
          <h3>{labels.reason(item.reasonCode)}</h3>
          <small>{labels.domains[item.domain] ?? t`Company evidence`}</small>
        </StyledFounderHeading>
        <strong>{item.title}</strong>
        <p>
          {isDefined(item.projectId)
            ? (item.projectName ?? t`Client project unavailable`)
            : t`Company / unassigned`}
        </p>
        <StyledFounderEvidence>
          <div>
            <dt>{dateLabel}</dt>
            <dd>
              {date ? evidenceDate(date) : t`Date not confirmed`}
              {date && isDateWithoutTime(date) && evidence.timezone
                ? ` · ${evidence.timezone}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>
              <Trans>Accountable person</Trans>
            </dt>
            <dd>{owner}</dd>
          </div>
          {item.sourceType === 'TASK' && evidence.state === 'IN_REVIEW' && (
            <div>
              <dt>
                <Trans>Pending submission</Trans>
              </dt>
              <dd>
                {evidence.reviewSubmissionVersion
                  ? t`Version ${evidence.reviewSubmissionVersion}`
                  : t`Version unavailable`}
                {' · '}
                {evidence.reviewSubmittedAt
                  ? evidenceDate(evidence.reviewSubmittedAt)
                  : t`Submission time not confirmed`}
              </dd>
            </div>
          )}
          {evidence.state && (
            <div>
              <dt>
                <Trans>Recorded state</Trans>
              </dt>
              <dd>{labels.states[evidence.state] ?? t`State needs review`}</dd>
            </div>
          )}
          {monetary && item.sourceType !== 'MONTHLY_RESULT' && (
            <div>
              <dt>{amountLabel}</dt>
              <dd>{amount(evidence.amountMicros)}</dd>
            </div>
          )}
          {item.sourceType === 'MONTHLY_RESULT' && hasMonthlyTotals && (
            <>
              <div>
                <dt>
                  <Trans>Recorded revenue</Trans>
                </dt>
                <dd>{amount(evidence.revenueMicros)}</dd>
              </div>
              <div>
                <dt>
                  <Trans>Recorded costs</Trans>
                </dt>
                <dd>{amount(evidence.costMicros)}</dd>
              </div>
              <div>
                <dt>
                  <Trans>Recorded result</Trans>
                </dt>
                <dd>{amount(evidence.resultMicros)}</dd>
              </div>
            </>
          )}
          {item.sourceType === 'MONTHLY_RESULT' &&
            !hasMonthlyTotals &&
            item.reasonCode !== 'MONTHLY_DRAFTS' && (
              <div>
                <dt>
                  <Trans>Recorded result</Trans>
                </dt>
                <dd>
                  <Trans>Amount not confirmed</Trans>
                </dd>
              </div>
            )}
          {item.domain === 'CAMPAIGNS' && evidence.currency && !monetary && (
            <div>
              <dt>
                <Trans>Report currency</Trans>
              </dt>
              <dd>{evidence.currency}</dd>
            </div>
          )}
          {isDefined(evidence.promisedQuantity) && (
            <div>
              <dt>
                <Trans>Promised</Trans>
              </dt>
              <dd>{evidence.promisedQuantity}</dd>
            </div>
          )}
          {isDefined(evidence.fulfilledQuantity) && (
            <div>
              <dt>
                <Trans>Currently fulfilled</Trans>
              </dt>
              <dd>{evidence.fulfilledQuantity}</dd>
            </div>
          )}
          {isDefined(evidence.remainingQuantity) && (
            <div>
              <dt>
                <Trans>Remaining</Trans>
              </dt>
              <dd>{evidence.remainingQuantity}</dd>
            </div>
          )}
        </StyledFounderEvidence>
        {item.sourceType === 'MONTHLY_RESULT' && (
          <small>
            <Trans>
              This is the selected month’s recorded contribution. Complete costs
              and company profitability are not verified.
            </Trans>
          </small>
        )}
        {destination ? (
          <Link to={destination}>{labels.action(item.nextAction.code)}</Link>
        ) : (
          <p role="status">
            <Trans>
              The source link could not be confirmed. Refresh the exceptions
              before continuing.
            </Trans>
          </p>
        )}
        <details>
          <summary>
            <Trans>Evidence and source details</Trans>
          </summary>
          {item.sourceRevision && (
            <p>
              {t`Source version`}: {item.sourceRevision}
            </p>
          )}
          {item.sourceId && (
            <p>
              {t`Source ID`}: {item.sourceId}
            </p>
          )}
          {item.occurredAt && (
            <p>
              {t`Recorded at`}: {evidenceDate(item.occurredAt)}
            </p>
          )}
          {evidence.timezone && (
            <p>
              {t`Reporting time zone`}: {evidence.timezone}
            </p>
          )}
          {evidence.warnings.map((code) => (
            <p key={code}>
              {labels.warning(
                code,
                item.domain === 'FINANCE' &&
                  item.sourceType !== 'MONTHLY_RESULT',
              )}
            </p>
          ))}
        </details>
      </StyledDeliveryStack>
    </article>
  );
};
