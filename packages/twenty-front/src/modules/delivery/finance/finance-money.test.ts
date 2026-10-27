import {
  financeAmountMicrosToDecimal,
  financeAllocationRemainder,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';

describe('isFinanceAmountMicrosWithinLimit', () => {
  it.each(['0', '1', '9007199254740993', '9223372036854775807'])(
    'accepts exact canonical micros %s within per-entry storage',
    (amount) => {
      expect(isFinanceAmountMicrosWithinLimit(amount)).toBe(true);
    },
  );

  it.each([
    '',
    '00',
    '01',
    '-1',
    '+1',
    ' 1 ',
    '1.0',
    '1e6',
    '9223372036854775808',
    '123456789012345678901234567890',
  ])('rejects unsupported per-entry micros %s', (amount) => {
    expect(isFinanceAmountMicrosWithinLimit(amount)).toBe(false);
  });

  it('keeps aggregate display and parsing independent of the per-entry storage bound', () => {
    const aggregate = '123456789012345678901234567890';
    expect(isFinanceAmountMicrosWithinLimit(aggregate)).toBe(false);
    expect(parseFinanceAmountMicros('123456789012345678901234.567890')).toBe(
      aggregate,
    );
    expect(formatFinanceAmountMicros(aggregate, 'USD', 'en-US')).toBe(
      '$123,456,789,012,345,678,901,234.56789',
    );
  });
});

describe('parseFinanceAmountMicros', () => {
  it.each([
    ['0', '0'],
    ['0.000000', '0'],
    ['0.000001', '1'],
    ['1', '1000000'],
    ['1.', '1000000'],
    ['.5', '500000'],
    ['001.2300', '1230000'],
    [' 12.345678 ', '12345678'],
    ['9007199254740993.123456', '9007199254740993123456'],
    ['123456789012345678901234.56789', '123456789012345678901234567890'],
  ])('parses %s into exact integer micros', (amount, expected) => {
    expect(parseFinanceAmountMicros(amount)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    '.',
    '-1',
    '-0',
    '+1',
    '1e6',
    '1E-6',
    '1,000.00',
    '1,25',
    '1 000',
    '1.0000000',
    '0.0000001',
    '1.2.3',
    '$1.00',
    'NaN',
    'Infinity',
    '0x10',
    '١٢.٣',
  ])('rejects ambiguous or unsupported decimal input %s', (amount) => {
    expect(parseFinanceAmountMicros(amount)).toBeNull();
  });

  it('rejects unexpected non-string data at runtime', () => {
    expect(parseFinanceAmountMicros(1 as unknown as string)).toBeNull();
    expect(parseFinanceAmountMicros(null as unknown as string)).toBeNull();
  });
});

describe('financeAmountMicrosToDecimal', () => {
  it.each([
    ['0', '0'],
    ['1', '0.000001'],
    ['1000000', '1'],
    ['1230000', '1.23'],
    ['1234567', '1.234567'],
    ['-1', '-0.000001'],
    ['-1230000', '-1.23'],
    ['9007199254740993123456', '9007199254740993.123456'],
  ])('returns editable exact decimal text for %s', (amount, expected) => {
    expect(financeAmountMicrosToDecimal(amount)).toBe(expected);
  });

  it.each(['', '1.2', '1e6', ' 1 ', '+1', '--1'])(
    'leaves invalid stored input %s empty for correction',
    (amount) => {
      expect(financeAmountMicrosToDecimal(amount)).toBe('');
    },
  );
});

describe('formatFinanceAmountMicros', () => {
  it.each([
    ['0', '$0.00'],
    ['1', '$0.000001'],
    ['9999', '$0.009999'],
    ['10000', '$0.01'],
    ['1005000', '$1.005'],
    ['1230000', '$1.23'],
    ['1234567', '$1.234567'],
    ['1999999', '$1.999999'],
    ['-1', '-$0.000001'],
    ['-1230000', '-$1.23'],
    ['-0', '$0.00'],
    ['9007199254740993123456', '$9,007,199,254,740,993.123456'],
    [
      '123456789012345678901234567890',
      '$123,456,789,012,345,678,901,234.56789',
    ],
  ])(
    'displays exact micros %s without normal currency rounding',
    (amount, expected) => {
      expect(formatFinanceAmountMicros(amount, 'USD', 'en-US')).toBe(expected);
    },
  );

  it('preserves currency minimum decimals while retaining smaller real costs', () => {
    expect(formatFinanceAmountMicros('1000000', 'JPY', 'en-US')).toBe('¥1');
    expect(formatFinanceAmountMicros('1234567', 'JPY', 'en-US')).toBe(
      '¥1.234567',
    );
    expect(formatFinanceAmountMicros('1200000', 'KWD', 'en-US')).toBe(
      'KWD\u00a01.200',
    );
    expect(formatFinanceAmountMicros('1', 'KWD', 'en-US')).toBe(
      'KWD\u00a00.000001',
    );
  });

  it('uses the locale’s separators, sign and currency placement for large totals', () => {
    expect(
      formatFinanceAmountMicros('9007199254740993123456', 'EUR', 'de-DE'),
    ).toBe('9.007.199.254.740.993,123456\u00a0€');
    expect(formatFinanceAmountMicros('-1', 'EUR', 'de-DE')).toBe(
      '-0,000001\u00a0€',
    );
  });

  it('localizes fractional digits along with whole digits', () => {
    const expected = new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(-1.234567);
    expect(formatFinanceAmountMicros('-1234567', 'USD', 'ar-EG')).toBe(
      expected,
    );
  });

  it.each(['', '1.2', '1e6', '+1', ' 1 ', '--1', 'NaN', 'Infinity'])(
    'does not guess a value for invalid stored micros %s',
    (amount) => {
      expect(formatFinanceAmountMicros(amount, 'USD', 'en-US')).toBe('—');
    },
  );

  it('fails safely for invalid currency, locale or runtime amount data', () => {
    expect(formatFinanceAmountMicros('1', 'INVALID', 'en-US')).toBe('—');
    expect(formatFinanceAmountMicros('1', 'USD', '_invalid_locale')).toBe('—');
    expect(
      formatFinanceAmountMicros(null as unknown as string, 'USD', 'en-US'),
    ).toBe('—');
  });
});

describe('financeAllocationRemainder', () => {
  it('distinguishes an exact zero balance from an incomplete allocation', () => {
    expect(financeAllocationRemainder('0', [])).toEqual({
      allocatedMicros: '0',
      remainingMicros: '0',
      overallocated: false,
      complete: true,
    });
    expect(financeAllocationRemainder('1000000', [])).toEqual({
      allocatedMicros: '0',
      remainingMicros: '1000000',
      overallocated: false,
      complete: false,
    });
  });

  it('preserves a one-micro remainder rather than rounding three explicit thirds', () => {
    const allocations = ['33333333', '33333333', '33333333'];
    const before = [...allocations];
    expect(financeAllocationRemainder('100000000', allocations)).toEqual({
      allocatedMicros: '99999999',
      remainingMicros: '1',
      overallocated: false,
      complete: false,
    });
    expect(allocations).toEqual(before);
  });

  it('conserves amounts entered with mixed decimal lengths', () => {
    const amounts = ['0.1', '0.20', '0.000001'].map(
      (amount) => parseFinanceAmountMicros(amount) ?? 'invalid',
    );
    expect(financeAllocationRemainder('300001', amounts)).toEqual({
      allocatedMicros: '300001',
      remainingMicros: '0',
      overallocated: false,
      complete: true,
    });
  });

  it('exposes over-allocation as a negative remainder without losing precision', () => {
    expect(financeAllocationRemainder('1', ['2'])).toEqual({
      allocatedMicros: '2',
      remainingMicros: '-1',
      overallocated: true,
      complete: false,
    });
    const result = financeAllocationRemainder('9007199254740993123456', [
      '9007199254740993123450',
      '5',
      '1',
    ]);
    expect(result).toEqual({
      allocatedMicros: '9007199254740993123456',
      remainingMicros: '0',
      overallocated: false,
      complete: true,
    });
  });

  it.each([
    ['-1', ['0']],
    ['1.0', ['0']],
    ['1e6', ['0']],
    ['', ['0']],
    ['1', ['-1']],
    ['1', ['0.5']],
    ['1', ['1e0']],
    ['1', ['']],
  ])('rejects invalid micro-unit allocation data', (total, allocations) => {
    expect(financeAllocationRemainder(total, allocations)).toBeNull();
  });
});
