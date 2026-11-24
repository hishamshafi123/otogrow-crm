import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2HeroGrid,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2SplitGrid,
  StyledFinanceV2Stack,
  StyledFinanceV2StatCard,
  StyledFinanceV2StatementRow,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  type FinanceV2CommandRunner,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2DashboardTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onFilterDates: (next: {
    fromDate: string;
    toDate: string;
    asOfDate: string;
  }) => void;
  onRunCommand: FinanceV2CommandRunner;
};

export const FinanceV2DashboardTab = ({
  data,
  busy,
  onFilterDates,
  onRunCommand,
}: FinanceV2DashboardTabProps) => {
  const { t } = useLingui();
  const [fromDate, setFromDate] = useState(data.fromDate);
  const [toDate, setToDate] = useState(data.toDate);
  const [asOfDate, setAsOfDate] = useState(data.asOfDate);
  const { profitAndLoss: pnl, balanceSheet: bs, pendingReceivables } = data;

  const categoryLabel = (category: string): string => {
    switch (category) {
      case 'DIRECT_SUBSCRIPTION':
        return t`Subscriptions & tools`;
      case 'DIRECT_SALARY':
        return t`Team base salaries`;
      case 'DIRECT_CONTRACTOR':
        return t`Freelancers & contractors`;
      case 'DIRECT_AI':
        return t`AI production spend`;
      case 'DIRECT_OTHER':
        return t`Other direct expenses`;
      case 'PAYROLL_OVERTIME':
        return t`Payroll overtime`;
      case 'PAYROLL_LEAVE_REDUCTION':
        return t`Payroll unpaid leave reductions`;
      case 'PAYROLL_BONUS':
        return t`Payroll bonuses`;
      case 'INDIRECT_MEALS':
        return t`Team meals`;
      case 'INDIRECT_COURSES':
        return t`Courses & training`;
      case 'INDIRECT_OFFICE':
        return t`Office & utilities`;
      case 'INDIRECT_ADMIN':
        return t`Admin, legal & banking`;
      case 'INDIRECT_OTHER':
        return t`Other indirect expenses`;
      default:
        return category;
    }
  };

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <div>
            <h2>
              <Trans>Financial Overview (AED)</Trans>
            </h2>
            <small>
              <Trans>
                All currencies automatically roll up into AED. Revenue counts
                when client payments arrive.
              </Trans>
            </small>
          </div>
          {data.canManage && (
            <StyledDeliveryButton
              disabled={busy}
              onClick={() =>
                void onRunCommand({
                  action: 'runDueAutomation',
                  asOfDate: data.today,
                })
              }
            >
              <Trans>Run due recurring items now</Trans>
            </StyledDeliveryButton>
          )}
        </StyledFinanceV2HeaderRow>
        <StyledFinanceV2FormGrid>
          <label>
            <Trans>P&amp;L from</Trans>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            <Trans>P&amp;L to</Trans>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label>
            <Trans>Balance sheet as of</Trans>
            <input
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
            />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <StyledDeliveryButton
              disabled={busy}
              onClick={() => onFilterDates({ fromDate, toDate, asOfDate })}
            >
              <Trans>Update reports</Trans>
            </StyledDeliveryButton>
          </div>
        </StyledFinanceV2FormGrid>
      </StyledFinanceV2Panel>

      <StyledFinanceV2HeroGrid>
        <StyledFinanceV2StatCard>
          <small>
            <Trans>Company Cash (AED total)</Trans>
          </small>
          <strong>
            {formatFinanceAmountMicros(bs.totalCashAedMicros, 'AED')}
          </strong>
          <p>
            {bs.cashByCurrency.length > 0
              ? bs.cashByCurrency
                  .map((item) =>
                    formatFinanceAmountMicros(
                      item.originalMicros,
                      item.currency,
                    ),
                  )
                  .join(' · ')
              : t`Set opening cash in Setup`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>
            <Trans>
              Net Profit ({pnl.fromDate} → {pnl.toDate})
            </Trans>
          </small>
          <strong>
            {formatFinanceAmountMicros(pnl.netProfitAedMicros, 'AED')}
          </strong>
          <p>
            {pnl.grossMarginPercent !== null
              ? t`Gross margin ${pnl.grossMarginPercent}%`
              : t`No paid revenue in this period`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>
            <Trans>Unpaid Client Invoices</Trans>
          </small>
          <strong>
            {formatFinanceAmountMicros(
              pendingReceivables.totalAedMicros,
              'AED',
            )}
          </strong>
          <p>
            {pendingReceivables.overdueCount > 0
              ? t`${pendingReceivables.overdueCount} overdue (${formatFinanceAmountMicros(pendingReceivables.overdueAedMicros, 'AED')})`
              : t`${pendingReceivables.count} unpaid · none overdue`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>
            <Trans>Owed to People (Liabilities)</Trans>
          </small>
          <strong>
            {formatFinanceAmountMicros(bs.totalLiabilitiesAedMicros, 'AED')}
          </strong>
          <p>{t`${bs.liabilitiesByPerson.length} people tracked`}</p>
        </StyledFinanceV2StatCard>
      </StyledFinanceV2HeroGrid>

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <h3>
              <Trans>Profit &amp; Loss (AED)</Trans>
            </h3>
            <StyledFinanceV2Pill data-tone="info">
              {pnl.fromDate} → {pnl.toDate}
            </StyledFinanceV2Pill>
          </StyledFinanceV2HeaderRow>

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Revenue (paid invoices)</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(pnl.revenueAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Direct Expenses</Trans>
          </small>
          {pnl.directBreakdown.length === 0 ? (
            <small>
              <Trans>No direct expenses in this period.</Trans>
            </small>
          ) : (
            pnl.directBreakdown.map((item) => (
              <StyledFinanceV2StatementRow key={item.category}>
                <span>{categoryLabel(item.category)}</span>
                <span>{formatFinanceAmountMicros(item.aedMicros, 'AED')}</span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Direct Expenses</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(pnl.directExpenseAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Gross Profit</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(pnl.grossProfitAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Indirect Expenses</Trans>
          </small>
          {pnl.indirectBreakdown.length === 0 ? (
            <small>
              <Trans>No indirect expenses in this period.</Trans>
            </small>
          ) : (
            pnl.indirectBreakdown.map((item) => (
              <StyledFinanceV2StatementRow key={item.category}>
                <span>{categoryLabel(item.category)}</span>
                <span>{formatFinanceAmountMicros(item.aedMicros, 'AED')}</span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Indirect Expenses</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(pnl.indirectExpenseAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          {pnl.fxGainLossAedMicros !== '0' && (
            <StyledFinanceV2StatementRow>
              <span>
                <Trans>Currency Exchange Gain / Loss</Trans>
              </span>
              <span>
                {formatFinanceAmountMicros(pnl.fxGainLossAedMicros, 'AED')}
              </span>
            </StyledFinanceV2StatementRow>
          )}

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Net Profit</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(pnl.netProfitAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <h3>
              <Trans>Balance Sheet (AED)</Trans>
            </h3>
            <StyledDeliveryRow>
              <StyledFinanceV2Pill
                data-tone={bs.isBalanced ? 'success' : 'danger'}
              >
                {bs.isBalanced ? t`Balanced ✓` : t`Check imbalance`}
              </StyledFinanceV2Pill>
              <StyledFinanceV2Pill>{bs.asOfDate}</StyledFinanceV2Pill>
            </StyledDeliveryRow>
          </StyledFinanceV2HeaderRow>

          <small>
            <Trans>Assets</Trans>
          </small>
          {bs.cashByCurrency.map((cash) => (
            <StyledFinanceV2StatementRow key={cash.accountId}>
              <span>
                {t`Company Cash (${cash.currency})`} ·{' '}
                {formatFinanceAmountMicros(cash.originalMicros, cash.currency)}
              </span>
              <span>{formatFinanceAmountMicros(cash.aedMicros, 'AED')}</span>
            </StyledFinanceV2StatementRow>
          ))}
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Equipment &amp; Assets (purchase value)</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(bs.fixedAssetsAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Assets</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(bs.totalAssetsAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Liabilities (Owed to People)</Trans>
          </small>
          {bs.liabilitiesByPerson.length === 0 ? (
            <small>
              <Trans>No amounts owed to people.</Trans>
            </small>
          ) : (
            bs.liabilitiesByPerson.map((person) => (
              <StyledFinanceV2StatementRow key={person.accountId}>
                <span>{t`Owed to ${person.personName}`}</span>
                <span>
                  {formatFinanceAmountMicros(
                    person.balanceOwedAedMicros,
                    'AED',
                  )}
                </span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Liabilities</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(bs.totalLiabilitiesAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Equity</Trans>
          </small>
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Opening Accumulated Profits</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(bs.openingEquityAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Accumulated Net Profit</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(
                bs.accumulatedNetProfitAedMicros,
                'AED',
              )}
            </span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Equity</Trans>
            </span>
            <span>
              {formatFinanceAmountMicros(bs.totalEquityAedMicros, 'AED')}
            </span>
          </StyledFinanceV2StatementRow>

          <StyledFinanceV2Notice>
            <Trans>
              Pending unpaid client invoices:{' '}
              {formatFinanceAmountMicros(
                pendingReceivables.totalAedMicros,
                'AED',
              )}{' '}
              ({pendingReceivables.count} open). Under cash-basis accounting,
              these move into Cash and Revenue once paid.
            </Trans>
          </StyledFinanceV2Notice>
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>
    </StyledFinanceV2Stack>
  );
};
