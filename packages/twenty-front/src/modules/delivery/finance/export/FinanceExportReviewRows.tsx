import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import {
  type FinanceExportDestination,
  type FinanceExportExclusion,
  type FinanceExportProfile,
  type FinanceExportRow,
  type FinanceExportTotals,
} from '@/delivery/finance/export/finance-export.types';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledExportRow,
  StyledExportTotals,
} from '@/delivery/finance/export/financeExportStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const financeExportSourceDestination = (
  basis: string,
  sourceId: string,
  currency: string,
  serviceMonth?: string | null,
) =>
  basis === 'CASH'
    ? `/delivery?view=finance&financeView=payments&financeCash=${encodeURIComponent(sourceId)}&financeCurrency=${encodeURIComponent(currency)}`
    : `/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(sourceId)}&financeCurrency=${encodeURIComponent(currency)}${serviceMonth ? `&financeMonth=${serviceMonth}` : ''}`;
type FinanceExportTotalsViewProps = {
  totals: FinanceExportTotals;
  currency: string;
  basis: string;
};
export const FinanceExportTotalsView = ({
  totals,
  currency,
  basis,
}: FinanceExportTotalsViewProps) => {
  const { t } = useLingui();
  return (
    <section aria-label={t`Complete export selection totals`}>
      <StyledExportTotals>
        <div>
          <dt>
            {basis === 'CASH' ? t`Money received` : t`Recognized revenue`}
          </dt>
          <dd>{formatFinanceAmountMicros(totals.incomingMicros, currency)}</dd>
        </div>
        <div>
          <dt>{basis === 'CASH' ? t`Money paid` : t`Recognized costs`}</dt>
          <dd>{formatFinanceAmountMicros(totals.outgoingMicros, currency)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Net amount</Trans>
          </dt>
          <dd>{formatFinanceAmountMicros(totals.netMicros, currency)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Financial sources</Trans>
          </dt>
          <dd>{totals.sourceCount}</dd>
        </div>
        <div>
          <dt>
            <Trans>CSV rows</Trans>
          </dt>
          <dd>{totals.rowCount}</dd>
        </div>
        <div>
          <dt>
            <Trans>Excluded sources</Trans>
          </dt>
          <dd>{totals.exclusionCount}</dd>
        </div>
        <div>
          <dt>
            <Trans>Errors</Trans>
          </dt>
          <dd>{totals.errorCount}</dd>
        </div>
      </StyledExportTotals>
      <small>
        <Trans>
          Totals cover the complete server-selected period, including rows on
          other pages.
        </Trans>
      </small>
    </section>
  );
};
type FinanceExportRowsProps = {
  rows: FinanceExportRow[];
  profile: FinanceExportProfile;
  basis: string;
  destination: FinanceExportDestination;
  historical?: boolean;
};
export const FinanceExportRows = ({
  rows,
  profile,
  basis,
  destination,
  historical = false,
}: FinanceExportRowsProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  return (
    <section aria-label={t`Export transaction rows`}>
      <StyledDeliveryStack>
        {!rows.length && (
          <p>
            <Trans>No transaction rows on this page.</Trans>
          </p>
        )}
        {rows.map((row) => (
          <StyledExportRow key={row.key}>
            <strong>
              {row.title} ·{' '}
              {formatFinanceAmountMicros(row.amountMicros, row.currency)}
            </strong>
            <p>
              {labels.kinds[row.kind] ?? t`Financial transaction`} · {row.date}
              {row.serviceMonth
                ? ` · ${t`Service month`}: ${row.serviceMonth}`
                : ''}{' '}
              ·{' '}
              {isDefined(row.projectId)
                ? (row.projectName ?? t`Unavailable client project`)
                : t`Company / unassigned`}
            </p>
            <p>
              {t`Source version`}: {row.sourceRevision} ·{' '}
              {historical ? t`Exported status` : t`Source status`}:{' '}
              {labels.status(row.sourceStatus)}
              {historical
                ? ` · ${t`Current status`}: ${labels.status(row.currentStatus)}`
                : ''}
            </p>
            {row.sourceChanged && (
              <p role="status">
                <Trans>
                  The current source differs from this saved batch. Its original
                  CSV remains unchanged.
                </Trans>
              </p>
            )}
            {row.sourceReference && (
              <p>
                {t`Original reference`}: {row.sourceReference}
              </p>
            )}
            {row.previousBatchCount > 0 && (
              <p>
                {t`Earlier batches containing this financial source: ${row.previousBatchCount}`}{' '}
                {row.latestBatchId && (
                  <Link
                    to={destination({
                      financeExportSection: 'batches',
                      financeExportBatch: row.latestBatchId,
                      financeExportBatchRowsAfter: null,
                    })}
                  >
                    <Trans>Review earlier batch</Trans>
                  </Link>
                )}
              </p>
            )}
            {row.errors.map((error) => (
              <p key={error} role="alert">
                {labels.issue(error)}
              </p>
            ))}
            {row.warnings.map((warning) => (
              <p key={warning} role="status">
                {labels.issue(warning)}
              </p>
            ))}
            <Link
              to={financeExportSourceDestination(
                basis,
                row.sourceId,
                row.currency,
                row.serviceMonth,
              )}
            >
              <Trans>Open financial source</Trans>
            </Link>
            {row.evidenceUrl && /^https?:\/\//i.test(row.evidenceUrl) && (
              <a href={row.evidenceUrl} target="_blank" rel="noreferrer">
                <Trans>Source evidence</Trans>
              </a>
            )}
            <details>
              <summary>
                <Trans>CSV fields and source identity</Trans>
              </summary>
              <p>
                {t`Source ID`}: {row.sourceId}
              </p>
              <dl>
                {profile.columns.map((column, index) => (
                  <div key={`${column.header}:${index}`}>
                    <dt>{column.header}</dt>
                    <dd>
                      {isDefined(row.cells[index])
                        ? row.cells[index] === ''
                          ? t`Empty value`
                          : row.cells[index]
                        : t`Not available`}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </StyledExportRow>
        ))}
      </StyledDeliveryStack>
    </section>
  );
};
type FinanceExportExclusionsProps = {
  exclusions: FinanceExportExclusion[];
  basis: string;
  currency: string;
  serviceMonth?: string | null;
};
export const FinanceExportExclusions = ({
  exclusions,
  basis,
  currency,
  serviceMonth,
}: FinanceExportExclusionsProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  return (
    <section aria-label={t`Sources excluded from export`}>
      <h3>
        <Trans>Excluded sources</Trans>
      </h3>
      {!exclusions.length && (
        <p>
          <Trans>No excluded sources on this page.</Trans>
        </p>
      )}
      {exclusions.map((row) => (
        <StyledExportRow key={row.key}>
          <strong>{row.title ?? t`Financial source needs review`}</strong>
          <p>
            {labels.issue(row.code)} ·{' '}
            {isDefined(row.amountMicros)
              ? formatFinanceAmountMicros(row.amountMicros, currency)
              : t`Amount not confirmed`}
          </p>
          {row.blocking && (
            <p role="alert">
              <Trans>This issue blocks batch creation.</Trans>
            </p>
          )}
          {row.previousBatchCount > 0 && (
            <p>
              <Trans>
                This source appeared in an earlier batch. Review its correction
                with the accountant.
              </Trans>
            </p>
          )}
          {row.sourceId && (
            <Link
              to={
                basis === 'CASH'
                  ? `/delivery?view=finance&financeCurrency=${currency}`
                  : financeExportSourceDestination(
                      basis,
                      row.sourceId,
                      currency,
                      serviceMonth,
                    )
              }
            >
              <Trans>Review original source</Trans>
            </Link>
          )}
        </StyledExportRow>
      ))}
    </section>
  );
};
