import {
  addDaysIso,
  buildExchangeRateNote,
  calculateDraftDocumentTotals,
  computeDefaultReversalDate,
  convertAedMicrosToDisplay,
  convertCurrencyMicros,
  createFinanceV2RequestId,
  detectPeriodPreset,
  formatPercentDelta,
  formatRatioPercent,
  getMonthRange,
  getQuarterRange,
  isFinanceV2Currency,
  isValidDiscountPercent,
  isValidHttpUrl,
  isValidIsoDate,
  isValidPositiveFxRate,
  isValidPositiveQuantity,
  isValidYearMonth,
  roundMicrosToCents,
  sanitizeExternalUrl,
  shiftYearMonth,
} from '@/delivery/finance/v2/finance-v2-currency';

const RATES = {
  AED: '1',
  USD: '3.6725',
  INR: '0.0435',
  QAR: '1.008',
};

describe('finance-v2-currency helpers', () => {
  it('validates currency codes, year-months, and calendar ISO dates', () => {
    expect(isFinanceV2Currency('AED')).toBe(true);
    expect(isFinanceV2Currency('INR')).toBe(true);
    expect(isFinanceV2Currency('EUR')).toBe(true);
    expect(isFinanceV2Currency('ZZZ')).toBe(false);
    expect(isFinanceV2Currency(null)).toBe(false);

    expect(isValidYearMonth('2026-11')).toBe(true);
    expect(isValidYearMonth('2026-00')).toBe(false);
    expect(isValidYearMonth('2026-13')).toBe(false);
    expect(isValidYearMonth('2026-1')).toBe(false);

    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-11-31')).toBe(false);
    expect(isValidIsoDate('2026-11-24')).toBe(true);
  });

  it('converts micros accurately across AED, USD, INR, and QAR with identity short-circuit and half-up rounding', () => {
    // Identity preserves exact sub-cent micros
    expect(convertCurrencyMicros('123456789', 'INR', 'INR', RATES)).toBe(
      '123456789',
    );
    // $100 USD -> 367.25 AED
    expect(convertCurrencyMicros('100000000', 'USD', 'AED', RATES)).toBe(
      '367250000',
    );
    // 367.25 AED -> $100 USD
    expect(convertAedMicrosToDisplay('367250000', 'USD', RATES)).toBe(
      '100000000',
    );
    // Negative amounts preserve sign symmetrically
    expect(convertCurrencyMicros('-100000000', 'USD', 'AED', RATES)).toBe(
      '-367250000',
    );
    // Half-up cent rounding
    expect(roundMicrosToCents('12345000')).toBe('12350000');
    expect(roundMicrosToCents('12344999')).toBe('12340000');
    expect(roundMicrosToCents('-12345000')).toBe('-12350000');
  });

  it('formats percent deltas and ratios including zero-rounded flat deltas', () => {
    expect(formatPercentDelta('1500', '1000')).toEqual({
      label: '+50%',
      direction: 'up',
    });
    expect(formatPercentDelta('500', '1000')).toEqual({
      label: '-50%',
      direction: 'down',
    });
    // Tiny positive diff that rounds to 0% must be flat without '+'
    expect(formatPercentDelta('10000001', '10000000')).toEqual({
      label: '0%',
      direction: 'flat',
    });
    expect(formatPercentDelta('1000', '0')).toBeNull();

    expect(formatRatioPercent('250', '1000')).toBe('25');
    expect(formatRatioPercent('-250', '1000')).toBe('-25');
    expect(formatRatioPercent('250', '0')).toBeNull();
  });

  it('computes month/quarter/day ranges and detects period presets cleanly', () => {
    expect(getMonthRange('2024-02')).toEqual({
      fromDate: '2024-02-01',
      toDate: '2024-02-29',
    });
    expect(getMonthRange('2026-02')).toEqual({
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(addDaysIso('2026-11-24', -29)).toBe('2026-10-26');
    expect(getQuarterRange('2026-11-24')).toEqual({
      fromDate: '2026-10-01',
      toDate: '2026-11-24',
    });

    expect(detectPeriodPreset('2026-11-01', '2026-11-24', '2026-11-24')).toBe(
      'thisMonth',
    );
    expect(detectPeriodPreset('2026-10-01', '2026-10-31', '2026-11-24')).toBe(
      'lastMonth',
    );
    expect(detectPeriodPreset('2026-10-26', '2026-11-24', '2026-11-24')).toBe(
      'last30Days',
    );
    expect(detectPeriodPreset('2026-10-01', '2026-11-24', '2026-11-24')).toBe(
      'thisQuarter',
    );
    expect(detectPeriodPreset('2026-01-01', '2026-11-24', '2026-11-24')).toBe(
      'ytd',
    );
    expect(detectPeriodPreset('2000-01-01', '2026-11-24', '2026-11-24')).toBe(
      'allTime',
    );
    expect(detectPeriodPreset('2026-05-01', '2026-05-15', '2026-11-24')).toBe(
      'custom',
    );
  });

  it('builds concise FX rate notes excluding AED', () => {
    expect(buildExchangeRateNote(['INR', 'USD'], 'USD', RATES)).toBe(
      '1 INR = 0.0435 AED · 1 USD = 3.6725 AED',
    );
    expect(buildExchangeRateNote(['AED'], 'AED', RATES)).toBe('');
  });

  it('M7: validates positive FX rates, sanitizes external URLs, and generates unique clientRequestIds', () => {
    expect(isValidPositiveFxRate('3.6725')).toBe(true);
    expect(isValidPositiveFxRate('0.000001')).toBe(true);
    expect(isValidPositiveFxRate('0')).toBe(false);
    expect(isValidPositiveFxRate('-1.5')).toBe(false);
    expect(isValidPositiveFxRate('3.1234567')).toBe(false);
    expect(isValidPositiveFxRate('abc')).toBe(false);

    expect(sanitizeExternalUrl('https://receipts.example.com/inv/1')).toBe(
      'https://receipts.example.com/inv/1',
    );
    expect(sanitizeExternalUrl('http://localhost:3000/r')).toBe(
      'http://localhost:3000/r',
    );
    const jsScheme = ['javascript', 'alert(1)'].join(':');
    const jsVoid = ['javascript', 'void(0)'].join(':');
    expect(sanitizeExternalUrl(jsScheme)).toBeNull();
    expect(
      sanitizeExternalUrl('data:text/html,<script>alert(1)</script>'),
    ).toBeNull();
    expect(sanitizeExternalUrl('ftp://files.example.com/a.pdf')).toBeNull();
    expect(sanitizeExternalUrl('')).toBeNull();

    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl('https://example.com/receipt.pdf')).toBe(true);
    expect(isValidHttpUrl(jsVoid)).toBe(false);

    const id1 = createFinanceV2RequestId();
    const id2 = createFinanceV2RequestId();
    expect(id1.length).toBeGreaterThanOrEqual(8);
    expect(id1.length).toBeLessThanOrEqual(120);
    expect(id1).not.toBe(id2);
  });

  it('M8: validates positive quantities, 0..100 discounts, and calculates exact BigInt draft document totals', () => {
    expect(isValidPositiveQuantity('1')).toBe(true);
    expect(isValidPositiveQuantity('2.5')).toBe(true);
    expect(isValidPositiveQuantity('0')).toBe(false);
    expect(isValidPositiveQuantity('-1')).toBe(false);
    expect(isValidPositiveQuantity('abc')).toBe(false);

    expect(isValidDiscountPercent('0')).toBe(true);
    expect(isValidDiscountPercent('12.5')).toBe(true);
    expect(isValidDiscountPercent('100')).toBe(true);
    expect(isValidDiscountPercent('100.01')).toBe(false);
    expect(isValidDiscountPercent('-5')).toBe(false);

    const calc = calculateDraftDocumentTotals([
      {
        label: 'Retainer',
        quantity: '2',
        unitPriceMicros: '1500000000',
        discountPercent: '10',
      },
      {
        label: 'Setup fee',
        quantity: '1.5',
        unitPriceMicros: '333330000',
        discountPercent: '0',
      },
      {
        label: '',
        quantity: '1',
        unitPriceMicros: '999000000',
        discountPercent: '0',
      },
    ]);
    // Line 1: 2 * 1500 = 3000, 10% off = 300 -> net 2700
    // Line 2: 1.5 * 333.33 = 499.995
    // Line 3: unlabeled -> ignored in subtotal/total
    expect(calc.subtotalMicros).toBe('3499995000');
    expect(calc.discountTotalMicros).toBe('300000000');
    expect(calc.totalMicros).toBe('3199995000');
    expect(calc.lineTotalsMicros[0]).toBe('2700000000');
    expect(calc.lineTotalsMicros[1]).toBe('499995000');
    expect(calc.lineTotalsMicros[2]).toBeNull();

    // computeDefaultReversalDate defaults past lockedThroughDate when today <= lockedThroughDate
    expect(
      computeDefaultReversalDate('2026-11-24', '2026-11-10', '2026-11-15'),
    ).toBe('2026-11-24');
    expect(
      computeDefaultReversalDate('2026-11-24', '2026-11-10', '2026-11-24'),
    ).toBe('2026-11-25');
    expect(
      computeDefaultReversalDate('2026-11-24', '2026-11-28', '2026-11-15'),
    ).toBe('2026-11-28');
  });
});
