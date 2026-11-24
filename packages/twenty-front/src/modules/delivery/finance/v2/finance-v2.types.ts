export const FINANCE_V2_CURRENCIES = [
  'AED',
  'USD',
  'INR',
  'QAR',
  'EUR',
  'GBP',
  'SGD',
  'AUD',
  'CAD',
] as const;

export type FinanceV2Currency = (typeof FINANCE_V2_CURRENCIES)[number];

export type FinanceV2RateCardItem = {
  id: string;
  name: string;
  description: string;
  defaultRateMicros: string;
  currency: FinanceV2Currency;
};

export type FinanceV2DocumentLineItem = {
  id: string;
  label: string;
  description: string;
  quantity: string;
  unitPriceMicros: string;
  discountPercent: string;
  lineTotalMicros: string;
};

export type FinanceV2Account = {
  id: string;
  code: string;
  name: string;
  accountType:
    | 'ASSET'
    | 'LIABILITY'
    | 'EQUITY'
    | 'REVENUE'
    | 'DIRECT_EXPENSE'
    | 'INDIRECT_EXPENSE';
  subType:
    | 'CASH_CURRENCY'
    | 'FIXED_ASSET'
    | 'PERSON_LIABILITY'
    | 'OPENING_EQUITY'
    | 'SERVICE_REVENUE'
    | 'DIRECT_COST'
    | 'INDIRECT_COST'
    | 'FX_GAIN_LOSS';
  currency: FinanceV2Currency | null;
  personName: string | null;
  personEmail: string | null;
  active: boolean;
};

export type FinanceV2ProfitAndLoss = {
  fromDate: string;
  toDate: string;
  revenueAedMicros: string;
  directExpenseAedMicros: string;
  grossProfitAedMicros: string;
  grossMarginPercent: string | null;
  indirectExpenseAedMicros: string;
  totalExpenseAedMicros?: string;
  fxGainLossAedMicros: string;
  netProfitAedMicros: string;
  netMarginPercent: string | null;
  directBreakdown: { category: string; aedMicros: string }[];
  indirectBreakdown: { category: string; aedMicros: string }[];
};

export type FinanceV2MonthlyTrendPoint = {
  month: string;
  revenueAedMicros: string;
  directExpenseAedMicros: string;
  indirectExpenseAedMicros: string;
  totalExpenseAedMicros: string;
  netProfitAedMicros: string;
  netMarginPercent: string | null;
};

export type FinanceV2InvoiceAgingBucket = {
  key: 'NOT_DUE' | 'DAYS_1_15' | 'DAYS_16_30' | 'DAYS_31_PLUS';
  count: number;
  aedMicros: string;
};

export type FinanceV2ProjectProfitabilityRow = {
  projectId: string | null;
  projectName: string;
  revenueAedMicros: string;
  directExpenseAedMicros: string;
  grossProfitAedMicros: string;
  grossMarginPercent: string | null;
};

export type FinanceV2Analytics = {
  previousPeriod: {
    fromDate: string;
    toDate: string;
    revenueAedMicros: string;
    totalExpenseAedMicros: string;
    grossProfitAedMicros: string;
    netProfitAedMicros: string;
  };
  monthlyTrend: FinanceV2MonthlyTrendPoint[];
  burnAndRunway: {
    periodNetCashFlowAedMicros: string;
    avgMonthlyExpense3mAedMicros: string;
    avgMonthlyNetBurn3mAedMicros: string;
    estimatedRunwayMonths: string | null;
  };
  invoiceAging: FinanceV2InvoiceAgingBucket[];
  upcomingCommitments30d: {
    windowStart: string;
    windowEnd: string;
    recurringExpensesAedMicros: string;
    recurringExpenseCount: number;
    payrollAedMicros: string | null;
    payrollCount: number | null;
    expectedReceivablesAedMicros: string;
    expectedReceivableCount: number;
  };
  payrollMonthRevenueAedMicros: string | null;
  projectProfitability: FinanceV2ProjectProfitabilityRow[];
};

export type FinanceV2PersonLiabilityBalance = {
  accountId: string;
  personName: string;
  personEmail: string | null;
  totalBorrowedAedMicros: string;
  totalRepaidAedMicros: string;
  balanceOwedAedMicros: string;
  byCurrency: {
    currency: FinanceV2Currency;
    borrowedMicros: string;
    repaidMicros: string;
    balanceOwedMicros: string;
  }[];
};

export type FinanceV2BalanceSheet = {
  asOfDate: string;
  cashByCurrency: {
    accountId: string;
    currency: FinanceV2Currency;
    originalMicros: string;
    aedMicros: string;
  }[];
  totalCashAedMicros: string;
  fixedAssetsAedMicros: string;
  totalAssetsAedMicros: string;
  liabilitiesByPerson: FinanceV2PersonLiabilityBalance[];
  totalLiabilitiesAedMicros: string;
  openingEquityAedMicros: string;
  accumulatedNetProfitAedMicros: string;
  totalEquityAedMicros: string;
  isBalanced: boolean;
  imbalanceAedMicros: string;
};

export type FinanceV2Journal = {
  id: string;
  entryDate: string;
  entryType: string;
  category: string;
  title: string;
  notes: string;
  currency: FinanceV2Currency;
  amountMicros: string;
  fxRateToAed: string;
  aedAmountMicros: string;
  fundingAccountId: string | null;
  fundingAccountName: string | null;
  targetAccountId?: string | null;
  targetAccountName: string | null;
  projectId: string | null;
  receiptUrl: string | null;
  status: 'POSTED' | 'VOID';
  reversalOfJournalId?: string | null;
  isReversed?: boolean;
  voidReason: string | null;
};

