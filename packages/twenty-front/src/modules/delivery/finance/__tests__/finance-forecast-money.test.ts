import {
  isFinanceAnchorAmountMicrosWithinLimit,
  parseFinanceSignedAmountMicros,
} from '@/delivery/finance/finance-forecast-money';

describe('isFinanceAnchorAmountMicrosWithinLimit', () => {
  it.each(['0', '1', '-1', '9223372036854775807', '-9223372036854775808'])(
    'accepts the exact signed storage amount %s',
    (amount) => {
      expect(isFinanceAnchorAmountMicrosWithinLimit(amount)).toBe(true);
    },
  );
  it.each([
    '-0',
    '01',
    '-01',
    '1.0',
    '+1',
    '9223372036854775808',
    '-9223372036854775809',
  ])('rejects noncanonical or out-of-range starting cash %s', (amount) => {
    expect(isFinanceAnchorAmountMicrosWithinLimit(amount)).toBe(false);
  });
});

describe('parseFinanceSignedAmountMicros', () => {
  it.each([
    ['0', '0'],
    ['-0.000000', '0'],
    ['0.000001', '1'],
    ['-0.000001', '-1'],
    [' -12.345678 ', '-12345678'],
    ['-.5', '-500000'],
    ['9007199254740993.123456', '9007199254740993123456'],
    ['-9223372036854.775808', '-9223372036854775808'],
  ])('keeps the exact signed cash value %s', (amount, expected) => {
    expect(parseFinanceSignedAmountMicros(amount)).toBe(expected);
  });

  it.each(['', '-', '--1', '- 1', '-1e6', '+1', '1,000', '-0.0000001', '-NaN'])(
    'rejects ambiguous cash input %s',
    (amount) => {
      expect(parseFinanceSignedAmountMicros(amount)).toBeNull();
    },
  );
});
