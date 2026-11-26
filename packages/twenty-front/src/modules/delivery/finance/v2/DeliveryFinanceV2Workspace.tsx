import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  StyledFinanceDesktopNavigation,
  StyledFinanceMobileNavigation,
  StyledFinanceWorkspace,
} from '@/delivery/finance/financeStyles';
import { FinanceV2DashboardTab } from '@/delivery/finance/v2/FinanceV2DashboardTab';
import { FinanceV2ExpensesTab } from '@/delivery/finance/v2/FinanceV2ExpensesTab';
import { FinanceV2LiabilitiesTab } from '@/delivery/finance/v2/FinanceV2LiabilitiesTab';
import { FinanceV2PayrollTab } from '@/delivery/finance/v2/FinanceV2PayrollTab';
import { FinanceV2QuotesInvoicesTab } from '@/delivery/finance/v2/FinanceV2QuotesInvoicesTab';
import { FinanceV2SetupTab } from '@/delivery/finance/v2/FinanceV2SetupTab';
import {
  CHANGE_DELIVERY_FINANCE_V2,
  GET_DELIVERY_FINANCE_V2,
} from '@/delivery/finance/v2/finance-v2.graphql';
import {
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  isFinanceV2Currency,
  isValidIsoDate,
  isValidYearMonth,
} from '@/delivery/finance/v2/finance-v2-currency';
import {
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';

type DeliveryFinanceV2WorkspaceProps = {
  onChanged: () => Promise<unknown>;
};

const FINANCE_V2_TABS = [
  'dashboard',
  'documents',
  'expenses',
  'payroll',
  'liabilities',
  'setup',
] as const;

type FinanceV2TabId = (typeof FINANCE_V2_TABS)[number];

const LEGACY_FINANCE_VIEW_ALIASES: Record<string, FinanceV2TabId> = {
  monthly: 'dashboard',
  forecast: 'dashboard',
  cash: 'dashboard',
  payments: 'documents',
  reconciliation: 'documents',
  'ai-costs': 'expenses',
  plans: 'expenses',
  exports: 'setup',
};

const monthBounds = (
  yearMonth: string,
): { fromDate: string; toDate: string } => {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    fromDate: `${yearMonth}-01`,
    toDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const DeliveryFinanceV2Workspace = ({
  onChanged,
}: DeliveryFinanceV2WorkspaceProps) => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const permission = useWorkflowAccess();

  const requestedTab = params.get('financeView');
  const activeTab: FinanceV2TabId = FINANCE_V2_TABS.includes(
    requestedTab as FinanceV2TabId,
  )
    ? (requestedTab as FinanceV2TabId)
    : requestedTab && requestedTab in LEGACY_FINANCE_VIEW_ALIASES
      ? LEGACY_FINANCE_VIEW_ALIASES[requestedTab]
      : 'dashboard';

  const legacyMonthParam = params.get('financeMonth');
  const legacyMonthRange =
    legacyMonthParam && isValidYearMonth(legacyMonthParam)
      ? monthBounds(legacyMonthParam)
      : null;

  const fromDate =
    params.get('financeFrom') ?? legacyMonthRange?.fromDate ?? undefined;
  const toDate =
    params.get('financeTo') ?? legacyMonthRange?.toDate ?? undefined;
  const asOfDate =
    params.get('financeAsOf') ?? legacyMonthRange?.toDate ?? undefined;
  const payrollMonth =
    params.get('financePayrollMonth') ??
    (legacyMonthRange ? legacyMonthParam! : undefined);
  const requestedCurrency = params.get('financeCurrency');

  const query = useQuery<{ deliveryFinanceV2: FinanceV2Snapshot }>(
    GET_DELIVERY_FINANCE_V2,
    {
      variables: {
        input: {
          ...(fromDate ? { fromDate } : {}),
          ...(toDate ? { toDate } : {}),
          ...(asOfDate ? { asOfDate } : {}),
          ...(payrollMonth ? { payrollMonth } : {}),
        },
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance,
    },
  );

  const [mutate] = useMutation<{
    changeDeliveryFinanceV2: Record<string, unknown>;
  }>(CHANGE_DELIVERY_FINANCE_V2);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastTab, setLastTab] = useState<FinanceV2TabId>(activeTab);

  if (lastTab !== activeTab) {
    setLastTab(activeTab);
    if (error) setError('');
    if (notice) setNotice('');
  }

  const data = query.data?.deliveryFinanceV2;
  const showPayrollTab = data ? data.canViewPayroll : false;
  const baseCurrency: FinanceV2Currency = data?.profile.baseCurrency ?? 'AED';
  const displayCurrency: FinanceV2Currency = isFinanceV2Currency(
    requestedCurrency,
  )
    ? requestedCurrency
    : baseCurrency;

  const setDisplayCurrency = (nextCurrency: FinanceV2Currency) => {
    const next = new URLSearchParams(params);
    if (nextCurrency === baseCurrency) next.delete('financeCurrency');
    else next.set('financeCurrency', nextCurrency);
    setParams(next);
  };

  const tabOptions: { value: FinanceV2TabId; label: string }[] = [
    { value: 'dashboard', label: t`Dashboard (P&L & Balance Sheet)` },
    { value: 'documents', label: t`Quotes & Invoices` },
    { value: 'expenses', label: t`Expenses & Assets` },
    ...(showPayrollTab
      ? [{ value: 'payroll' as const, label: t`Payroll` }]
      : []),
    { value: 'liabilities', label: t`Liabilities (People)` },
    { value: 'setup', label: t`Setup & Exports` },
  ];

  const destination = (nextTab: FinanceV2TabId) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    if (nextTab === 'dashboard') next.delete('financeView');
    else next.set('financeView', nextTab);
    if (nextTab !== 'expenses') next.delete('financeCategory');
    return `/delivery?${next.toString()}`;
  };

  const describeSuccess = (
    action: string,
    payload: Record<string, unknown> | null,
    isEdit = false,
  ): string => {
    switch (action) {
      case 'runDueAutomation': {
        const exp = Number(payload?.recurringExpensesPosted ?? 0);
        const pay = Number(payload?.payrollAdjustmentsPosted ?? 0);
        const inv = Number(payload?.invoicesCreated ?? 0);
        return exp + pay + inv === 0
          ? t`All due recurring items are already up to date.`
          : t`Automation complete: ${exp} recurring expense(s), ${pay} payroll adjustment(s), and ${inv} invoice PDF(s) created.`;
      }
      case 'sendQuoteEmail':
      case 'sendInvoiceEmail':
        return t`Email queued with branded PDF attachment (${String(payload?.sentTo ?? '')}).`;
      case 'saveQuote':
        return isEdit
          ? t`Quote updated.`
          : t`Quote saved. Download the PDF or send it to your client anytime.`;
      case 'convertQuoteToInvoice':
        return t`Quote converted to invoice.`;
      case 'voidQuote':
        return t`Quote marked as void / rejected.`;
      case 'saveInvoice':
        return isEdit
          ? t`Invoice updated and PDF refreshed.`
          : t`Invoice created and PDF saved. Revenue counts once payment is recorded.`;
      case 'recordInvoicePayment':
        return t`Payment recorded — Company Cash and P&L Revenue updated.`;
      case 'saveCompanyProfile':
        return t`Company branding and PDF template saved.`;
      case 'setPeriodLock':
        return payload?.lockedThroughDate
          ? t`Accounting period locked through ${String(payload.lockedThroughDate)}.`
          : t`Accounting period lock cleared.`;
      case 'saveExchangeRates':
        return t`Default AED exchange rates updated.`;
      case 'saveRecurringExpense':
        if (payload?.expensedMonth) {
          return t`Recurring bill saved and expensed for ${String(payload.expensedMonth)} — Day-to-Day Expenses, P&L, and Balance Sheet updated.`;
        }
        return isEdit ? t`Recurring bill updated.` : t`Recurring bill saved.`;
      case 'expenseRecurringForMonth':
        return t`Recurring bill expensed for ${String(payload?.month ?? '')} — Day-to-Day Expenses, P&L, and Balance Sheet updated.`;
      case 'savePayrollProfile':
        return t`Payroll salary saved and synced with Recurring Expenses.`;
      case 'addPayrollEntry':
        return t`Payroll event logged. Adjustments apply on payday (or click Post to Expenses).`;
      case 'postPayrollAdjustments':
        return t`Posted ${Number(payload?.postedCount ?? 0)} payroll adjustment(s) to Day-to-Day Expenses.`;
      case 'importAiSpend':
        return t`Imported ${Number(payload?.importedCount ?? 0)} AI cost(s) into Direct Expenses.`;
      case 'voidJournal':
        return t`Ledger entry voided — P&L and Balance Sheet recalculated.`;
      case 'reverseJournal':
        return t`Reversing journal entry posted — P&L and Balance Sheet updated.`;
      default:
        return t`Saved successfully.`;
    }
  };

  const runCommand: FinanceV2CommandRunner = async (input) => {
    if (busy) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await mutate({ variables: { input } });
      const payload = response.data?.changeDeliveryFinanceV2 ?? null;
      if (input.action !== 'exportCsv') {
        await Promise.allSettled([query.refetch(), onChanged()]);
        setNotice(
          describeSuccess(
            String(input.action ?? ''),
            payload,
            Boolean(input.id),
          ),
        );
      }
      return payload;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save this finance change.`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!permission.ready) {
    return (
      <StyledFinanceV2Panel>
        <p role="status">
          <Trans>Checking finance access…</Trans>
        </p>
      </StyledFinanceV2Panel>
    );
  }

  if (!permission.canReadFinance) {
    return (
      <StyledFinanceV2Panel>
        <p role="alert">
          <Trans>
            Finance access is required. Ask an administrator if you need access.
          </Trans>
        </p>
      </StyledFinanceV2Panel>
    );
  }

  return (
    <StyledFinanceWorkspace>
      <StyledFinanceDesktopNavigation aria-label={t`Finance views`}>
        {tabOptions.map((option) => (
          <Link
            key={option.value}
            to={destination(option.value)}
            aria-current={activeTab === option.value ? 'page' : undefined}
          >
            {option.label}
          </Link>
        ))}
      </StyledFinanceDesktopNavigation>

      <StyledFinanceMobileNavigation>
        {t`Finance view`}
        <select
          aria-label={t`Finance view`}
          value={
            activeTab === 'payroll' && !showPayrollTab ? 'dashboard' : activeTab
          }
          onChange={(event) => {
            const next = event.currentTarget.value as FinanceV2TabId;
            if (next !== activeTab) navigate(destination(next));
          }}
        >
          {tabOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </StyledFinanceMobileNavigation>

      {error && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {error}
        </StyledFinanceV2Notice>
      )}
      {notice && (
        <StyledFinanceV2Notice role="status">{notice}</StyledFinanceV2Notice>
      )}

      {query.error && !data && (
        <StyledFinanceV2Panel>
          <p role="alert">
            <Trans>Could not load finance data. Try refreshing.</Trans>
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry</Trans>
            </StyledDeliveryButton>
            {(fromDate || toDate || asOfDate || payrollMonth) && (
              <StyledDeliveryButton
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('financeFrom');
                  next.delete('financeTo');
                  next.delete('financeAsOf');
                  next.delete('financeMonth');
                  next.delete('financePayrollMonth');
                  setParams(next);
                }}
              >
                <Trans>Reset filters</Trans>
              </StyledDeliveryButton>
            )}
          </div>
        </StyledFinanceV2Panel>
      )}

      {!data && !query.error && (
        <StyledFinanceV2Panel>
          <p role="status">
            <Trans>Loading Finance OS…</Trans>
          </p>
        </StyledFinanceV2Panel>
      )}

      {data && activeTab === 'dashboard' && (
        <FinanceV2DashboardTab
          key={`${data.fromDate}:${data.toDate}:${data.asOfDate}`}
          data={data}
          busy={busy}
          displayCurrency={displayCurrency}
          onChangeDisplayCurrency={setDisplayCurrency}
          onSelectExpenseCategory={(category) => {
            const next = new URLSearchParams(params);
            next.set('view', 'finance');
            next.set('financeView', 'expenses');
            next.set('financeCategory', category);
            setParams(next);
          }}
          onRunCommand={runCommand}
          onFilterDates={({
            fromDate: nextFrom,
            toDate: nextTo,
            asOfDate: nextAsOf,
          }) => {
            if (
              !isValidIsoDate(nextFrom) ||
              !isValidIsoDate(nextTo) ||
              !isValidIsoDate(nextAsOf)
            ) {
              setError(t`Choose valid From, To, and As-of dates.`);
              return;
            }
            if (nextFrom > nextTo) {
              setError(t`P&L "From" date cannot be later than "To" date.`);
              return;
            }
            setError('');
            const next = new URLSearchParams(params);
            next.delete('financeMonth');
            next.set('financeFrom', nextFrom);
            next.set('financeTo', nextTo);
            next.set('financeAsOf', nextAsOf);
            setParams(next);
          }}
        />
      )}

      {data && activeTab === 'documents' && (
        <FinanceV2QuotesInvoicesTab
          data={data}
          busy={busy}
          onRunCommand={runCommand}
        />
      )}

      {data && activeTab === 'expenses' && (
        <FinanceV2ExpensesTab
          data={data}
          busy={busy}
          selectedCategory={params.get('financeCategory')}
          onClearCategory={() => {
            const next = new URLSearchParams(params);
            next.delete('financeCategory');
            setParams(next);
          }}
          onRunCommand={runCommand}
        />
      )}

      {data &&
        activeTab === 'payroll' &&
        (data.canViewPayroll ? (
          <FinanceV2PayrollTab
            key={data.payrollMonth}
            data={data}
            busy={busy}
            displayCurrency={displayCurrency}
            onChangeDisplayCurrency={setDisplayCurrency}
            onRunCommand={runCommand}
            onChangePayrollMonth={(month) => {
              const next = new URLSearchParams(params);
              next.set('financePayrollMonth', month);
              setParams(next);
            }}
          />
        ) : (
          <StyledFinanceV2Panel>
            <p role="alert">
              <Trans>Payroll is restricted to workspace administrators.</Trans>
            </p>
          </StyledFinanceV2Panel>
        ))}

      {data && activeTab === 'liabilities' && (
        <FinanceV2LiabilitiesTab
          data={data}
          busy={busy}
          onRunCommand={runCommand}
        />
      )}

      {data && activeTab === 'setup' && (
        <FinanceV2SetupTab data={data} busy={busy} onRunCommand={runCommand} />
      )}
    </StyledFinanceWorkspace>
  );
};
