import {
  actualCharge,
  maximumCharge,
  microToUsd,
  normalizeUsage,
  pricingSchema,
  usdToMicro,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { type OtogrowAiPricing } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

const pricing: OtogrowAiPricing = {
  inputUsdPerMillionTokens: '1',
  outputUsdPerMillionTokens: '2',
  reasoningUsdPerMillionTokens: '3',
  cacheReadUsdPerMillionTokens: '0.1',
  cacheWriteUsdPerMillionTokens: '1.25',
  maxInputTokens: 1_000_000,
  maxOutputTokens: 4096,
  maxReasoningTokens: 1000,
  outputIncludesReasoning: true,
  longContextThresholdTokens: null,
  longInputUsdPerMillionTokens: null,
  longOutputUsdPerMillionTokens: null,
  longReasoningUsdPerMillionTokens: null,
  longCacheReadUsdPerMillionTokens: null,
  longCacheWriteUsdPerMillionTokens: null,
};
describe('OS production AI money and verified bounds', () => {
  it('uses exact decimal micro-dollars, including amounts beyond Number precision', () => {
    expect(microToUsd(usdToMicro('9999999999.123456'))).toBe(
      '9999999999.123456',
    );
    expect(microToUsd(BigInt(-1))).toBe('-0.000001');
    for (const input of ['1e2', '-1', 'NaN', '1.1234567', '01', ' 1'])
      expect(() => usdToMicro(input)).toThrow();
  });
  it('reserves the conservative model input bound using the highest applicable input rate', () => {
    expect(microToUsd(maximumCharge(pricing, 1000))).toBe('1.255000');
    expect(() => maximumCharge(pricing, 5000)).toThrow();
  });
  it('charges reasoning once and separates cached read/write input', () => {
    expect(
      microToUsd(
        actualCharge(pricing, {
          inputTokens: 1000,
          outputTokens: 500,
          reasoningTokens: 100,
          cacheReadTokens: 100,
          cacheWriteTokens: 200,
        }),
      ),
    ).toBe('0.002060');
  });
  it('uses long-context rates for actuals, and highest tier in reservation', () => {
    const tier = {
      ...pricing,
      longContextThresholdTokens: 500,
      longInputUsdPerMillionTokens: '2',
      longOutputUsdPerMillionTokens: '4',
      longReasoningUsdPerMillionTokens: '6',
      longCacheReadUsdPerMillionTokens: '0.2',
      longCacheWriteUsdPerMillionTokens: '2.5',
    };
    expect(microToUsd(maximumCharge(tier, 1000))).toBe('2.510000');
    expect(
      microToUsd(
        actualCharge(tier, {
          inputTokens: 1000,
          outputTokens: 500,
          reasoningTokens: 100,
          cacheReadTokens: 100,
          cacheWriteTokens: 200,
        }),
      ),
    ).toBe('0.004120');
  });
  it('rejects incomplete tier setup and inconsistent usage', () => {
    expect(
      pricingSchema.safeParse({ ...pricing, longContextThresholdTokens: 100 })
        .success,
    ).toBe(false);
    expect(() =>
      actualCharge(pricing, {
        inputTokens: 10,
        outputTokens: 3,
        reasoningTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toThrow();
  });
  it('holds unknown usage rather than treating absent billable units as zero', () => {
    expect(
      normalizeUsage(pricing, { inputTokens: 20, outputTokens: 5 }),
    ).toBeNull();
    expect(normalizeUsage(pricing, null)).toBeNull();
    const uniform = {
      ...pricing,
      maxReasoningTokens: 0,
      cacheReadUsdPerMillionTokens: '1',
      cacheWriteUsdPerMillionTokens: '1',
    };
    expect(
      normalizeUsage(uniform, { inputTokens: 20, outputTokens: 5 }),
    ).toEqual({
      inputTokens: 20,
      outputTokens: 5,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
  it('uses aggregate usage when decimal-equivalent component rates make the unknown split irrelevant', () => {
    const uniform = {
      ...pricing,
      cacheReadUsdPerMillionTokens: '1.0',
      cacheWriteUsdPerMillionTokens: '1.000000',
      reasoningUsdPerMillionTokens: '2.0',
    };
    expect(
      normalizeUsage(uniform, { inputTokens: 20, outputTokens: 5 }),
    ).toEqual({
      inputTokens: 20,
      outputTokens: 5,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(
      normalizeUsage(
        { ...uniform, outputIncludesReasoning: false },
        { inputTokens: 20, outputTokens: 5 },
      ),
    ).toBeNull();
  });
  it('rounds combined billing components once, so cache splits cannot exceed the bound', () => {
    const tiny = {
      ...pricing,
      inputUsdPerMillionTokens: '0.1',
      cacheReadUsdPerMillionTokens: '0.1',
      cacheWriteUsdPerMillionTokens: '0.1',
      outputUsdPerMillionTokens: '0',
      reasoningUsdPerMillionTokens: '0',
      maxInputTokens: 3,
      maxOutputTokens: 1,
      maxReasoningTokens: 0,
    };
    const actual = actualCharge(tiny, {
      inputTokens: 3,
      outputTokens: 1,
      reasoningTokens: 0,
      cacheReadTokens: 1,
      cacheWriteTokens: 1,
    });
    expect(actual).toBe(BigInt(1));
    expect(actual).toBeLessThanOrEqual(maximumCharge(tiny, 1));
  });
  it('records actual overrun instead of clamping to the reservation', () => {
    const bounds = {
      ...pricing,
      maxInputTokens: 10,
      maxOutputTokens: 10,
      maxReasoningTokens: 0,
    };
    expect(
      actualCharge(bounds, {
        inputTokens: 1000,
        outputTokens: 100,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }) > maximumCharge(bounds, 10),
    ).toBe(true);
  });
});
