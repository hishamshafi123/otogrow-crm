import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryFinanceV2Workspace } from '@/delivery/finance/v2/DeliveryFinanceV2Workspace';
import { type FinanceV2Snapshot } from '@/delivery/finance/v2/finance-v2.types';

if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = Request as unknown as typeof globalThis.Request;
}

const mockUseQuery = jest.fn();
const mockMutate = jest.fn();
const mockUseWorkflowAccess = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => [mockMutate],
}));

jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => mockUseWorkflowAccess(),
}));

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({ get: () => null }),
}));

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
}));

jest.mock('@/delivery/finance/financeStyles', () => ({
  StyledFinanceWorkspace: 'div',
  StyledFinanceDesktopNavigation: 'nav',
  StyledFinanceMobileNavigation: 'label',
}));

jest.mock('@/delivery/finance/v2/finance-v2.styles', () => ({
  StyledFinanceV2Stack: 'div',
  StyledFinanceV2HeroGrid: 'div',
  StyledFinanceV2StatCard: 'article',
  StyledFinanceV2SplitGrid: 'div',
  StyledFinanceV2Panel: 'section',
  StyledFinanceV2HeaderRow: 'div',
  StyledFinanceV2StatementRow: 'div',
  StyledFinanceV2SubTabs: 'div',
  StyledFinanceV2SubTabButton: 'button',
  StyledFinanceV2FormGrid: 'div',
  StyledFinanceV2TableWrap: 'div',
  StyledFinanceV2Table: 'table',
  StyledFinanceV2Pill: 'span',
  StyledFinanceV2Notice: 'p',
  StyledFinanceV2LogoPreview: 'img',
  StyledFinanceV2InlineEditor: 'div',
  StyledFinanceV2ActionGroup: 'div',
  StyledFinanceV2BarTrack: 'span',
  StyledFinanceV2BarFill: 'span',
  StyledFinanceV2TrendGrid: 'div',
  StyledFinanceV2TrendItem: 'div',
  StyledFinanceV2BreakdownButton: 'button',
  StyledFinanceV2BreakdownHeader: 'span',
  StyledFinanceV2ReadinessGrid: 'div',
  StyledFinanceV2ReadinessCard: 'div',
}));

