import { randomUUID } from 'node:crypto';
import {
  compareSeoMetrics,
  parseSeoInput,
} from '../delivery-seo-results.policy';
import {
  seoBodySchema,
  seoMetricSchema,
  type SeoBody,
  type SeoMetric,
} from '../delivery-seo-results.types';

const metric = (overrides: Partial<SeoMetric> = {}): SeoMetric => ({
  id: randomUUID(),
  key: 'CLICKS',
  label: 'Organic search clicks',
  unit: 'COUNT',
  value: '0',
  unknownReason: '',
  source: 'SEARCH_CONSOLE',
  sourceUrl: 'https://example.com/search-export',
  property: 'https://example.com/',
  segment: 'Web · all countries · all devices',
  definition:
    'Search Console organic web search clicks, excluding paid campaigns.',
  observedAt: '2020-03-01T09:00:00Z',
  ...overrides,
});
const body = (overrides: Partial<SeoBody> = {}): SeoBody => ({
  title: 'February results',
  ownerId: randomUUID(),
  period: 'MONTHLY',
  periodStart: '2020-02-01',
  periodEnd: '2020-02-29',
  timezone: 'Asia/Qatar',
  summary: 'Work and measured outcomes are recorded separately.',
  workNotes: 'Reviewed changes are linked as evidence.',
  tasks: [],
  evidence: [],
  metrics: [metric()],
  comparisonId: null,
  comparisonVersion: null,
  ...overrides,
});

describe('SEO reporting evidence and comparisons', () => {
  it('retains an actual zero independently from an unavailable measurement', () => {
    expect(parseSeoInput(seoMetricSchema, metric()).value).toBe('0');
    expect(
      parseSeoInput(
        seoMetricSchema,
        metric({
          value: null,
          unknownReason: 'Search property access is pending.',
        }),
      ).value,
    ).toBeNull();
    expect(() =>
      parseSeoInput(seoMetricSchema, metric({ value: null })),
    ).toThrow('Explain why');
  });
  it.each(['1.5', '-1', 'NaN', 'Infinity', '01', '1e3'])(
    'rejects a noncanonical count %s',
    (value) => {
      expect(() => parseSeoInput(seoMetricSchema, metric({ value }))).toThrow();
    },
  );
  it('validates source evidence without throwing from a malformed URL refinement', () => {
    for (const sourceUrl of [
      'not-a-url',
      'file:///private',
      'javascript:alert(1)',
      'ftp://example.com/',
    ])
      expect(() =>
        parseSeoInput(seoMetricSchema, metric({ sourceUrl })),
      ).toThrow();
  });
  it('does not call a zero or wrong-unit average position a measured ranking', () => {
    expect(
      seoMetricSchema.safeParse(
        metric({ key: 'AVERAGE_POSITION', unit: 'COUNT' }),
      ).success,
    ).toBe(false);
    expect(
      seoMetricSchema.safeParse(
        metric({ key: 'AVERAGE_POSITION', unit: 'POSITION', value: '0' }),
      ).success,
    ).toBe(false);
    expect(
      seoMetricSchema.safeParse(
        metric({ key: 'AVERAGE_POSITION', unit: 'POSITION', value: '8.25' }),
      ).success,
    ).toBe(true);
  });
  it('uses seven calendar dates without inventing a mandatory weekday', () => {
    expect(
      seoBodySchema.safeParse(
        body({
          period: 'WEEKLY',
          periodStart: '2020-02-19',
          periodEnd: '2020-02-25',
        }),
      ).success,
    ).toBe(true);
    expect(
      seoBodySchema.safeParse(
        body({
          period: 'WEEKLY',
          periodStart: '2020-02-19',
          periodEnd: '2020-02-26',
        }),
      ).success,
    ).toBe(false);
  });
  it('requires a complete real calendar month including leap years', () => {
    expect(seoBodySchema.safeParse(body()).success).toBe(true);
    expect(
      seoBodySchema.safeParse(body({ periodEnd: '2020-02-28' })).success,
    ).toBe(false);
    expect(
      seoBodySchema.safeParse(
        body({ periodStart: '2021-02-01', periodEnd: '2021-02-29' }),
      ).success,
    ).toBe(false);
  });
  it('rejects an invalid timezone and duplicate source task identities', () => {
    expect(
      seoBodySchema.safeParse(body({ timezone: 'Mars/Unknown' })).success,
    ).toBe(false);
    const task = { taskId: randomUUID(), revision: 1 };
    expect(seoBodySchema.safeParse(body({ tasks: [task, task] })).success).toBe(
      false,
    );
  });
  it('does exact decimal subtraction without floating point rounding', () => {
    const baseline = body({
      periodStart: '2020-01-01',
      periodEnd: '2020-01-31',
      metrics: [
        metric({
          key: 'CUSTOM',
          unit: 'POSITION',
          value: '999999999999.999998',
        }),
      ],
    });
    const current = body({
      metrics: [
        metric({
          key: 'CUSTOM',
          unit: 'POSITION',
          value: '999999999999.999999',
        }),
      ],
    });
    expect(compareSeoMetrics(current, baseline)[0].delta).toBe('0.000001');
  });
  it('keeps monthly totals descriptive across unequal calendar lengths', () => {
    const baseline = body({
      periodStart: '2020-01-01',
      periodEnd: '2020-01-31',
      metrics: [metric({ value: '10' })],
    });
    expect(compareSeoMetrics(body(), baseline)[0]).toMatchObject({
      currentValue: '0',
      previousValue: '10',
      delta: '-10',
      reason: null,
    });
  });
  it.each([
    'property',
    'segment',
    'definition',
    'source',
    'unit',
    'label',
  ] as const)('does not compare unlike %s', (field) => {
    const previousMetric = metric({
      [field]:
        field === 'source'
          ? 'OTHER'
          : field === 'unit'
            ? 'POSITION'
            : 'Different scope',
    });
    const previous = body({
      periodStart: '2020-01-01',
      periodEnd: '2020-01-31',
      metrics: [previousMetric],
    });
    expect(compareSeoMetrics(body(), previous)[0].delta).toBeNull();
  });
  it('does not treat unavailable or overlapping measurements as comparable zero', () => {
    const previous = body({
      periodStart: '2020-01-01',
      periodEnd: '2020-01-31',
      metrics: [metric({ value: null, unknownReason: 'Not measured.' })],
    });
    expect(compareSeoMetrics(body(), previous)[0]).toMatchObject({
      delta: null,
      reason: 'One measurement is unavailable.',
    });
    expect(compareSeoMetrics(body(), body())[0].delta).toBeNull();
    expect(
      compareSeoMetrics(body(), { ...previous, timezone: 'UTC' })[0].delta,
    ).toBeNull();
  });
});
