export const FINANCE_V2_BASE_CURRENCY = 'AED' as const;

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

export const FINANCE_V2_DEFAULT_FX_RATES: Record<FinanceV2Currency, string> = {
  AED: '1',
  USD: '3.6725',
  INR: '0.0435',
  QAR: '1.008',
  EUR: '3.98',
  GBP: '4.66',
  SGD: '2.73',
  AUD: '2.40',
  CAD: '2.65',
};

export type FinanceV2AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'DIRECT_EXPENSE'
  | 'INDIRECT_EXPENSE';

export type FinanceV2AccountSubType =
  | 'CASH_CURRENCY'
  | 'FIXED_ASSET'
  | 'PERSON_LIABILITY'
  | 'OPENING_EQUITY'
  | 'SERVICE_REVENUE'
  | 'DIRECT_COST'
  | 'INDIRECT_COST'
  | 'FX_GAIN_LOSS';

export type FinanceV2JournalEntryType =
  | 'OPENING_BALANCE'
  | 'INVOICE_PAYMENT'
  | 'EXPENSE'
  | 'ASSET_PURCHASE'
  | 'RECURRING_EXPENSE'
  | 'PAYROLL_BASE'
  | 'PAYROLL_OVERTIME'
  | 'PAYROLL_LEAVE_REDUCTION'
  | 'PAYROLL_BONUS'
  | 'AI_COST'
  | 'LOAN_IN'
  | 'LOAN_REPAYMENT'
  | 'FX_CONVERSION'
  | 'REVERSAL';

export type FinanceV2ExpenseCategory =
  | 'DIRECT_SUBSCRIPTION'
  | 'DIRECT_SALARY'
  | 'DIRECT_CONTRACTOR'
  | 'DIRECT_AI'
  | 'DIRECT_OTHER'
  | 'PAYROLL_OVERTIME'
  | 'PAYROLL_LEAVE_REDUCTION'
  | 'PAYROLL_BONUS'
  | 'INDIRECT_MEALS'
  | 'INDIRECT_COURSES'
  | 'INDIRECT_OFFICE'
  | 'INDIRECT_ADMIN'
  | 'INDIRECT_OTHER'
  | 'ASSET_EQUIPMENT'
  | 'SERVICE_REVENUE'
  | 'LOAN'
  | 'OPENING'
  | 'FX';

export type FinanceV2JournalStatus = 'POSTED' | 'VOID';

export type FinanceV2ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';

export type FinanceV2PayrollEntryKind =
  | 'LEAVE'
  | 'SWAP_COMP_OFF'
  | 'OVERTIME'
  | 'BONUS';

export type FinanceV2QuoteStatus = 'DRAFT' | 'SENT' | 'CONVERTED' | 'VOID';

export type FinanceV2InvoiceStatus =
  | 'READY'
  | 'SENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'VOID';

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

export type FinanceV2JournalLineDraft = {
  accountId: string;
  debitAedMicros: bigint;
  creditAedMicros: bigint;
  currency: FinanceV2Currency;
  originalSignedMicros: bigint;
};

export type FinanceV2AccountSummary = {
  id: string;
  code: string;
  name: string;
  accountType: FinanceV2AccountType;
  subType: FinanceV2AccountSubType;
  currency: FinanceV2Currency | null;
  personName: string | null;
  personEmail: string | null;
  active: boolean;
};

export type FinanceV2LedgerLineRecord = {
  journalId: string;
  entryDate: string;
  entryType: FinanceV2JournalEntryType;
  category: string;
  accountId: string;
  accountType: FinanceV2AccountType;
  accountSubType: FinanceV2AccountSubType;
  accountName: string;
  accountCurrency: FinanceV2Currency | null;
  personName: string | null;
  debitAedMicros: string;
  creditAedMicros: string;
  currency: FinanceV2Currency;
  originalSignedMicros: string;
  status: FinanceV2JournalStatus;
};

export type FinanceV2ProfitAndLoss = {
  fromDate: string;
  toDate: string;
  revenueAedMicros: string;
  directExpenseAedMicros: string;
  grossProfitAedMicros: string;
  grossMarginPercent: string | null;
  indirectExpenseAedMicros: string;
  fxGainLossAedMicros: string;
  netProfitAedMicros: string;
  netMarginPercent: string | null;
  directBreakdown: { category: string; aedMicros: string }[];
  indirectBreakdown: { category: string; aedMicros: string }[];
};

export type FinanceV2CashCurrencyBalance = {
  accountId: string;
  currency: FinanceV2Currency;
  originalMicros: string;
  aedMicros: string;
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
  cashByCurrency: FinanceV2CashCurrencyBalance[];
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

export type FinanceV2PayrollMonthSummary = {
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
