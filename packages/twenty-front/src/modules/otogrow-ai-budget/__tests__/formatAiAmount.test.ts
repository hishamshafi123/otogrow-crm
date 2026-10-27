import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';

it('keeps small recorded charges visible without floating-point rounding', () => {
  expect(formatAiAmount('0.000001')).toBe('0.000001');
  expect(formatAiAmount('1.123456')).toBe('1.123456');
  expect(formatAiAmount('999999999999.000001')).toBe('999999999999.000001');
});
it('removes insignificant zeros while retaining familiar USD decimals', () => {
  expect(formatAiAmount('0.000000')).toBe('0.00');
  expect(formatAiAmount('2')).toBe('2.00');
  expect(formatAiAmount('-0.010000')).toBe('-0.01');
});