const sampleSnapshot: FinanceV2Snapshot = {
  workspaceId: 'ws-1',
  memberId: 'mem-1',
  userWorkspaceId: 'uw-1',
  canManage: true,
  canViewPayroll: true,
  today: '2026-11-24',
  fromDate: '2026-11-01',
  toDate: '2026-11-30',
  asOfDate: '2026-11-30',
  payrollMonth: '2026-11',
  profile: {
    id: 'prof-1',
    companyName: 'Otogrow Media LLC',
    legalAddress: 'Dubai, UAE',
    email: 'finance@otogrow.com',
    phone: '',
    website: '',
    logoDataUrl: null,
    bankDetails: 'IBAN AE00',
    defaultQuoteTerms: 'Valid for 14 days',
    defaultInvoiceNotes: 'Thank you',
    baseCurrency: 'AED',
    rateCard: [],
    exchangeRates: { AED: '1', USD: '3.6725', INR: '0.0435', QAR: '1.008' },
  },
  accounts: [
    {
      id: 'cash-usd',
      code: 'CASH:USD',
      name: 'Company Cash (USD)',
      accountType: 'ASSET',
      subType: 'CASH_CURRENCY',
      currency: 'USD',
      personName: null,
      personEmail: null,
      active: true,
    },
    {
      id: 'liab-hisham',
      code: 'LIABILITY:PERSON:1',
      name: 'Owed to Hisham',
      accountType: 'LIABILITY',
      subType: 'PERSON_LIABILITY',
      currency: 'USD',
      personName: 'Hisham',
      personEmail: 'hisham@otogrow.com',
      active: true,
    },
  ],
  profitAndLoss: {
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    revenueAedMicros: '18362500000',
    directExpenseAedMicros: '1000000000',
    grossProfitAedMicros: '17362500000',
    grossMarginPercent: '94.55',
    indirectExpenseAedMicros: '500000000',
    totalExpenseAedMicros: '1500000000',
    fxGainLossAedMicros: '0',
    netProfitAedMicros: '16862500000',
    netMarginPercent: '91.83',
    directBreakdown: [
      { category: 'DIRECT_SUBSCRIPTION', aedMicros: '1000000000' },
    ],
    indirectBreakdown: [
      { category: 'INDIRECT_COURSES', aedMicros: '500000000' },
    ],
  },
  balanceSheet: {
    asOfDate: '2026-11-30',
    cashByCurrency: [
      {
        accountId: 'cash-usd',
        currency: 'USD',
        originalMicros: '15000000000',
        aedMicros: '55087500000',
      },
    ],
    totalCashAedMicros: '55087500000',
    fixedAssetsAedMicros: '4000000000',
    totalAssetsAedMicros: '59087500000',
    liabilitiesByPerson: [
      {
        accountId: 'liab-hisham',
        personName: 'Hisham',
        personEmail: 'hisham@otogrow.com',
        totalBorrowedAedMicros: '5500000000',
        totalRepaidAedMicros: '0',
        balanceOwedAedMicros: '5500000000',
        byCurrency: [],
      },
    ],
    totalLiabilitiesAedMicros: '5500000000',
    openingEquityAedMicros: '36725000000',
    accumulatedNetProfitAedMicros: '16862500000',
    totalEquityAedMicros: '53587500000',
    isBalanced: true,
    imbalanceAedMicros: '0',
  },
  analytics: {
    previousPeriod: {
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
      revenueAedMicros: '10000000000',
      totalExpenseAedMicros: '1000000000',
      grossProfitAedMicros: '9500000000',
      netProfitAedMicros: '9000000000',
    },
    monthlyTrend: [
      {
        month: '2026-06',
        revenueAedMicros: '0',
        directExpenseAedMicros: '0',
        indirectExpenseAedMicros: '0',
        totalExpenseAedMicros: '0',
        netProfitAedMicros: '0',
        netMarginPercent: null,
      },
      {
        month: '2026-07',
        revenueAedMicros: '0',
        directExpenseAedMicros: '0',
        indirectExpenseAedMicros: '0',
        totalExpenseAedMicros: '0',
        netProfitAedMicros: '0',
        netMarginPercent: null,
      },
      {
        month: '2026-08',
        revenueAedMicros: '0',
        directExpenseAedMicros: '0',
        indirectExpenseAedMicros: '0',
        totalExpenseAedMicros: '0',
        netProfitAedMicros: '0',
        netMarginPercent: null,
      },
      {
        month: '2026-09',
        revenueAedMicros: '0',
        directExpenseAedMicros: '0',
        indirectExpenseAedMicros: '0',
        totalExpenseAedMicros: '0',
        netProfitAedMicros: '0',
        netMarginPercent: null,
      },
      {
        month: '2026-10',
        revenueAedMicros: '10000000000',
        directExpenseAedMicros: '500000000',
        indirectExpenseAedMicros: '500000000',
        totalExpenseAedMicros: '1000000000',
        netProfitAedMicros: '9000000000',
        netMarginPercent: '90',
      },
      {
        month: '2026-11',
        revenueAedMicros: '18362500000',
        directExpenseAedMicros: '1000000000',
        indirectExpenseAedMicros: '500000000',
        totalExpenseAedMicros: '1500000000',
        netProfitAedMicros: '16862500000',
        netMarginPercent: '91.83',
      },
    ],
    burnAndRunway: {
      periodNetCashFlowAedMicros: '16862500000',
      avgMonthlyExpense3mAedMicros: '833333333',
      avgMonthlyNetBurn3mAedMicros: '0',
      estimatedRunwayMonths: null,
    },
    invoiceAging: [
      { key: 'NOT_DUE', count: 0, aedMicros: '0' },
      { key: 'DAYS_1_15', count: 1, aedMicros: '7345000000' },
      { key: 'DAYS_16_30', count: 0, aedMicros: '0' },
      { key: 'DAYS_31_PLUS', count: 0, aedMicros: '0' },
    ],
    upcomingCommitments30d: {
      windowStart: '2026-11-24',
      windowEnd: '2026-12-24',
      recurringExpensesAedMicros: '0',
      recurringExpenseCount: 0,
      payrollAedMicros: '652500000',
      payrollCount: 1,
      expectedReceivablesAedMicros: '0',
      expectedReceivableCount: 0,
    },
    payrollMonthRevenueAedMicros: '18362500000',
    projectProfitability: [],
  },
  pendingReceivables: {
    count: 1,
    totalAedMicros: '7345000000',
    overdueCount: 1,
    overdueAedMicros: '7345000000',
  },
  journals: [
    {
      id: 'j-leave',
      entryDate: '2026-11-28',
      entryType: 'PAYROLL_LEAVE_REDUCTION',
      category: 'PAYROLL_LEAVE_REDUCTION',
      title: 'Arjun — Unpaid Leave Reduction (1d, 2026-11)',
      notes: 'Unpaid leave adjustment (1d) for 2026-11.',
      currency: 'INR',
      amountMicros: '-576923077',
      fxRateToAed: '0.0435',
      aedAmountMicros: '25096154',
      fundingAccountId: 'cash-usd',
      fundingAccountName: 'Company Cash (INR)',
      targetAccountName: 'Direct Expenses',
      projectId: null,
      receiptUrl: null,
      status: 'POSTED',
      voidReason: null,
    },
    {
      id: 'j-open',
      entryDate: '2026-11-01',
      entryType: 'OPENING_BALANCE',
      category: 'OPENING',
      title: 'Existing USD profits',
      notes: '',
      currency: 'USD',
      amountMicros: '10000000000',
      fxRateToAed: '3.6725',
      aedAmountMicros: '36725000000',
      fundingAccountId: null,
      fundingAccountName: null,
      targetAccountName: 'Company Cash (USD)',
      projectId: null,
      receiptUrl: null,
      status: 'POSTED',
      voidReason: null,
    },
  ],
  recurringExpenses: [
    {
      id: 'rec-1',
      title: 'Arjun — Base Salary',
      expenseType: 'DIRECT_EXPENSE',
      category: 'DIRECT_SALARY',
      currency: 'INR',
      amountMicros: '15000000000',
      dayOfMonth: 28,
      fundingAccountId: 'cash-usd',
      fundingAccountName: 'Company Cash (INR)',
      employeeMemberId: 'emp-1',
      employeeName: 'Arjun',
      notes: '',
      startMonth: '2026-11',
      endMonth: null,
      status: 'ACTIVE',
    },
  ],
  payrollProfiles: [
    {
      id: 'pay-1',
      employeeMemberId: 'emp-1',
      employeeName: 'Arjun',
      roleLabel: 'Editor',
      currency: 'INR',
      baseSalaryMicros: '15000000000',
      workingDaysPerMonth: 26,
      paidLeavesPerMonth: 2,
      payDayOfMonth: 28,
      fundingAccountId: 'cash-usd',
      fundingAccountName: 'Company Cash (INR)',
      recurringExpenseId: 'rec-1',
      active: true,
    },
  ],
  payrollSummaries: [
    {
      profileId: 'pay-1',
      employeeName: 'Arjun',
      month: '2026-11',
      currency: 'INR',
      baseSalaryMicros: '15000000000',
      workingDaysPerMonth: 26,
      paidLeavesPerMonth: 2,
      perDayMicros: '576923077',
      leavesTakenDays: '3',
      swapsDays: '0',
      netLeaveDays: '3',
      paidLeavesUsedDays: '2',
      paidLeavesRemainingDays: '0',
      unpaidLeaveDays: '1',
      unpaidLeaveDeductionMicros: '576923077',
      overtimeDays: '1',
      overtimePayMicros: '576923077',
      bonusTotalMicros: '0',
      netPayableMicros: '15000000000',
    },
  ],
  payrollEntries: [],
  quotes: [
    {
      id: 'qt-1',
      quoteNumber: 'QT-2026-0001',
      clientName: 'Nova Labs',
      clientEmail: 'ops@novalabs.io',
      clientAddress: '',
      projectId: null,
      currency: 'USD',
      issueDate: '2026-11-20',
      validUntil: '2026-12-04',
      lineItems: [],
      subtotalMicros: '3000000000',
      discountTotalMicros: '0',
      totalMicros: '3000000000',
      notes: '',
      terms: '',
      status: 'DRAFT',
      sentAt: null,
      convertedInvoiceId: null,
      convertedScheduleId: null,
      voidReason: null,
    },
  ],
  invoiceSchedules: [],
  invoices: [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      scheduleId: null,
      scheduleMonth: null,
      sourceQuoteId: null,
      clientName: 'Acme Global',
      clientEmail: 'ap@acme.com',
      clientAddress: '',
      projectId: null,
      currency: 'USD',
      issueDate: '2026-11-01',
      dueDate: '2026-11-17',
      lineItems: [],
      subtotalMicros: '2000000000',
      discountTotalMicros: '0',
      totalMicros: '2000000000',
      paidMicros: '0',
      outstandingMicros: '2000000000',
      overdueDays: 7,
      status: 'READY',
      pdfStoragePath: null,
      sentAt: null,
      sentVia: null,
      notes: '',
      voidReason: null,
    },
  ],
  aiSpendCandidates: [],
  projects: [],
  members: [{ id: 'emp-1', name: 'Arjun' }],
};

