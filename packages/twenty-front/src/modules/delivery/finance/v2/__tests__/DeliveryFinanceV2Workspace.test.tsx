import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
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

    // H11 & H15: Edit Payroll Profile allows setting 0 paid leaves
    await user.click(screen.getByRole('link', { name: /^Payroll$/i }));
    await user.click(screen.getByRole('button', { name: /^Edit$/i }));
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
});