export type FinanceV2RecurringExpense = {
  id: string;
  title: string;
  expenseType: 'DIRECT_EXPENSE' | 'INDIRECT_EXPENSE';
  category: string;
  currency: FinanceV2Currency;
  amountMicros: string;
  dayOfMonth: number;
  fundingAccountId: string;
  fundingAccountName: string;
  employeeMemberId: string | null;
  employeeName: string | null;
  notes: string;
  startMonth: string;
  endMonth: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
};

export type FinanceV2PayrollProfile = {
  id: string;
  employeeMemberId: string | null;
  employeeName: string;
  roleLabel: string;
  currency: FinanceV2Currency;
  baseSalaryMicros: string;
  workingDaysPerMonth: number;
  paidLeavesPerMonth: number;
  payDayOfMonth: number;
  payTiming?: 'SAME_MONTH' | 'FOLLOWING_MONTH';
  startMonth?: string | null;
  fundingAccountId: string;
  fundingAccountName: string;
  recurringExpenseId: string | null;
  active: boolean;
};

export type FinanceV2PayrollSummary = {
  profileId: string;
  employeeName: string;
  month: string;
  currency: FinanceV2Currency;
  baseSalaryMicros: string;
  workingDaysPerMonth: number;
  paidLeavesPerMonth: number;
  perDayMicros: string;
  leavesTakenDays: string;
  swapsDays: string;
  netLeaveDays: string;
  paidLeavesUsedDays: string;
  paidLeavesRemainingDays: string;
  unpaidLeaveDays: string;
  unpaidLeaveDeductionMicros: string;
  overtimeDays: string;
  overtimePayMicros: string;
  bonusTotalMicros: string;
  netPayableMicros: string;
};

export type FinanceV2PayrollEntry = {
  id: string;
  profileId: string;
  month: string;
  entryKind: 'LEAVE' | 'SWAP_COMP_OFF' | 'OVERTIME' | 'BONUS';
  days: string | null;
  bonusAmountMicros: string | null;
  eventDate: string;
  swappedWorkDate: string | null;
  note: string;
};

export type FinanceV2Quote = {
  id: string;
  quoteNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  projectId: string | null;
  currency: FinanceV2Currency;
  issueDate: string;
  validUntil: string | null;
  lineItems: FinanceV2DocumentLineItem[];
  subtotalMicros: string;
  discountTotalMicros: string;
  totalMicros: string;
  notes: string;
  terms: string;
  status: 'DRAFT' | 'SENT' | 'CONVERTED' | 'VOID';
  sentAt: string | null;
  convertedInvoiceId: string | null;
  convertedScheduleId: string | null;
  voidReason: string | null;
};

export type FinanceV2InvoiceSchedule = {
  id: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  projectId: string | null;
  currency: FinanceV2Currency;
  lineItems: FinanceV2DocumentLineItem[];
  totalMicros: string;
  billingDayOfMonth: number;
  dueDayOfMonth: number;
  notes: string;
  startMonth: string;
  endMonth: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
};

export type FinanceV2Invoice = {
  id: string;
  invoiceNumber: string;
  scheduleId: string | null;
  scheduleMonth: string | null;
  sourceQuoteId: string | null;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  projectId: string | null;
  currency: FinanceV2Currency;
  issueDate: string;
  dueDate: string;
  lineItems: FinanceV2DocumentLineItem[];
  subtotalMicros: string;
  discountTotalMicros: string;
  totalMicros: string;
  paidMicros: string;
  outstandingMicros: string;
  overdueDays: number;
  status: 'READY' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  pdfStoragePath: string | null;
  sentAt: string | null;
  sentVia: 'EMAIL' | 'MANUAL' | null;
  notes: string;
  voidReason: string | null;
  payments?: {
    journalId: string;
    paymentDate: string;
    amountMicros: string;
    aedAmountMicros: string;
    currency: FinanceV2Currency;
    status: string;
    reversed?: boolean;
  }[];
};

export type FinanceV2Snapshot = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  canManage: boolean;
  canViewPayroll: boolean;
  today: string;
  fromDate: string;
  toDate: string;
  asOfDate: string;
  payrollMonth: string;
  profile: {
    id: string;
    companyName: string;
    legalAddress: string;
    email: string;
    phone: string;
    website: string;
    logoDataUrl: string | null;
    hasLogo?: boolean;
    logoUpdatedAt?: string | null;
    timezone?: string;
    lockedThroughDate?: string | null;
    bankDetails: string;
    defaultQuoteTerms: string;
    defaultInvoiceNotes: string;
    baseCurrency: FinanceV2Currency;
    rateCard: FinanceV2RateCardItem[];
    exchangeRates: Record<string, string>;
  };
  accounts: FinanceV2Account[];
  profitAndLoss: FinanceV2ProfitAndLoss;
  balanceSheet: FinanceV2BalanceSheet;
  analytics?: FinanceV2Analytics;
  pendingReceivables: {
    count: number;
    totalAedMicros: string;
    overdueCount: number;
    overdueAedMicros: string;
  };
  journals: FinanceV2Journal[];
  recurringExpenses: FinanceV2RecurringExpense[];
  payrollProfiles: FinanceV2PayrollProfile[];
  payrollSummaries: FinanceV2PayrollSummary[];
  payrollEntries: FinanceV2PayrollEntry[];
  quotes: FinanceV2Quote[];
  invoiceSchedules: FinanceV2InvoiceSchedule[];
  invoices: FinanceV2Invoice[];
  aiSpendCandidates: {
    id: string;
    sourceKind: string;
    clientName: string | null;
    taskName: string | null;
    amountMicros: string;
    currency: FinanceV2Currency;
    occurredAt: string;
  }[];
  projects: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

export type FinanceV2CommandRunner = (
  input: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;