const renderWorkspace = (initialUrl = '/delivery?view=finance') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryFinanceV2Workspace onChanged={jest.fn()} />
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialUrl] },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return router;
};

describe('DeliveryFinanceV2Workspace (G6 & G8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflowAccess.mockReturnValue({
      ready: true,
      canReadFinance: true,
      canManageFinance: true,
    });
    mockUseQuery.mockReturnValue({
      data: { deliveryFinanceV2: sampleSnapshot },
      error: undefined,
      refetch: jest.fn(),
    });
    mockMutate.mockResolvedValue({
      data: { changeDeliveryFinanceV2: { ok: true } },
    });
  });

  it('denies non-finance users without exposing payroll or ledger details', () => {
    mockUseWorkflowAccess.mockReturnValue({
      ready: true,
      canReadFinance: false,
      canManageFinance: false,
    });
    renderWorkspace();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Finance access is required/i,
    );
    expect(screen.queryByText(/Arjun/)).not.toBeInTheDocument();
  });

  it('renders balanced AED P&L and Balance Sheet on Dashboard and navigates across all 6 tabs', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByText(/Financial Overview \(AED\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Balanced ✓/i)).toBeInTheDocument();
    expect(screen.getByText(/Owed to Hisham/i)).toBeInTheDocument();

    // Quotes & Invoices tab shows overdue days badge + quotes convert/void
    await user.click(screen.getByRole('link', { name: /Quotes & Invoices/i }));
    expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/7 days overdue/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Quotes \(1\)/i }));
    expect(screen.getByText('QT-2026-0001')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Convert to Invoice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Void \/ Reject/i }),
    ).toBeInTheDocument();

    // Payroll tab shows ÷26 working days & internal paid leave tracking
    await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
    expect(screen.getByText(/Payroll \(Admin Only\)/i)).toBeInTheDocument();
    expect(screen.getByText('Arjun')).toBeInTheDocument();
    expect(screen.getByText(/÷26d/)).toBeInTheDocument();

    // Liabilities tab shows per-person owed card & Repay action
    await user.click(screen.getByRole('link', { name: /Liabilities/i }));
    expect(
      screen.getByText(/Liabilities — Money Owed to People/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Repay/i })).toBeInTheDocument();

    // Setup tab shows Company Branding, Opening Balances & CSV exports
    await user.click(screen.getByRole('link', { name: /Setup & Exports/i }));
    expect(
      screen.getByText(/Company Branding & PDF Format/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Opening Balances \(Existing Accumulated Profits\)/i),
    ).toBeInTheDocument();
  });

  it('C4: hides Payroll tab & Payroll CSV from non-admin finance.read users and blocks direct Payroll URL', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: {
        deliveryFinanceV2: {
          ...sampleSnapshot,
          canManage: false,
          canViewPayroll: false,
          payrollProfiles: [],
          payrollSummaries: [],
          payrollEntries: [],
        },
      },
      error: undefined,
      refetch: jest.fn(),
    });

    renderWorkspace('/delivery?view=finance&financeView=payroll');
    expect(
      screen.queryByRole('link', { name: /^Payroll$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Payroll is restricted to workspace administrators/i,
    );

    await user.click(screen.getByRole('link', { name: /Setup & Exports/i }));
    expect(
      screen.queryByRole('button', { name: /Payroll Summary/i }),
    ).not.toBeInTheDocument();
  });

  it('C6, H10, H11, H15: supports All Ledger void confirmation, signed AED on leave reduction, Send Email confirmation, and editing Payroll with 0 paid leaves', async () => {
    const user = userEvent.setup();
    renderWorkspace('/delivery?view=finance&financeView=expenses');

    // H10: Signed negative AED appears next to negative PAYROLL_LEAVE_REDUCTION
    expect(
      screen.getByText(/Arjun — Unpaid Leave Reduction/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/-AED\s+25\.096154/)).toBeInTheDocument();
    expect(screen.queryByText('Existing USD profits')).not.toBeInTheDocument();

    // C6: All Ledger reveals Opening Balance & Void confirmation requires reason
    await user.click(
      screen.getByRole('button', { name: /All Ledger \(Opening/i }),
    );
    expect(screen.getByText('Existing USD profits')).toBeInTheDocument();
    const voidButtons = screen.getAllByRole('button', { name: /^Void$/i });
    await user.click(voidButtons[1]);
    expect(
      screen.getByText(/Void Entry: Existing USD profits/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Confirm Void/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Enter a short reason before voiding/i,
    );
    await user.type(
      screen.getByPlaceholderText(/Entered wrong amount/i),
      'Test correction',
    );
    await user.click(screen.getByRole('button', { name: /Confirm Void/i }));
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'voidJournal',
          journalId: 'j-open',
          reason: 'Test correction',
        },
      },
    });

    // H15: Send Invoice Email opens explicit confirmation before sending
    await user.click(screen.getByRole('link', { name: /Quotes & Invoices/i }));
    await user.click(screen.getByRole('button', { name: /Send Email/i }));
    expect(
      screen.getByText(/Send Invoice INV-2026-0001 via Email/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Confirm & Send Email/i }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'sendInvoiceEmail',
          invoiceId: 'inv-1',
          toEmail: 'ap@acme.com',
          message: '',
        },
      },
    });

    // H11 & H15: Edit Payroll Profile opens inline under the employee row and allows setting 0 paid leaves
    await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
    const editButton = screen.getByRole('button', { name: /^Edit$/i });
    const payrollTable = editButton.closest('table');
    expect(payrollTable).not.toBeNull();
    await user.click(editButton);
    const baseSalaryInput = screen.getByLabelText(/^Monthly Base Salary/i);
    expect(payrollTable).toContainElement(baseSalaryInput);
    expect(baseSalaryInput).toHaveFocus();
    const paidLeavesInput = screen.getByLabelText(
      /Internal paid leaves \/ month/i,
    );
    await user.clear(paidLeavesInput);
    await user.type(paidLeavesInput, '0');
    await user.click(
      screen.getByRole('button', { name: /Update Salary Profile/i }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({
          action: 'savePayrollProfile',
          id: 'pay-1',
          paidLeavesPerMonth: 0,
        }),
      },
    });
  });

  it('HI-4 & MD-7: closes open edit form when switching document sub-tabs and offers Reset filters on date-filter query error', async () => {
    const user = userEvent.setup();
    renderWorkspace('/delivery?view=finance&financeView=documents');

    // Open Edit on Invoice, switch to Quotes, switch back -> Invoice edit form must be closed
    await user.click(screen.getByRole('button', { name: /^Edit$/i }));
    expect(screen.getByText(/Edit Invoice/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Quotes \(1\)/i }));
    await user.click(screen.getByRole('button', { name: /Invoices \(1\)/i }));
    expect(screen.queryByText(/Edit Invoice/i)).not.toBeInTheDocument();

    // MD-7: Query failure with URL date filters offers a Reset filters recovery button
    mockUseQuery.mockReturnValue({
      data: undefined,
      error: new Error('Invalid range'),
      refetch: jest.fn(),
    });
    const router = renderWorkspace(
      '/delivery?view=finance&financeFrom=2026-12-01&financeTo=2026-11-01',
    );
    await user.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(router.state.location.search).not.toContain('financeFrom=');
    expect(router.state.location.search).not.toContain('financeTo=');
  });

  it('M6: shows unified-currency Payroll totals with live currency switcher and cash-readiness check, plus Dashboard monthly presets, margins & currency switch', async () => {
    const user = userEvent.setup();
    const router = renderWorkspace('/delivery?view=finance');

    // Dashboard shows Total Revenue, Total Expenses, Gross/Net Margins, 6-month trend & Aging
    expect(screen.getByText(/Total Revenue \(2026-11-01/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Total Expenses \(2026-11-01/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Gross margin 94\.55%/i)).toBeInTheDocument();
    expect(screen.getByText(/Net margin 91\.83%/i)).toBeInTheDocument();
    expect(
      screen.getByText(/6-Month Performance Trend \(AED\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Invoice Aging Buckets/i)).toBeInTheDocument();

    // Clicking "Last Month" preset updates URL to 2026-10-01 .. 2026-10-31
    await user.click(screen.getByRole('button', { name: /Last Month/i }));
    expect(router.state.location.search).toContain('financeFrom=2026-10-01');
    expect(router.state.location.search).toContain('financeTo=2026-10-31');

    // Switch Dashboard display currency to USD -> persists in URL and updates overview heading
    await user.selectOptions(
      screen.getByLabelText(/Dashboard display currency/i),
      'USD',
    );
    expect(router.state.location.search).toContain('financeCurrency=USD');
    expect(screen.getByText(/Financial Overview \(USD\)/i)).toBeInTheDocument();

    // Navigate to Payroll tab -> displayCurrency=USD persists, unified totals & INR cash shortfall shown
    await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
    expect(screen.getByText(/Total Net Payroll \(USD\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Total \(USD\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Shortfall ₹15,000\.00/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$177\.67/).length).toBeGreaterThan(0);

    // Switch Payroll display currency to INR -> exact native total INR 15,000.00 (zero FX drift)
    await user.selectOptions(
      screen.getByLabelText(/Payroll display currency/i),
      'INR',
    );
    expect(router.state.location.search).toContain('financeCurrency=INR');
    expect(screen.getByText(/Total Net Payroll \(INR\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Total \(INR\)/i)).toBeInTheDocument();
  });

  it('M6 rework: drills down from Dashboard Expense Breakdown into filtered Expenses ledger, clears filter, and shows No burn recorded when zero burn/cashflow', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: {
        deliveryFinanceV2: {
          ...sampleSnapshot,
          analytics: {
            ...sampleSnapshot.analytics!,
            burnAndRunway: {
              periodNetCashFlowAedMicros: '0',
              avgMonthlyExpense3mAedMicros: '0',
              avgMonthlyNetBurn3mAedMicros: '0',
              estimatedRunwayMonths: null,
            },
          },
          journals: [
            ...sampleSnapshot.journals,
            {
              id: 'j-sub',
              entryDate: '2026-11-12',
              entryType: 'EXPENSE',
              category: 'DIRECT_SUBSCRIPTION',
              title: 'Figma Team Plan',
              currency: 'USD',
              amountMicros: '100000000',
              fxRateToAed: '3.6725',
              aedAmountMicros: '367250000',
              fundingAccountId: 'cash-usd',
              fundingAccountName: 'Company Cash (USD)',
              projectId: null,
              receiptUrl: null,
              notes: '',
              status: 'POSTED',
              voidReason: null,
              createdAt: '2026-11-12T00:00:00Z',
            },
          ],
        },
      },
      error: undefined,
      refetch: jest.fn(),
    });

    const router = renderWorkspace('/delivery?view=finance');
    expect(screen.getByText(/No burn recorded/i)).toBeInTheDocument();

    // Click Subscriptions & tools in Expense Breakdown -> navigates to Expenses filtered to DIRECT_SUBSCRIPTION
    await user.click(
      screen.getByRole('button', { name: /Subscriptions & tools/i }),
    );
    expect(router.state.location.search).toContain(
      'financeCategory=DIRECT_SUBSCRIPTION',
    );
    expect(screen.getByText('Figma Team Plan')).toBeInTheDocument();
    expect(
      screen.queryByText(/Arjun — Unpaid Leave Reduction/i),
    ).not.toBeInTheDocument();

    // Clear category filter restores other expenses and removes URL param
    await user.click(
      screen.getByRole('button', { name: /Clear category filter/i }),
    );
    expect(router.state.location.search).not.toContain('financeCategory=');
    expect(
      screen.getByText(/Arjun — Unpaid Leave Reduction/i),
    ).toBeInTheDocument();
  });

  it('M7: clears stale FX rate on currency switch, sends clientRequestId, and blocks/sanitizes unsafe receipt URLs', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: {
        deliveryFinanceV2: {
          ...sampleSnapshot,
          journals: [
            ...sampleSnapshot.journals,
            {
              id: 'j-xss',
              entryDate: '2026-11-15',
              entryType: 'EXPENSE',
              category: 'DIRECT_SUBSCRIPTION',
              title: 'Suspicious Receipt Item',
              currency: 'AED',
              amountMicros: '50000000',
              fxRateToAed: '1',
              aedAmountMicros: '50000000',
              fundingAccountId: 'cash-aed',
              fundingAccountName: 'Company Cash (AED)',
              projectId: null,
              receiptUrl: ['javascript', 'alert(1)'].join(':'),
              notes: '',
              status: 'POSTED',
              voidReason: null,
              createdAt: '2026-11-15T00:00:00Z',
            },
          ],
        },
      },
      error: undefined,
      refetch: jest.fn(),
    });

    renderWorkspace('/delivery?view=finance&financeView=expenses');

    // Stored javascript: URL must NOT render a clickable link
    expect(screen.getByText('Suspicious Receipt Item')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Receipt/i }),
    ).not.toBeInTheDocument();

    // Open the Add Expense form
    await user.click(
      screen.getByRole('button', { name: /\+ Record Expense or Asset/i }),
    );

    // Fill expense form with USD + custom FX rate, then switch currency to AED
    const titleInput = screen.getByPlaceholderText(
      /e\.g\. MacBook Pro or Team Lunch/i,
    );
    const expenseForm = titleInput.closest('form')!;
    await user.type(titleInput, 'Office Supplies');
    await user.type(within(expenseForm).getByPlaceholderText('250'), '100');
    const currencySelect = within(expenseForm).getByLabelText(/^Currency$/i);
    await user.selectOptions(currencySelect, 'USD');
    const fxInput = within(expenseForm).getByLabelText(/FX Rate \(USD/i);
    await user.type(fxInput, '3.80');
    expect(fxInput).toHaveValue('3.80');

    // Switch back to AED -> FX input disappears and stale rate must not be submitted
    await user.selectOptions(currencySelect, 'AED');
    expect(
      within(expenseForm).queryByLabelText(/FX Rate/i),
    ).not.toBeInTheDocument();

    // Try submitting javascript: receiptUrl -> blocked client-side before mutation
    const receiptInput =
      within(expenseForm).getByPlaceholderText('https://...');
    await user.type(receiptInput, ['javascript', 'alert(1)'].join(':'));
    await user.click(
      within(expenseForm).getByRole('button', { name: /Save Entry/i }),
    );
    expect(
      screen.getByText(/Receipt link must start with https:\/\/ or http:\/\//i),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    // Fix receiptUrl to valid https -> submits without fxRateToAed and includes clientRequestId
    await user.clear(receiptInput);
    await user.type(receiptInput, 'https://example.com/receipt.pdf');
    await user.click(
      within(expenseForm).getByRole('button', { name: /Save Entry/i }),
    );

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const submittedPayload = mockMutate.mock.calls[0][0].variables.input;
    expect(submittedPayload.action).toBe('recordExpenseOrAsset');
    expect(submittedPayload.currency).toBe('AED');
    expect(submittedPayload.fxRateToAed).toBeUndefined();
    expect(submittedPayload.receiptUrl).toBe('https://example.com/receipt.pdf');
    expect(typeof submittedPayload.clientRequestId).toBe('string');
    expect(submittedPayload.clientRequestId.length).toBeGreaterThanOrEqual(8);
  });

  it('M8: supports inline Mark Paid with overpayment guard, read-only Details on PAID invoice, live draft totals, non-USD AI spend, Liabilities inline Repay & History, Setup read-only guards, and Payroll confirmation', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: {
        deliveryFinanceV2: {
          ...sampleSnapshot,
          projects: [{ id: 'proj-1', name: 'Acme Retainer' }],
          invoices: [
            ...sampleSnapshot.invoices,
            {
              ...sampleSnapshot.invoices[0],
              id: 'inv-paid',
              invoiceNumber: 'INV-2026-0002',
              clientName: 'Paid Client Ltd',
              projectId: 'proj-1',
              totalMicros: '1000000000',
              paidMicros: '1000000000',
              outstandingMicros: '0',
              overdueDays: 0,
              status: 'PAID',
              lineItems: [
                {
                  id: 'li-1',
                  label: 'Brand Retainer',
                  quantity: '1',
                  unitPriceMicros: '1000000000',
                  discountPercent: '0',
                  lineTotalMicros: '1000000000',
                },
              ],
            },
          ],
          balanceSheet: {
            ...sampleSnapshot.balanceSheet,
            liabilitiesByPerson: [
              {
                accountId: 'liab-hisham',
                personName: 'Hisham',
                personEmail: 'hisham@otogrow.com',
                totalBorrowedAedMicros: '5500000000',
                totalRepaidAedMicros: '0',
                balanceOwedAedMicros: '5500000000',
                byCurrency: [
                  {
                    currency: 'USD',
                    borrowedMicros: '1500000000',
                    repaidMicros: '0',
                    balanceOwedMicros: '1500000000',
                  },
                ],
              },
            ],
          },
          journals: [
            ...sampleSnapshot.journals,
            {
              id: 'j-loan',
              entryDate: '2026-11-05',
              entryType: 'LOAN_IN',
              category: 'LOAN_IN',
              title: 'Founder seed loan',
              notes: '',
              currency: 'USD',
              amountMicros: '1500000000',
              fxRateToAed: '3.6725',
              aedAmountMicros: '5508750000',
              fundingAccountId: 'liab-hisham',
              fundingAccountName: 'Owed to Hisham',
              targetAccountName: 'Company Cash (USD)',
              projectId: null,
              receiptUrl: null,
              status: 'POSTED',
              voidReason: null,
            },
          ],
          aiSpendCandidates: [
            {
              id: 'ai-eur-1',
              sourceKind: 'AI_STUDIO',
              clientName: 'Anthropic EU',
              taskName: 'Claude API',
              currency: 'EUR',
              amountMicros: '250000000',
              occurredAt: '2026-11-18T12:00:00Z',
            },
          ],
        },
      },
      error: undefined,
      refetch: jest.fn(),
    });

    renderWorkspace('/delivery?view=finance&financeView=documents');

    // 1. Inline Mark Paid blocks overpayment above $2,000 outstanding
    const markPaidBtn = screen.getByRole('button', { name: /Mark Paid/i });
    const invoicesTable = markPaidBtn.closest('table');
    expect(invoicesTable).not.toBeNull();
    await user.click(markPaidBtn);
    const amountPaidInput = screen.getByLabelText(/Amount received \(USD\)/i);
    expect(invoicesTable).toContainElement(amountPaidInput);
    await user.clear(amountPaidInput);
    await user.type(amountPaidInput, '2500');
    await user.click(
      screen.getByRole('button', { name: /Confirm Payment Received/i }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /cannot exceed the remaining balance due/i,
    );
    expect(mockMutate).not.toHaveBeenCalled();

    // 2. Read-only Details panel opens inline on PAID invoice
    const paidRow = screen.getByText('INV-2026-0002').closest('tr')!;
    await user.click(
      within(paidRow).getByRole('button', { name: /^Details$/i }),
    );
    expect(
      screen.getByText(/Invoice INV-2026-0002 Details/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Brand Retainer')).toBeInTheDocument();
    // Single-panel exclusivity: Mark Paid panel closed automatically
    expect(
      screen.queryByLabelText(/Amount received \(USD\)/i),
    ).not.toBeInTheDocument();

    // 3. New Invoice displays live Grand Total calculation and defaultInvoiceNotes
    await user.click(screen.getByRole('button', { name: /\+ New Invoice/i }));
    expect(screen.getByDisplayValue('Thank you')).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText(/Monthly Creative Retainer/i),
      'Design Sprint',
    );
    const unitPriceInput = screen.getByPlaceholderText('2500');
    await user.type(unitPriceInput, '1000');
    expect(screen.getByText(/Grand Total: \$1,000\.00/i)).toBeInTheDocument();

    // 4. Expenses -> AI Costs respects EUR currency (not hardcoded USD)
    await user.click(screen.getByRole('link', { name: /Expenses/i }));
    await user.click(screen.getByRole('button', { name: /AI Costs \(1\)/i }));
    expect(screen.getByText(/Claude API/i)).toBeInTheDocument();
    expect(screen.getByText(/€250\.00/)).toBeInTheDocument();

    // 5. Liabilities -> inline Repay pre-fills owed USD 1500 & inline History shows loan
    await user.click(screen.getByRole('link', { name: /Liabilities/i }));
    await user.click(screen.getByRole('button', { name: /^Repay$/i }));
    expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /History \(1\)/i }));
    expect(screen.getByText('Founder seed loan')).toBeInTheDocument();

    // 6. Payroll -> Post to Expenses asks for inline confirmation before calling forceResync
    await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
    await user.click(screen.getByRole('button', { name: /Post to Expenses/i }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Post or re-sync Arjun's 2026-11 payroll adjustments/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Confirm Post to Expenses/i }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'postPayrollAdjustments',
          profileId: 'pay-1',
          month: '2026-11',
          forceResync: true,
        },
      },
    });

    // 7. Setup -> shows recorded Opening Balances table & active export date range labels
    await user.click(screen.getByRole('link', { name: /Setup & Exports/i }));
    expect(screen.getByText('Existing USD profits')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Profit & Loss \(2026-11-01 → 2026-11-30\)/i,
      }),
    ).toBeInTheDocument();
  });

  it('M9: normalizes legacy V1 URLs, supports payroll payTiming/startMonth, period lock, cached logo KEEP, and locked-period Reversal', async () => {
    const user = userEvent.setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      blob: jest.fn(),
    }) as unknown as typeof fetch;

    try {
      const snapshotWithLock: FinanceV2Snapshot = {
        ...sampleSnapshot,
        profile: {
          ...sampleSnapshot.profile,
          logoDataUrl: null,
          hasLogo: true,
          logoUpdatedAt: 'abc123def4567890',
          timezone: 'Asia/Dubai',
          lockedThroughDate: '2026-11-15',
        },
        payrollProfiles: [
          {
            ...sampleSnapshot.payrollProfiles[0],
            payTiming: 'SAME_MONTH' as const,
            startMonth: '2026-09',
          },
        ],
        invoices: [
          {
            ...sampleSnapshot.invoices[0],
            payments: [
              {
                journalId: 'j-inv-pay-locked',
                paymentDate: '2026-11-10',
                amountMicros: '500000000',
                aedAmountMicros: '1836250000',
                currency: 'USD',
                status: 'POSTED',
                reversed: false,
              },
              {
                journalId: 'j-inv-pay-rev',
                paymentDate: '2026-11-08',
                amountMicros: '100000000',
                aedAmountMicros: '367250000',
                currency: 'USD',
                status: 'POSTED',
                reversed: true,
              },
            ],
          },
        ],
        journals: [
          ...sampleSnapshot.journals,
          {
            id: 'j-locked-exp',
            entryDate: '2026-11-10',
            entryType: 'EXPENSE',
            category: 'INDIRECT_SOFTWARE',
            title: 'Closed period SaaS bill',
            notes: '',
            currency: 'AED' as const,
            amountMicros: '250000000',
            fxRateToAed: '1',
            aedAmountMicros: '250000000',
            fundingAccountId: 'cash-usd',
            fundingAccountName: 'Company Cash (AED)',
            targetAccountName: 'Indirect Expense',
            projectId: null,
            receiptUrl: null,
            status: 'POSTED' as const,
            reversalOfJournalId: null,
            voidReason: null,
          },
        ],
      };
      mockUseQuery.mockReturnValue({
        data: { deliveryFinanceV2: snapshotWithLock },
        loading: false,
        error: undefined,
        refetch: jest.fn(),
      });

      // 1. Legacy V1 financeView=payments normalizes to Quotes & Invoices (documents) + propagates financeMonth
      renderWorkspace(
        '/delivery?view=finance&financeView=payments&financeMonth=2026-10',
      );
      expect(
        screen.getByRole('link', { name: /Quotes & Invoices/i }),
      ).toHaveAttribute('aria-current', 'page');
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: {
            input: {
              fromDate: '2026-10-01',
              toDate: '2026-10-31',
              asOfDate: '2026-10-31',
              payrollMonth: '2026-10',
            },
          },
        }),
      );
      // Locked invoice payment offers Reverse (not Void), and reversed payment shows Reversed pill
      expect(screen.getByText(/^Reversed$/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^Reverse$/i }),
      ).toBeInTheDocument();

      // 2. Expenses -> locked entry hides Void and offers Reverse; posts reverseJournal
      await user.click(screen.getByRole('link', { name: /Expenses/i }));
      const lockedRow = screen
        .getByText('Closed period SaaS bill')
        .closest('tr')!;
      expect(
        within(lockedRow).queryByRole('button', { name: /^Void$/i }),
      ).not.toBeInTheDocument();
      await user.click(
        within(lockedRow).getByRole('button', { name: /^Reverse$/i }),
      );
      const reasonInput = screen.getByLabelText(/Reason for reversal/i);
      await user.type(reasonInput, 'Entered twice in October close');
      await user.click(screen.getByRole('button', { name: /Post Reversal/i }));
      expect(mockMutate).toHaveBeenCalledWith({
        variables: {
          input: {
            action: 'reverseJournal',
            journalId: 'j-locked-exp',
            reversalDate: '2026-11-24',
            reason: 'Entered twice in October close',
          },
        },
      });
      mockMutate.mockClear();

      // 3. Payroll -> Edit preserves startMonth & payTiming, blocks paidLeaves > workingDays
      await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
      await user.click(screen.getByRole('button', { name: /^Edit$/i }));
      expect(screen.getByLabelText(/Payroll start month/i)).toHaveValue(
        '2026-09',
      );
      expect(screen.getByLabelText(/Pay timing/i)).toHaveValue('SAME_MONTH');
      const paidLeavesInput = screen.getByLabelText(/Internal paid leaves/i);
      await user.clear(paidLeavesInput);
      await user.type(paidLeavesInput, '28');
      await user.click(
        screen.getByRole('button', { name: /Update Salary Profile/i }),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        /cannot exceed working days/i,
      );
      expect(mockMutate).not.toHaveBeenCalled();

      // 4. Setup -> timezone selector, omits logoDataUrl when unchanged, and Period Lock submits setPeriodLock
      await user.click(screen.getByRole('link', { name: /Setup & Exports/i }));
      const tzSelect = screen.getByLabelText(/Workspace timezone/i);
      await user.selectOptions(tzSelect, 'Asia/Kolkata');
      await user.click(
        screen.getByRole('button', {
          name: /Save Company Profile & PDF Branding/i,
        }),
      );
      const saveProfileCall = mockMutate.mock.calls[0]?.[0]?.variables?.input;
      expect(saveProfileCall.action).toBe('saveCompanyProfile');
      expect(saveProfileCall.timezone).toBe('Asia/Kolkata');
      expect('logoDataUrl' in saveProfileCall).toBe(false);

      mockMutate.mockClear();
      await user.click(screen.getByRole('button', { name: /Unlock Period/i }));
      expect(mockMutate).toHaveBeenCalledWith({
        variables: {
          input: {
            action: 'setPeriodLock',
            lockedThroughDate: null,
          },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Recurring bills: shows current-month status, expenses an active bill inline, and supports creating + expensing immediately', async () => {
    const user = userEvent.setup();
    const recurringSnap: FinanceV2Snapshot = {
      ...sampleSnapshot,
      today: '2026-11-26',
      profile: {
        ...sampleSnapshot.profile,
        lockedThroughDate: '2026-11-15',
      },
      recurringExpenses: [
        {
          id: 'rec-adobe',
          title: 'Adobe Creative Cloud',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SUBSCRIPTION',
          currency: 'USD',
          amountMicros: '99000000',
          dayOfMonth: 28,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: null,
          employeeName: null,
          notes: 'Design apps',
          startMonth: '2026-11',
          endMonth: null,
          status: 'ACTIVE',
          currentMonthStatus: 'NOT_POSTED',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
        {
          id: 'rec-figma',
          title: 'Figma Organization',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SUBSCRIPTION',
          currency: 'USD',
          amountMicros: '45000000',
          dayOfMonth: 5,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: null,
          employeeName: null,
          notes: '',
          startMonth: '2026-10',
          endMonth: null,
          status: 'ACTIVE',
          currentMonthStatus: 'POSTED',
          currentMonthEntryDate: '2026-11-05',
          currentMonthJournalId: 'j-figma-nov',
        },
        {
          id: 'rec-voided',
          title: 'Notion Plus',
          expenseType: 'INDIRECT_EXPENSE',
          category: 'INDIRECT_OFFICE',
          currency: 'USD',
          amountMicros: '20000000',
          dayOfMonth: 10,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: null,
          employeeName: null,
          notes: '',
          startMonth: '2026-11',
          endMonth: null,
          status: 'ACTIVE',
          currentMonthStatus: 'VOID',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
        {
          id: 'rec-paused',
          title: 'Paused Tool',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SUBSCRIPTION',
          currency: 'USD',
          amountMicros: '15000000',
          dayOfMonth: 12,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: null,
          employeeName: null,
          notes: '',
          startMonth: '2026-11',
          endMonth: null,
          status: 'PAUSED',
          currentMonthStatus: 'NOT_POSTED',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
      ],
    };

    mockUseQuery.mockReturnValue({
      data: { deliveryFinanceV2: recurringSnap },
      loading: false,
      error: undefined,
      refetch: jest.fn(async () => undefined),
    });
    mockMutate.mockResolvedValue({
      data: {
        changeDeliveryFinanceV2: {
          ok: true,
          month: '2026-11',
          expensedMonth: '2026-11',
        },
      },
    });

    renderWorkspace('/delivery?view=finance&financeView=expenses');
    await user.click(
      screen.getByRole('button', { name: /Recurring Bills & Salaries/i }),
    );

    // Already-expensed row shows Expensed pill + date and hides Expense This Month button
    const figmaRow = screen.getByText('Figma Organization').closest('tr')!;
    expect(within(figmaRow).getByText('Expensed')).toBeInTheDocument();
    expect(within(figmaRow).getByText('2026-11-05')).toBeInTheDocument();
    expect(
      within(figmaRow).queryByRole('button', { name: /Expense This Month/i }),
    ).not.toBeInTheDocument();

    // Paused row hides Expense This Month button
    const pausedRow = screen.getByText('Paused Tool').closest('tr')!;
    expect(
      within(pausedRow).queryByRole('button', { name: /Expense This Month/i }),
    ).not.toBeInTheDocument();

    // Voided row offers Re-expense This Month
    const voidedRow = screen.getByText('Notion Plus').closest('tr')!;
    expect(within(voidedRow).getByText('Voided')).toBeInTheDocument();
    expect(
      within(voidedRow).getByRole('button', {
        name: /Re-expense This Month/i,
      }),
    ).toBeInTheDocument();

    // Active unexpensed row: open inline panel, reject locked date, then post valid date + FX
    const adobeRow = screen.getByText('Adobe Creative Cloud').closest('tr')!;
    expect(within(adobeRow).getByText('Not expensed')).toBeInTheDocument();
    await user.click(
      within(adobeRow).getByRole('button', { name: /^Expense This Month$/i }),
    );

    const dateInput = screen.getByLabelText(/Recurring expense date/i);
    expect(dateInput).toHaveValue('2026-11-26');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-11-10');
    await user.click(
      screen.getByRole('button', { name: /Confirm & Expense/i }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/locked period/i);
    expect(mockMutate).not.toHaveBeenCalled();

    await user.clear(dateInput);
    await user.type(dateInput, '2026-11-25');
    await user.type(
      screen.getByLabelText(/Recurring expense FX rate \(USD → AED\)/i),
      '3.68',
    );
    await user.click(
      screen.getByRole('button', { name: /Confirm & Expense/i }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'expenseRecurringForMonth',
          id: 'rec-adobe',
          month: '2026-11',
          entryDate: '2026-11-25',
          fxRateToAed: '3.68',
        },
      },
    });
    mockMutate.mockClear();

    // Create new recurring bill with "Also expense for current month (2026-11) right now" checked,
    // verify customized Expense date is preserved when Charge day changes, and clientRequestId is sent
    await user.click(
      screen.getByRole('button', { name: /\+ New Recurring Bill/i }),
    );
    await user.type(
      screen.getByPlaceholderText(/Adobe Creative Cloud/i),
      'Slack Pro',
    );
    await user.type(screen.getByPlaceholderText('99'), '120');
    await user.click(
      screen.getByRole('checkbox', {
        name: /Also expense for current month \(2026-11\) right now/i,
      }),
    );
    const createDateInput = screen.getByLabelText(
      /Current month expense date/i,
    );
    // Day 1 is inside locked period (<= 2026-11-15), so default expense date safely picks today 2026-11-26
    expect(createDateInput).toHaveValue('2026-11-26');
    await user.clear(createDateInput);
    await user.type(createDateInput, '2026-11-20');
    const dayInput = screen.getByLabelText(/Charge day of month/i);
    await user.clear(dayInput);
    await user.type(dayInput, '24');
    // Customized date stays 2026-11-20 after changing charge day
    expect(createDateInput).toHaveValue('2026-11-20');

    await user.click(
      screen.getByRole('button', { name: /Save & Expense \(2026-11\)/i }),
    );
    const saveCall = mockMutate.mock.calls[0]?.[0]?.variables?.input;
    expect(saveCall).toEqual(
      expect.objectContaining({
        action: 'saveRecurringExpense',
        title: 'Slack Pro',
        amountMicros: '120000000',
        startMonth: '2026-11',
        expenseCurrentMonth: true,
        entryDate: '2026-11-20',
      }),
    );
    expect(typeof saveCall.clientRequestId).toBe('string');
    expect(saveCall.clientRequestId.length).toBeGreaterThanOrEqual(8);
  });

  it('Recurring bills: handles FOLLOWING_MONTH payroll settlement, Pause error cleanup, and fully locked month UX', async () => {
    const user = userEvent.setup();
    const payrollSnap: FinanceV2Snapshot = {
      ...sampleSnapshot,
      today: '2026-12-03',
      profile: {
        ...sampleSnapshot.profile,
        lockedThroughDate: '2026-12-01',
      },
      recurringExpenses: [
        {
          id: 'rec-sal-arjun',
          title: 'Arjun — Base Salary',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SALARY',
          currency: 'USD',
          amountMicros: '1500000000',
          dayOfMonth: 5,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: 'mem-arjun',
          employeeName: 'Arjun',
          notes: '',
          startMonth: '2026-10',
          endMonth: null,
          status: 'ACTIVE',
          payTiming: 'FOLLOWING_MONTH',
          currentMonthTargetMonth: '2026-11',
          currentMonthStatus: 'NOT_POSTED',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
        {
          id: 'rec-sal-new',
          title: 'New Hire — Base Salary',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SALARY',
          currency: 'USD',
          amountMicros: '1000000000',
          dayOfMonth: 5,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: 'mem-new',
          employeeName: 'New Hire',
          notes: '',
          startMonth: '2026-12',
          endMonth: null,
          status: 'ACTIVE',
          payTiming: 'FOLLOWING_MONTH',
          currentMonthTargetMonth: '2026-11',
          currentMonthStatus: 'NOT_POSTED',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
      ],
    };

    mockUseQuery.mockReturnValue({
      data: { deliveryFinanceV2: payrollSnap },
      loading: false,
      error: undefined,
      refetch: jest.fn(async () => undefined),
    });
    mockMutate.mockResolvedValue({
      data: { changeDeliveryFinanceV2: { ok: true, month: '2026-11' } },
    });

    renderWorkspace('/delivery?view=finance&financeView=expenses');
    await user.click(
      screen.getByRole('button', { name: /Recurring Bills & Salaries/i }),
    );

    // New FOLLOWING_MONTH salary starting 2026-12 settles first in 2027-01 and hides Expense This Month
    const newHireRow = screen
      .getByText('New Hire — Base Salary')
      .closest('tr')!;
    expect(within(newHireRow).getByText('Starts 2027-01')).toBeInTheDocument();
    expect(
      within(newHireRow).queryByRole('button', { name: /Expense This Month/i }),
    ).not.toBeInTheDocument();

    // Existing FOLLOWING_MONTH salary targets service month 2026-11 (settled in 2026-12)
    const arjunRow = screen.getByText('Arjun — Base Salary').closest('tr')!;
    await user.click(
      within(arjunRow).getByRole('button', { name: /^Expense This Month$/i }),
    );
    expect(
      screen.getByText(/for 2026-11 \(settled in 2026-12\)/i),
    ).toBeInTheDocument();

    // Trigger a locked-date validation error, then click Pause -> error clears instead of teleporting
    const dateInput = screen.getByLabelText(/Recurring expense date/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-12-01');
    await user.click(
      screen.getByRole('button', { name: /Confirm & Expense/i }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/locked period/i);
    await user.click(
      within(arjunRow).getByRole('button', { name: /^Pause$/i }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Re-open and submit valid date -> sends target service month 2026-11
    mockMutate.mockClear();
    await user.click(
      within(arjunRow).getByRole('button', { name: /^Expense This Month$/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /Confirm & Expense/i }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'expenseRecurringForMonth',
          id: 'rec-sal-arjun',
          month: '2026-11',
          entryDate: '2026-12-03',
        },
      },
    });
  });

  it('Recurring bills: shows Locked pill and disables immediate expensing when current month is fully locked', async () => {
    const user = userEvent.setup();
    const lockedSnap: FinanceV2Snapshot = {
      ...sampleSnapshot,
      today: '2026-12-03',
      profile: {
        ...sampleSnapshot.profile,
        lockedThroughDate: '2026-12-03',
      },
      recurringExpenses: [
        {
          id: 'rec-sal-arjun',
          title: 'Arjun — Base Salary',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SALARY',
          currency: 'USD',
          amountMicros: '1500000000',
          dayOfMonth: 5,
          fundingAccountId: 'cash-usd',
          fundingAccountName: 'Company Cash (USD)',
          employeeMemberId: 'mem-arjun',
          employeeName: 'Arjun',
          notes: '',
          startMonth: '2026-10',
          endMonth: null,
          status: 'ACTIVE',
          payTiming: 'FOLLOWING_MONTH',
          currentMonthTargetMonth: '2026-11',
          currentMonthStatus: 'NOT_POSTED',
          currentMonthEntryDate: null,
          currentMonthJournalId: null,
        },
      ],
    };
    mockUseQuery.mockReturnValue({
      data: { deliveryFinanceV2: lockedSnap },
      loading: false,
      error: undefined,
      refetch: jest.fn(async () => undefined),
    });

    renderWorkspace('/delivery?view=finance&financeView=expenses');
    await user.click(
      screen.getByRole('button', { name: /Recurring Bills & Salaries/i }),
    );
    const lockedArjunRow = screen
      .getByText('Arjun — Base Salary')
      .closest('tr')!;
    expect(within(lockedArjunRow).getByText('Locked')).toBeInTheDocument();
    expect(
      within(lockedArjunRow).queryByRole('button', {
        name: /Expense This Month/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /\+ New Recurring Bill/i }),
    );
    expect(
      screen.getByRole('checkbox', {
        name: /Also expense for current month \(2026-12\) right now/i,
      }),
    ).toBeDisabled();
  });
});
