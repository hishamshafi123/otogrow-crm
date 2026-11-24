import { BadRequestException } from '@nestjs/common';
import {
  assertBalancedJournalLines,
  assertWithinMaxMicros,
  buildAutomationCandidateMonths,
  calculateBalanceSheet,
  calculateBurnAndRunway,
  calculateDocumentLineTotals,
  calculateMonthlyPayroll,
  calculateMonthlyTrend,
  calculateOverdueDays,
  calculatePreviousPeriodRange,
  calculateProfitAndLoss,
  calculateProjectProfitability,
  computeWeightedCarryingAed,
  computeWeightedInflowAed,
  convertToAedMicros,
  isValidIanaTimezone,
  previousYearMonth,
  resolvePayrollSettlementMonth,
  resolveRecurringInvoiceDates,
  resolveScheduledDateForMonth,
  todayIsoDateInTimezone,
  validateLogoDataUrl,
} from 'src/modules/delivery/finance-v2/finance-v2.policy';
import { type FinanceV2LedgerLineRecord } from 'src/modules/delivery/finance-v2/finance-v2.types';

describe('Finance V2 Policy & Accounting Invariants', () => {
  describe('G1-DOUBLE-ENTRY & FX Conversion', () => {
    it('converts multi-currency micros to AED with half-up integer rounding', () => {
      expect(convertToAedMicros(BigInt('1000000000'), 'AED', '9.99')).toBe(
        BigInt('1000000000'),
      );
      // $1,000 USD * 3.6725 = 3,672.50 AED
      expect(convertToAedMicros(BigInt('1000000000'), 'USD', '3.6725')).toBe(
        BigInt('3672500000'),
      );
      // 15,000 INR * 0.0435 = 652.50 AED
      expect(convertToAedMicros(BigInt('15000000000'), 'INR', '0.0435')).toBe(
        BigInt('652500000'),
      );
    });

    it('rejects unbalanced, single-line, zero, or dual-sided journal entries', () => {
      expect(() => assertBalancedJournalLines([])).toThrow(BadRequestException);
      expect(() =>
        assertBalancedJournalLines([
          {
            accountId: 'a',
            debitAedMicros: BigInt('100'),
            creditAedMicros: BigInt('0'),
            currency: 'AED',
            originalSignedMicros: BigInt('100'),
          },
          {
            accountId: 'b',
            debitAedMicros: BigInt('0'),
            creditAedMicros: BigInt('99'),
            currency: 'AED',
            originalSignedMicros: -BigInt('99'),
          },
        ]),
      ).toThrow(/Unbalanced journal/);
      expect(() =>
        assertBalancedJournalLines([
          {
            accountId: 'a',
            debitAedMicros: BigInt('100'),
            creditAedMicros: BigInt('100'),
            currency: 'AED',
            originalSignedMicros: BigInt('0'),
          },
          {
            accountId: 'b',
            debitAedMicros: BigInt('0'),
            creditAedMicros: BigInt('100'),
            currency: 'AED',
            originalSignedMicros: -BigInt('100'),
          },
        ]),
      ).toThrow(BadRequestException);
    });
  });

  describe('G2-BALANCE-SHEET & P&L Identity', () => {
    it('keeps Assets === Liabilities + Equity across multi-currency opening balances, paid invoices, direct/indirect expenses, assets, person loans, repayments, payroll adjustments, and FX conversion', () => {
      const lines: FinanceV2LedgerLineRecord[] = [];
      const addBalanced = (
        journalId: string,
        entryDate: string,
        entryType: FinanceV2LedgerLineRecord['entryType'],
        category: string,
        entries: Omit<
          FinanceV2LedgerLineRecord,
          'journalId' | 'entryDate' | 'entryType' | 'category' | 'status'
        >[],
      ) => {
        for (const entry of entries) {
          lines.push({
            ...entry,
            journalId,
            entryDate,
            entryType,
            category,
            status: 'POSTED',
          });
        }
      };

      // 1. Opening profit cash in USD ($10,000 @ 3.6725 = 36,725 AED)
      addBalanced('j1', '2026-11-01', 'OPENING_BALANCE', 'OPENING', [
        {
          accountId: 'cash-usd',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (USD)',
          accountCurrency: 'USD',
          personName: null,
          debitAedMicros: '36725000000',
          creditAedMicros: '0',
          currency: 'USD',
          originalSignedMicros: '10000000000',
        },
        {
          accountId: 'eq-open',
          accountType: 'EQUITY',
          accountSubType: 'OPENING_EQUITY',
          accountName: 'Opening Accumulated Profits',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '36725000000',
          currency: 'USD',
          originalSignedMicros: '-10000000000',
        },
      ]);

      // 2. Paid client invoice ($5,000 @ 3.6725 = 18,362.50 AED)
      addBalanced('j2', '2026-11-05', 'INVOICE_PAYMENT', 'SERVICE_REVENUE', [
        {
          accountId: 'cash-usd',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (USD)',
          accountCurrency: 'USD',
          personName: null,
          debitAedMicros: '18362500000',
          creditAedMicros: '0',
          currency: 'USD',
          originalSignedMicros: '5000000000',
        },
        {
          accountId: 'rev-svc',
          accountType: 'REVENUE',
          accountSubType: 'SERVICE_REVENUE',
          accountName: 'Client Service Revenue',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '18362500000',
          currency: 'USD',
          originalSignedMicros: '-5000000000',
        },
      ]);

      // 3. Direct subscription expense paid personally by Hisham (1,000 AED)
      addBalanced(
        'j3',
        '2026-11-06',
        'RECURRING_EXPENSE',
        'DIRECT_SUBSCRIPTION',
        [
          {
            accountId: 'exp-direct',
            accountType: 'DIRECT_EXPENSE',
            accountSubType: 'DIRECT_COST',
            accountName: 'Direct Expenses',
            accountCurrency: null,
            personName: null,
            debitAedMicros: '1000000000',
            creditAedMicros: '0',
            currency: 'AED',
            originalSignedMicros: '1000000000',
          },
          {
            accountId: 'liab-hisham',
            accountType: 'LIABILITY',
            accountSubType: 'PERSON_LIABILITY',
            accountName: 'Owed to Hisham',
            accountCurrency: 'AED',
            personName: 'Hisham',
            debitAedMicros: '0',
            creditAedMicros: '1000000000',
            currency: 'AED',
            originalSignedMicros: '-1000000000',
          },
        ],
      );

      // 4. Indirect expense (courses: 500 AED paid from Hisham)
      addBalanced('j4', '2026-11-08', 'EXPENSE', 'INDIRECT_COURSES', [
        {
          accountId: 'exp-indirect',
          accountType: 'INDIRECT_EXPENSE',
          accountSubType: 'INDIRECT_COST',
          accountName: 'Indirect Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '500000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '500000000',
        },
        {
          accountId: 'liab-hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountName: 'Owed to Hisham',
          accountCurrency: 'AED',
          personName: 'Hisham',
          debitAedMicros: '0',
          creditAedMicros: '500000000',
          currency: 'AED',
          originalSignedMicros: '-500000000',
        },
      ]);

      // 5. Laptop bought as Asset (4,000 AED from USD converted / AED cash -> use Hisham loan)
      addBalanced('j5', '2026-11-10', 'ASSET_PURCHASE', 'ASSET_EQUIPMENT', [
        {
          accountId: 'asset-equip',
          accountType: 'ASSET',
          accountSubType: 'FIXED_ASSET',
          accountName: 'Equipment & Assets',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '4000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '4000000000',
        },
        {
          accountId: 'liab-hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountName: 'Owed to Hisham',
          accountCurrency: 'AED',
          personName: 'Hisham',
          debitAedMicros: '0',
          creditAedMicros: '4000000000',
          currency: 'AED',
          originalSignedMicros: '-4000000000',
        },
      ]);

      // 6. Currency conversion: $2,000 USD (7,345 AED) -> 7,320 AED (25 AED FX loss)
      addBalanced('j6', '2026-11-12', 'FX_CONVERSION', 'FX', [
        {
          accountId: 'cash-aed',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (AED)',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '7320000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '7320000000',
        },
        {
          accountId: 'fx-gl',
          accountType: 'REVENUE',
          accountSubType: 'FX_GAIN_LOSS',
          accountName: 'Currency Exchange Gain / Loss',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '25000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '25000000',
        },
        {
          accountId: 'cash-usd',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (USD)',
          accountCurrency: 'USD',
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '7345000000',
          currency: 'USD',
          originalSignedMicros: '-2000000000',
        },
      ]);

      // 7. Repay Hisham 2,000 AED from Company Cash (AED)
      addBalanced('j7', '2026-11-15', 'LOAN_REPAYMENT', 'LOAN', [
        {
          accountId: 'liab-hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountName: 'Owed to Hisham',
          accountCurrency: 'AED',
          personName: 'Hisham',
          debitAedMicros: '2000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '2000000000',
        },
        {
          accountId: 'cash-aed',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (AED)',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '2000000000',
          currency: 'AED',
          originalSignedMicros: '-2000000000',
        },
      ]);

      // 8. Payroll base salary (1,500 AED) + unpaid leave reduction (-100 AED)
      addBalanced('j8', '2026-11-28', 'PAYROLL_BASE', 'DIRECT_SALARY', [
        {
          accountId: 'exp-direct',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '1500000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '1500000000',
        },
        {
          accountId: 'cash-aed',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (AED)',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '1500000000',
          currency: 'AED',
          originalSignedMicros: '-1500000000',
        },
      ]);
      addBalanced(
        'j9',
        '2026-11-28',
        'PAYROLL_LEAVE_REDUCTION',
        'PAYROLL_LEAVE_REDUCTION',
        [
          {
            accountId: 'cash-aed',
            accountType: 'ASSET',
            accountSubType: 'CASH_CURRENCY',
            accountName: 'Company Cash (AED)',
            accountCurrency: 'AED',
            personName: null,
            debitAedMicros: '100000000',
            creditAedMicros: '0',
            currency: 'AED',
            originalSignedMicros: '100000000',
          },
          {
            accountId: 'exp-direct',
            accountType: 'DIRECT_EXPENSE',
            accountSubType: 'DIRECT_COST',
            accountName: 'Direct Expenses',
            accountCurrency: null,
            personName: null,
            debitAedMicros: '0',
            creditAedMicros: '100000000',
            currency: 'AED',
            originalSignedMicros: '-100000000',
          },
        ],
      );

      const pnl = calculateProfitAndLoss(lines, '2026-11-01', '2026-11-30');
      expect(pnl.revenueAedMicros).toBe('18362500000');
      // Direct = 1,000 + 1,500 - 100 = 2,400 AED (Laptop 4,000 AED is NOT an expense!)
      expect(pnl.directExpenseAedMicros).toBe('2400000000');
      expect(pnl.grossProfitAedMicros).toBe('15962500000');
      expect(pnl.indirectExpenseAedMicros).toBe('500000000');
      expect(pnl.fxGainLossAedMicros).toBe('-25000000');
      // Net Profit = 18,362.50 - 2,400 - 500 - 25 = 15,437.50 AED
      expect(pnl.netProfitAedMicros).toBe('15437500000');

      const bs = calculateBalanceSheet(lines, '2026-11-30');
      expect(bs.isBalanced).toBe(true);
      expect(bs.imbalanceAedMicros).toBe('0');
      expect(bs.fixedAssetsAedMicros).toBe('4000000000');
      // Owed to Hisham = 1,000 + 500 + 4,000 - 2,000 = 3,500 AED
      expect(bs.totalLiabilitiesAedMicros).toBe('3500000000');
      expect(bs.liabilitiesByPerson[0]?.personName).toBe('Hisham');
      expect(bs.liabilitiesByPerson[0]?.balanceOwedAedMicros).toBe(
        '3500000000',
      );
      expect(bs.openingEquityAedMicros).toBe('36725000000');
      expect(bs.accumulatedNetProfitAedMicros).toBe('15437500000');
      // Total Assets = Cash (47,742.50 + 3,920 = 51,662.50) + Equipment (4,000) = 55,662.50
      // Total L + E = 3,500 + 36,725 + 15,437.50 = 55,662.50
      expect(bs.totalAssetsAedMicros).toBe('55662500000');
      expect(
        (
          BigInt(bs.totalLiabilitiesAedMicros) + BigInt(bs.totalEquityAedMicros)
        ).toString(),
      ).toBe(bs.totalAssetsAedMicros);
    });
  });

  describe('G4-PAYROLL-POLICY (÷26, 2 internal paid leaves, Sunday swap, overtime, bonus)', () => {
    const base = BigInt('15000000000'); // ₹15,000 INR

    it('handles Sunday swap for Friday off without consuming paid leaves or adding overtime', () => {
      const summary = calculateMonthlyPayroll({
        profileId: 'p1',
        employeeName: 'Arjun',
        month: '2026-11',
        currency: 'INR',
        baseSalaryMicros: base,
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        entries: [
          { entryKind: 'LEAVE', days: '1', bonusAmountMicros: null },
          { entryKind: 'SWAP_COMP_OFF', days: '1', bonusAmountMicros: null },
        ],
      });
      expect(summary.perDayMicros).toBe('576923077');
      expect(summary.netLeaveDays).toBe('0');
      expect(summary.paidLeavesUsedDays).toBe('0');
      expect(summary.paidLeavesRemainingDays).toBe('2');
      expect(summary.unpaidLeaveDays).toBe('0');
      expect(summary.unpaidLeaveDeductionMicros).toBe('0');
      expect(summary.overtimePayMicros).toBe('0');
      expect(summary.netPayableMicros).toBe('15000000000');
    });

    it('covers up to 2 leaves without deduction and deducts on the 3rd leave', () => {
      const twoLeaves = calculateMonthlyPayroll({
        profileId: 'p1',
        employeeName: 'Arjun',
        month: '2026-11',
        currency: 'INR',
        baseSalaryMicros: base,
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        entries: [{ entryKind: 'LEAVE', days: '2', bonusAmountMicros: null }],
      });
      expect(twoLeaves.unpaidLeaveDays).toBe('0');
      expect(twoLeaves.unpaidLeaveDeductionMicros).toBe('0');

      const threeLeaves = calculateMonthlyPayroll({
        profileId: 'p1',
        employeeName: 'Arjun',
        month: '2026-11',
        currency: 'INR',
        baseSalaryMicros: base,
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        entries: [{ entryKind: 'LEAVE', days: '3', bonusAmountMicros: null }],
      });
      expect(threeLeaves.paidLeavesUsedDays).toBe('2');
      expect(threeLeaves.unpaidLeaveDays).toBe('1');
      expect(threeLeaves.unpaidLeaveDeductionMicros).toBe('576923077');
      expect(threeLeaves.netPayableMicros).toBe('14423076923');
    });

    it('pays explicit overtime even when employee took a paid sick leave, and adds bonuses', () => {
      const summary = calculateMonthlyPayroll({
        profileId: 'p1',
        employeeName: 'Arjun',
        month: '2026-11',
        currency: 'INR',
        baseSalaryMicros: base,
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        entries: [
          { entryKind: 'LEAVE', days: '1', bonusAmountMicros: null },
          { entryKind: 'OVERTIME', days: '1', bonusAmountMicros: null },
          {
            entryKind: 'BONUS',
            days: null,
            bonusAmountMicros: '2000000000',
          },
        ],
      });
      expect(summary.paidLeavesUsedDays).toBe('1');
      expect(summary.unpaidLeaveDays).toBe('0');
      expect(summary.overtimeDays).toBe('1');
      expect(summary.overtimePayMicros).toBe('576923077');
      expect(summary.bonusTotalMicros).toBe('2000000000');
      expect(summary.netPayableMicros).toBe('17576923077');
    });

    it('caps unpaid leave deduction at baseSalaryMicros so net pay never goes negative (C5)', () => {
      const summary = calculateMonthlyPayroll({
        profileId: 'p1',
        employeeName: 'Arjun',
        month: '2026-11',
        currency: 'INR',
        baseSalaryMicros: base,
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        entries: [{ entryKind: 'LEAVE', days: '30', bonusAmountMicros: null }],
      });
      expect(summary.unpaidLeaveDays).toBe('28');
      expect(summary.unpaidLeaveDeductionMicros).toBe(base.toString());
      expect(summary.netPayableMicros).toBe('0');
    });
  });

  describe('H9 Weighted Carrying AED & Month Navigation', () => {
    it('extinguishes exact AED carrying cost on full outflow and scales proportionally on partial outflow', () => {
      // Partial: $500 of $1,000 carried at 3,672.50 AED => 1,836.25 AED
      expect(
        computeWeightedCarryingAed(
          BigInt('500000000'),
          BigInt('1000000000'),
          BigInt('3672500000'),
          BigInt('1850000000'),
        ),
      ).toBe(BigInt('1836250000'));
      // Exact full closeout returns exact remaining carrying AED (zero drift)
      expect(
        computeWeightedCarryingAed(
          BigInt('1000000000'),
          BigInt('1000000000'),
          BigInt('3672500001'),
          BigInt('3700000000'),
        ),
      ).toBe(BigInt('3672500001'));
      // Zero/negative existing balance falls back cleanly
      expect(
        computeWeightedCarryingAed(
          BigInt('100000000'),
          BigInt('0'),
          BigInt('0'),
          BigInt('367250000'),
        ),
      ).toBe(BigInt('367250000'));
    });

    it('computes previousYearMonth across year boundary', () => {
      expect(previousYearMonth('2026-01')).toBe('2025-12');
      expect(previousYearMonth('2026-11')).toBe('2026-10');
    });
  });

  describe('G3-CASH-BASIS Overdue Days, Scheduling & Line Totals', () => {
    it('calculates exact overdue days after due date and zeroes when paid or void', () => {
      expect(
        calculateOverdueDays(
          '2026-11-17',
          '2026-11-24',
          'SENT',
          BigInt('1000'),
          BigInt('0'),
        ),
      ).toBe(7);
      expect(
        calculateOverdueDays(
          '2026-11-17',
          '2026-11-24',
          'READY',
          BigInt('1000'),
          BigInt('0'),
        ),
      ).toBe(0);
      expect(
        calculateOverdueDays(
          '2026-11-17',
          '2026-11-24',
          'PAID',
          BigInt('1000'),
          BigInt('1000'),
        ),
      ).toBe(0);
      expect(
        calculateOverdueDays(
          '2026-11-17',
          '2026-11-24',
          'VOID',
          BigInt('1000'),
          BigInt('0'),
        ),
      ).toBe(0);
    });

    it('clamps short months and rolls cross-month invoice due dates cleanly', () => {
      expect(resolveScheduledDateForMonth('2026-02', 31)).toBe('2026-02-28');
      expect(resolveRecurringInvoiceDates('2026-11', 1, 17)).toEqual({
        issueDate: '2026-11-01',
        dueDate: '2026-11-17',
      });
      expect(resolveRecurringInvoiceDates('2026-12', 25, 10)).toEqual({
        issueDate: '2026-12-25',
        dueDate: '2027-01-10',
      });
    });

    it('computes line item subtotals and discounts accurately', () => {
      const totals = calculateDocumentLineTotals([
        {
          id: '1',
          label: 'Performance Marketing Retainer',
          quantity: '1',
          unitPriceMicros: '3000000000',
          discountPercent: '10',
        },
        {
          id: '2',
          label: 'Video Production Pack',
          quantity: '2',
          unitPriceMicros: '500000000',
          discountPercent: '0',
        },
      ]);
      expect(totals.subtotalMicros).toBe('4000000000');
      expect(totals.discountTotalMicros).toBe('300000000');
      expect(totals.totalMicros).toBe('3700000000');
    });
  });

  describe('M6 Executive Analytics Helpers', () => {
    it('computes previous period range for full calendar months and custom spans', () => {
      expect(calculatePreviousPeriodRange('2026-11-01', '2026-11-30')).toEqual({
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
      });
      expect(calculatePreviousPeriodRange('2026-01-01', '2026-01-31')).toEqual({
        fromDate: '2025-12-01',
        toDate: '2025-12-31',
      });
      // 10-day custom span (Nov 11..20 -> Nov 1..10)
      expect(calculatePreviousPeriodRange('2026-11-11', '2026-11-20')).toEqual({
        fromDate: '2026-11-01',
        toDate: '2026-11-10',
      });
    });

    it('computes totalExpenseAedMicros, 6-month trend, burn/runway, and project profitability with payroll isolation', () => {
      const lines: FinanceV2LedgerLineRecord[] = [
        // Oct 2026: Revenue 1,000 AED, Direct 2,000 AED (burning 1,000 AED)
        {
          journalId: 'j-oct-rev',
          entryDate: '2026-10-15',
          entryType: 'INVOICE_PAYMENT',
          category: 'SERVICE_REVENUE',
          accountId: 'rev',
          accountType: 'REVENUE',
          accountSubType: 'SERVICE_REVENUE',
          accountName: 'Service Revenue',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '1000000000',
          currency: 'AED',
          originalSignedMicros: '-1000000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        {
          journalId: 'j-oct-exp',
          entryDate: '2026-10-20',
          entryType: 'EXPENSE',
          category: 'DIRECT_CONTRACTOR',
          accountId: 'exp',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '2000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '2000000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        // Nov 2026: Revenue 3,000 AED on proj-1, Direct expense 500 AED on proj-1, Payroll 1,500 AED unassigned, Indirect 4,000 AED
        {
          journalId: 'j-nov-rev',
          entryDate: '2026-11-10',
          entryType: 'INVOICE_PAYMENT',
          category: 'SERVICE_REVENUE',
          accountId: 'rev',
          accountType: 'REVENUE',
          accountSubType: 'SERVICE_REVENUE',
          accountName: 'Service Revenue',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '3000000000',
          currency: 'AED',
          originalSignedMicros: '-3000000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        {
          journalId: 'j-nov-rev',
          entryDate: '2026-11-10',
          entryType: 'INVOICE_PAYMENT',
          category: 'SERVICE_REVENUE',
          accountId: 'cash-aed',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (AED)',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '3000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '3000000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        {
          journalId: 'j-nov-dir',
          entryDate: '2026-11-12',
          entryType: 'EXPENSE',
          category: 'DIRECT_AI',
          accountId: 'exp',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '500000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '500000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        {
          journalId: 'j-nov-pay',
          entryDate: '2026-11-28',
          entryType: 'PAYROLL_BASE',
          category: 'DIRECT_SALARY',
          accountId: 'exp',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '1500000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '1500000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-nov-ind',
          entryDate: '2026-11-15',
          entryType: 'EXPENSE',
          category: 'INDIRECT_OFFICE',
          accountId: 'ind',
          accountType: 'INDIRECT_EXPENSE',
          accountSubType: 'INDIRECT_COST',
          accountName: 'Indirect Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '4000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '4000000000',
          status: 'POSTED',
          projectId: null,
        },
      ];

      const novPnl = calculateProfitAndLoss(lines, '2026-11-01', '2026-11-30');
      expect(novPnl.totalExpenseAedMicros).toBe('6000000000');

      const trend = calculateMonthlyTrend(lines, '2026-11', 6);
      expect(trend).toHaveLength(6);
      expect(trend[0]?.month).toBe('2026-06');
      expect(trend[4]?.month).toBe('2026-10');
      expect(trend[5]?.totalExpenseAedMicros).toBe('6000000000');

      // Trailing 3m (Sep=0, Oct=-1000, Nov=-3000) => net profit = -4000 => avg burn = 1333.333333 AED/mo
      // With 4000 AED cash => runway = 3 months
      const burn = calculateBurnAndRunway(
        lines,
        '2026-11-01',
        '2026-11-30',
        '2026-11-30',
        BigInt('4000000000'),
      );
      expect(burn.periodNetCashFlowAedMicros).toBe('3000000000');
      expect(burn.avgMonthlyNetBurn3mAedMicros).toBe('1333333333');
      expect(burn.estimatedRunwayMonths).toBe('3');

      const projectNames = new Map([['proj-1', 'Alpha Campaign']]);
      const adminProjects = calculateProjectProfitability(
        lines,
        '2026-11-01',
        '2026-11-30',
        projectNames,
        true,
      );
      expect(adminProjects).toHaveLength(2);
      expect(adminProjects[0]).toEqual({
        projectId: 'proj-1',
        projectName: 'Alpha Campaign',
        revenueAedMicros: '3000000000',
        directExpenseAedMicros: '500000000',
        grossProfitAedMicros: '2500000000',
        grossMarginPercent: '83.33',
      });
      expect(adminProjects[1]?.directExpenseAedMicros).toBe('1500000000');

      // Non-admin omits unassigned rows completely so subtracting from P&L cannot leak payroll
      const nonAdminProjects = calculateProjectProfitability(
        lines,
        '2026-11-01',
        '2026-11-30',
        projectNames,
        false,
      );
      expect(nonAdminProjects).toHaveLength(1);
      expect(nonAdminProjects[0]?.projectId).toBe('proj-1');
    });

    it('M6 rework: excludes FX_GAIN_LOSS from project profitability, redacts payroll in P&L breakdown, ignores OPENING_BALANCE in cash flow, and handles leap-year previous months', () => {
      expect(calculatePreviousPeriodRange('2024-03-01', '2024-03-31')).toEqual({
        fromDate: '2024-02-01',
        toDate: '2024-02-29',
      });

      const lines: FinanceV2LedgerLineRecord[] = [
        // Opening balance cash injection should NOT count as operating cash flow
        {
          journalId: 'j-open',
          entryDate: '2026-11-01',
          entryType: 'OPENING_BALANCE',
          category: 'OPENING_CASH',
          accountId: 'cash-aed',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountName: 'Company Cash (AED)',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '50000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '50000000000',
          status: 'POSTED',
          projectId: null,
        },
        // FX loss posted on a project must NOT appear as project revenue or direct expense
        {
          journalId: 'j-fx',
          entryDate: '2026-11-10',
          entryType: 'INVOICE_PAYMENT',
          category: 'FX_GAIN_LOSS',
          accountId: 'fx',
          accountType: 'REVENUE',
          accountSubType: 'FX_GAIN_LOSS',
          accountName: 'FX Gain / Loss',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '200000000',
          currency: 'AED',
          originalSignedMicros: '-200000000',
          status: 'POSTED',
          projectId: 'proj-1',
        },
        // Payroll direct salary + regular direct subscription
        {
          journalId: 'j-sal',
          entryDate: '2026-11-12',
          entryType: 'PAYROLL_BASE',
          category: 'DIRECT_SALARY',
          accountId: 'exp',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '1200000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '1200000000',
          status: 'POSTED',
          projectId: null,
        },
        // Future expense after mid-month asOfDate (Nov 20 > Nov 15) must not enter trailing 3m burn
        {
          journalId: 'j-future',
          entryDate: '2026-11-20',
          entryType: 'EXPENSE',
          category: 'DIRECT_SUBSCRIPTION',
          accountId: 'exp',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountName: 'Direct Expenses',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '9000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '9000000000',
          status: 'POSTED',
          projectId: null,
        },
      ];

      // Redacted P&L preserves total direct expense but hides DIRECT_SALARY inside DIRECT_OTHER
      const redactedPnl = calculateProfitAndLoss(
        lines,
        '2026-11-01',
        '2026-11-15',
        { redactPayrollBreakdown: true },
      );
      expect(redactedPnl.directExpenseAedMicros).toBe('1200000000');
      expect(redactedPnl.directBreakdown).toEqual([
        { category: 'DIRECT_OTHER', aedMicros: '1200000000' },
      ]);

      // Project profitability skips FX_GAIN_LOSS completely
      const projects = calculateProjectProfitability(
        lines,
        '2026-11-01',
        '2026-11-15',
        new Map([['proj-1', 'Alpha']]),
        true,
      );
      expect(projects.find((p) => p.projectId === 'proj-1')).toBeUndefined();

      // Burn & runway excludes OPENING_BALANCE from periodNetCashFlow and respects mid-month asOfDate
      const burn = calculateBurnAndRunway(
        lines,
        '2026-11-01',
        '2026-11-15',
        '2026-11-15',
        BigInt('4000000000'),
      );
      expect(burn.periodNetCashFlowAedMicros).toBe('0');
      // Only 1,200 AED expense + 200 AED FX gain occurred on/before Nov 15 -> 3-mo avg expense = 400 AED/mo, net burn = 333.333333 AED/mo -> 4,000 / 333.333333 = 12 mo
      expect(burn.avgMonthlyExpense3mAedMicros).toBe('400000000');
      expect(burn.estimatedRunwayMonths).toBe('12');
    });
  });

  describe('M7 Security, Integrity & Edge-Case Hardening', () => {
    it('splits overdraft outflows between existing positive carrying AED and spot AED for the overdrawn portion', () => {
      // Holding $100 @ 360 AED carrying; spending $150 at spot 3.70 -> $150 spot = 555 AED
      // $100 clears 360 AED carrying, $50 overdraft at 3.70 = 185 AED -> total carrying outflow = 545 AED
      const carrying = computeWeightedCarryingAed(
        BigInt('150000000'),
        BigInt('100000000'),
        BigInt('360000000'),
        BigInt('555000000'),
      );
      expect(carrying).toBe(BigInt('545000000'));
    });

    it('extinguishes negative carrying AED proportionally and fully on inflows into overdrawn cash accounts', () => {
      // Overdrawn -$100 carrying -370 AED; inflow $100 at spot 3.60 -> extinguishes exact 370 AED (0 remaining)
      expect(
        computeWeightedInflowAed(
          BigInt('100000000'),
          BigInt('-100000000'),
          BigInt('-370000000'),
          BigInt('360000000'),
        ),
      ).toBe(BigInt('370000000'));

      // Partial inflow $40 into -$100 carrying -370 AED -> extinguishes 40% = 148 AED
      expect(
        computeWeightedInflowAed(
          BigInt('40000000'),
          BigInt('-100000000'),
          BigInt('-370000000'),
          BigInt('144000000'),
        ),
      ).toBe(BigInt('148000000'));

      // Crossing inflow $150 into -$100 carrying -370 AED at spot 3.60 ($150 spot = 540 AED):
      // $100 extinguishes 370 AED + $50 remainder at 3.60 = 180 AED -> 550 AED total
      expect(
        computeWeightedInflowAed(
          BigInt('150000000'),
          BigInt('-100000000'),
          BigInt('-370000000'),
          BigInt('540000000'),
        ),
      ).toBe(BigInt('550000000'));
    });

    it('validates PNG and JPEG binary magic headers, chunk/marker integrity, and dimension bounds in validateLogoDataUrl', () => {
      // Build a complete minimal PNG (Signature + IHDR + IDAT + IEND)
      const buildMinimalPng = (width: number, height: number): Buffer => {
        const sig = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        const ihdr = Buffer.alloc(25);
        ihdr.writeUInt32BE(13, 0);
        ihdr.write('IHDR', 4, 'ascii');
        ihdr.writeUInt32BE(width, 8);
        ihdr.writeUInt32BE(height, 12);
        const idat = Buffer.alloc(16);
        idat.writeUInt32BE(4, 0);
        idat.write('IDAT', 4, 'ascii');
        const iend = Buffer.alloc(12);
        iend.writeUInt32BE(0, 0);
        iend.write('IEND', 4, 'ascii');
        return Buffer.concat([sig, ihdr, idat, iend]);
      };

      const validPngUrl = `data:image/png;base64,${buildMinimalPng(200, 80).toString('base64')}`;
      expect(validateLogoDataUrl(validPngUrl)).toBe(validPngUrl);

      // Truncated 24-byte header-only PNG (missing IDAT/IEND) rejected
      const truncatedPng = buildMinimalPng(200, 80).subarray(0, 24);
      expect(() =>
        validateLogoDataUrl(
          `data:image/png;base64,${truncatedPng.toString('base64')}`,
        ),
      ).toThrow(BadRequestException);

      // Oversized 5000x5000 PNG rejected
      expect(() =>
        validateLogoDataUrl(
          `data:image/png;base64,${buildMinimalPng(5000, 5000).toString('base64')}`,
        ),
      ).toThrow(BadRequestException);

      // Spoofed SVG/text claiming to be PNG rejected
      const spoofed = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect(() =>
        validateLogoDataUrl(
          `data:image/png;base64,${spoofed.toString('base64')}`,
        ),
      ).toThrow(BadRequestException);

      // Valid minimal JPEG with SOF0 (120x60) + SOS + EOI
      const validJpg = Buffer.alloc(36);
      validJpg[0] = 0xff;
      validJpg[1] = 0xd8; // SOI
      validJpg[2] = 0xff;
      validJpg[3] = 0xc0; // SOF0
      validJpg.writeUInt16BE(11, 4); // segment length (11 bytes starting at offset 4 -> ends at 15)
      validJpg[6] = 8; // precision
      validJpg.writeUInt16BE(60, 7); // height
      validJpg.writeUInt16BE(120, 9); // width
      validJpg[15] = 0xff;
      validJpg[16] = 0xda; // SOS
      validJpg[34] = 0xff;
      validJpg[35] = 0xd9; // EOI
      const validJpgUrl = `data:image/jpeg;base64,${validJpg.toString('base64')}`;
      expect(validateLogoDataUrl(validJpgUrl)).toBe(validJpgUrl);

      // Truncated JPEG without EOI rejected
      expect(() =>
        validateLogoDataUrl(
          `data:image/jpeg;base64,${validJpg.subarray(0, 34).toString('base64')}`,
        ),
      ).toThrow(BadRequestException);
    });

    it('redacts INDIRECT_EXPENSE payroll categories for non-admins', () => {
      const pnl = calculateProfitAndLoss(
        [
          {
            journalId: 'j-ind-sal',
            entryDate: '2026-11-10',
            entryType: 'EXPENSE',
            category: 'payroll_stipend',
            accountId: 'exp-ind',
            accountName: 'Indirect Expense',
            accountType: 'INDIRECT_EXPENSE',
            accountSubType: 'INDIRECT_COST',
            accountCurrency: null,
            personName: null,
            debitAedMicros: '500000000',
            creditAedMicros: '0',
            currency: 'AED',
            originalSignedMicros: '500000000',
            status: 'POSTED',
            projectId: null,
          },
        ],
        '2026-11-01',
        '2026-11-30',
        { redactPayrollBreakdown: true },
      );
      expect(pnl.indirectBreakdown).toEqual([
        { category: 'INDIRECT_OTHER', aedMicros: '500000000' },
      ]);
    });

    it('rejects BIGINT overflow in convertToAedMicros, document line totals, and payroll calculations', () => {
      const nearMax = BigInt('8000000000000000000'); // 8e18 (< 9e18)
      expect(() =>
        assertWithinMaxMicros(BigInt('9000000000000000001')),
      ).toThrow(BadRequestException);
      expect(() => convertToAedMicros(nearMax, 'USD', '3.6725')).toThrow(
        BadRequestException,
      );
      expect(() =>
        calculateDocumentLineTotals([
          {
            id: 'line-1',
            label: 'Huge Contract',
            quantity: '10',
            unitPriceMicros: '5000000000000000000',
          },
        ]),
      ).toThrow(BadRequestException);
      expect(() =>
        calculateMonthlyPayroll({
          profileId: 'p1',
          employeeName: 'Arjun',
          month: '2026-11',
          currency: 'AED',
          baseSalaryMicros: BigInt('8000000000000000000'),
          workingDaysPerMonth: 22,
          paidLeavesPerMonth: 1,
          entries: [
            {
              entryKind: 'BONUS',
              days: null,
              bonusAmountMicros: '5000000000000000000',
            },
          ],
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('M9: Timezone, Pay Timing, Automation Catch-Up & Person-Funded Leave Reduction', () => {
    it('validates IANA timezones and formats today ISO date in workspace timezone', () => {
      expect(isValidIanaTimezone('Asia/Dubai')).toBe(true);
      expect(isValidIanaTimezone('Asia/Kolkata')).toBe(true);
      expect(isValidIanaTimezone('UTC')).toBe(true);
      expect(isValidIanaTimezone('Not/A_Real_Zone')).toBe(false);
      expect(isValidIanaTimezone('')).toBe(false);

      // 2026-11-30 21:00 UTC is 2026-12-01 01:00 in Asia/Dubai (+04:00), still 2026-11-30 in UTC
      const lateUtc = new Date('2026-11-30T21:00:00Z');
      expect(todayIsoDateInTimezone(lateUtc, 'Asia/Dubai')).toBe('2026-12-01');
      expect(todayIsoDateInTimezone(lateUtc, 'UTC')).toBe('2026-11-30');
    });

    it('resolves payroll settlement month from explicit payTiming or legacy day<=10 fallback', () => {
      expect(resolvePayrollSettlementMonth('2026-11', 5, 'SAME_MONTH')).toBe(
        '2026-11',
      );
      expect(
        resolvePayrollSettlementMonth('2026-11', 28, 'FOLLOWING_MONTH'),
      ).toBe('2026-12');
      expect(resolvePayrollSettlementMonth('2026-11', 5)).toBe('2026-12');
      expect(resolvePayrollSettlementMonth('2026-11', 28)).toBe('2026-11');
    });

    it('builds bounded automation catch-up months across multi-month outages up to 12 months', () => {
      expect(buildAutomationCandidateMonths('2026-08', '2026-11', 12)).toEqual([
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
      ]);
      // Clamped to 12 months back even if earliestStartMonth is years ago
      const clamped = buildAutomationCandidateMonths('2022-01', '2026-11', 12);
      expect(clamped[0]).toBe('2025-12');
      expect(clamped[clamped.length - 1]).toBe('2026-11');
      expect(clamped).toHaveLength(12);
    });

    it('reduces totalBorrowed (not inflating totalRepaid) on PERSON_LIABILITY-funded PAYROLL_LEAVE_REDUCTION', () => {
      const lines: FinanceV2LedgerLineRecord[] = [
        // Base salary 10,000 AED paid by Hisham (PERSON_LIABILITY)
        {
          journalId: 'j-sal',
          entryDate: '2026-11-28',
          entryType: 'RECURRING_EXPENSE',
          category: 'DIRECT_SALARY',
          accountId: 'exp-dir',
          accountName: 'Direct Expense',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '10000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '10000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-sal',
          entryDate: '2026-11-28',
          entryType: 'RECURRING_EXPENSE',
          category: 'DIRECT_SALARY',
          accountId: 'person-1',
          accountName: 'Liability: Hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountCurrency: null,
          personName: 'Hisham',
          debitAedMicros: '0',
          creditAedMicros: '10000000000',
          currency: 'AED',
          originalSignedMicros: '-10000000000',
          status: 'POSTED',
          projectId: null,
        },
        // Unpaid leave reduction 1,000 AED reduces Hisham's funding liability
        {
          journalId: 'j-leave',
          entryDate: '2026-11-28',
          entryType: 'PAYROLL_LEAVE_REDUCTION',
          category: 'PAYROLL_LEAVE_REDUCTION',
          accountId: 'person-1',
          accountName: 'Liability: Hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountCurrency: null,
          personName: 'Hisham',
          debitAedMicros: '1000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '1000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-leave',
          entryDate: '2026-11-28',
          entryType: 'PAYROLL_LEAVE_REDUCTION',
          category: 'PAYROLL_LEAVE_REDUCTION',
          accountId: 'exp-dir',
          accountName: 'Direct Expense',
          accountType: 'DIRECT_EXPENSE',
          accountSubType: 'DIRECT_COST',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '1000000000',
          currency: 'AED',
          originalSignedMicros: '-1000000000',
          status: 'POSTED',
          projectId: null,
        },
      ];

      const bs = calculateBalanceSheet(lines, '2026-11-30');
      expect(bs.isBalanced).toBe(true);
      const hisham = bs.liabilitiesByPerson.find(
        (p) => p.accountId === 'person-1',
      )!;
      expect(hisham.totalBorrowedAedMicros).toBe('9000000000');
      expect(hisham.totalRepaidAedMicros).toBe('0');
      expect(hisham.balanceOwedAedMicros).toBe('9000000000');
      expect(hisham.byCurrency).toEqual([
        {
          currency: 'AED',
          borrowedMicros: '9000000000',
          repaidMicros: '0',
          balanceOwedMicros: '9000000000',
        },
      ]);
    });

    it('keeps PERSON_LIABILITY borrowed/repaid and burn/runway accurate when reversing loans, repayments, and opening balances', () => {
      const lines: FinanceV2LedgerLineRecord[] = [
        // 1. Opening balance 20,000 AED cash, then reversed -> operating cash flow must stay 0!
        {
          journalId: 'j-open',
          entryDate: '2026-10-01',
          entryType: 'OPENING_BALANCE',
          category: 'OPENING_ACCUMULATED_PROFIT',
          accountId: 'cash-aed',
          accountName: 'Company Cash (AED)',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '20000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '20000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-open',
          entryDate: '2026-10-01',
          entryType: 'OPENING_BALANCE',
          category: 'OPENING_ACCUMULATED_PROFIT',
          accountId: 'eq-open',
          accountName: 'Opening Equity',
          accountType: 'EQUITY',
          accountSubType: 'OPENING_EQUITY',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '20000000000',
          currency: 'AED',
          originalSignedMicros: '-20000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-open-rev',
          entryDate: '2026-11-05',
          entryType: 'REVERSAL',
          reversalOfEntryType: 'OPENING_BALANCE',
          category: 'OPENING_ACCUMULATED_PROFIT',
          accountId: 'cash-aed',
          accountName: 'Company Cash (AED)',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '20000000000',
          currency: 'AED',
          originalSignedMicros: '-20000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-open-rev',
          entryDate: '2026-11-05',
          entryType: 'REVERSAL',
          reversalOfEntryType: 'OPENING_BALANCE',
          category: 'OPENING_ACCUMULATED_PROFIT',
          accountId: 'eq-open',
          accountName: 'Opening Equity',
          accountType: 'EQUITY',
          accountSubType: 'OPENING_EQUITY',
          accountCurrency: null,
          personName: null,
          debitAedMicros: '20000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '20000000000',
          status: 'POSTED',
          projectId: null,
        },
        // 2. Loan 10,000 AED from Hisham, then reversed -> borrowed=0, repaid=0, owed=0
        {
          journalId: 'j-loan',
          entryDate: '2026-10-15',
          entryType: 'LOAN_IN',
          category: 'LOAN_IN',
          accountId: 'cash-aed',
          accountName: 'Company Cash (AED)',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '10000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '10000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-loan',
          entryDate: '2026-10-15',
          entryType: 'LOAN_IN',
          category: 'LOAN_IN',
          accountId: 'person-1',
          accountName: 'Liability: Hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountCurrency: null,
          personName: 'Hisham',
          debitAedMicros: '0',
          creditAedMicros: '10000000000',
          currency: 'AED',
          originalSignedMicros: '-10000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-loan-rev',
          entryDate: '2026-11-10',
          entryType: 'REVERSAL',
          reversalOfEntryType: 'LOAN_IN',
          category: 'LOAN_IN',
          accountId: 'cash-aed',
          accountName: 'Company Cash (AED)',
          accountType: 'ASSET',
          accountSubType: 'CASH_CURRENCY',
          accountCurrency: 'AED',
          personName: null,
          debitAedMicros: '0',
          creditAedMicros: '10000000000',
          currency: 'AED',
          originalSignedMicros: '-10000000000',
          status: 'POSTED',
          projectId: null,
        },
        {
          journalId: 'j-loan-rev',
          entryDate: '2026-11-10',
          entryType: 'REVERSAL',
          reversalOfEntryType: 'LOAN_IN',
          category: 'LOAN_IN',
          accountId: 'person-1',
          accountName: 'Liability: Hisham',
          accountType: 'LIABILITY',
          accountSubType: 'PERSON_LIABILITY',
          accountCurrency: null,
          personName: 'Hisham',
          debitAedMicros: '10000000000',
          creditAedMicros: '0',
          currency: 'AED',
          originalSignedMicros: '10000000000',
          status: 'POSTED',
          projectId: null,
        },
      ];

      const bs = calculateBalanceSheet(lines, '2026-11-30');
      expect(bs.isBalanced).toBe(true);
      const hisham = bs.liabilitiesByPerson.find(
        (p) => p.accountId === 'person-1',
      )!;
      expect(hisham.totalBorrowedAedMicros).toBe('0');
      expect(hisham.totalRepaidAedMicros).toBe('0');
      expect(hisham.balanceOwedAedMicros).toBe('0');

      const burn = calculateBurnAndRunway(
        lines,
        '2026-11-01',
        '2026-11-30',
        '2026-11-30',
        BigInt(bs.totalCashAedMicros),
      );
      // Only the -10,000 loan reversal affects November operating cash flow; the -20,000 opening balance reversal is excluded
      expect(burn.periodNetCashFlowAedMicros).toBe('-10000000000');
    });
  });
});
