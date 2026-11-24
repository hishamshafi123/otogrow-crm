import { BadRequestException } from '@nestjs/common';
import {
  assertBalancedJournalLines,
  calculateBalanceSheet,
  calculateDocumentLineTotals,
  calculateMonthlyPayroll,
  calculateOverdueDays,
  calculateProfitAndLoss,
  computeWeightedCarryingAed,
  convertToAedMicros,
  previousYearMonth,
  resolveRecurringInvoiceDates,
  resolveScheduledDateForMonth,
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
          '2026-11-17',
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
});
