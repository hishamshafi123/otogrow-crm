import { BadRequestException } from '@nestjs/common';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
import { type AdvertisingGoal } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import {
  advertisingDecimal,
  advertisingMoneyMicros,
  advertisingMinorDecimal,
  metaAdvertisingBaseMetric,
  metaAdvertisingMetrics,
  manualAdvertisingMetrics,
  advertisingObservationMetric,
  validateAdvertisingGoal,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-metrics';

const row = (changes: Partial<MetaInsightRow> = {}): MetaInsightRow => ({
  account_id: '123456',
  date_start: '2026-10-30',
  date_stop: '2026-10-30',
  spend: '12.34',
  impressions: '100',
  clicks: '5',
  actions: [{ action_type: 'lead', value: '3' }],
  action_values: [],
  ...changes,
});
const context = (metrics = metaAdvertisingMetrics(row())) => ({
  source: {
    currency: 'USD',
    fromDate: '2026-10-30',
    throughDate: '2026-10-30',
    timezone: 'Asia/Qatar',
  },
  metrics,
  evidenceFingerprint: 'a'.repeat(64),
});
const goal = (changes: Partial<AdvertisingGoal> = {}): AdvertisingGoal => ({
  kind: 'LEADS',
  metricKey: null,
  metricAdId: null,
  provenance: 'REPORT',
  value: null,
  evidence: '',
  targetCostMicros: null,
  ...changes,
});

it.each([
  '1e4',
  '-1',
  'NaN',
  'Infinity',
  '1000000000000000000',
  '0.1234567890123',
])('keeps unsupported provider value %s unknown', (value) => {
  expect(advertisingDecimal(value)).toBeNull();
  expect(advertisingMoneyMicros(value)).toBeNull();
});
it('normalizes decimal notation exactly without float rounding or silent precision loss', () => {
  expect(advertisingDecimal('00012.3400')).toBe('12.34');
  expect(advertisingMoneyMicros('123456789012345678.123456')).toBe(
    '123456789012345678123456',
  );
  expect(advertisingMoneyMicros('0.0000001')).toBeNull();
  expect(advertisingMoneyMicros('0.0000000')).toBe('0');
  expect(advertisingMinorDecimal(123)).toBe('1.23');
  expect(advertisingMinorDecimal(0)).toBe('0');
  expect(advertisingMinorDecimal(null)).toBeNull();
  expect(advertisingMinorDecimal(1.5)).toBeNull();
});
it('distinguishes missing provider rows, historical defaults, explicit missing fields and reported zero', () => {
  expect(metaAdvertisingBaseMetric(null, 'spend')).toEqual({
    value: null,
    reason: 'NO_PROVIDER_ROW',
  });
  expect(metaAdvertisingBaseMetric(row({ spend: '0' }), 'spend')).toEqual({
    value: null,
    reason: 'LEGACY_FIELD_PRESENCE_NOT_RECORDED',
  });
  expect(
    metaAdvertisingBaseMetric(
      row({
        spend: '0',
        reportedFields: {
          spend: true,
          impressions: true,
          clicks: true,
          actions: true,
          action_values: true,
        },
      }),
      'spend',
    ),
  ).toEqual({ value: '0', reason: null });
  expect(
    metaAdvertisingBaseMetric(
      row({
        spend: '0',
        reportedFields: {
          spend: false,
          impressions: false,
          clicks: false,
          actions: false,
          action_values: false,
        },
      }),
      'spend',
    ),
  ).toEqual({ value: null, reason: 'NOT_REPORTED' });
  expect(metaAdvertisingBaseMetric(row(), 'spend')).toEqual({
    value: '12.34',
    reason: null,
  });
});
it('uses one named provider event rather than summing purchase aliases or inferring qualified leads', () => {
  const metrics = metaAdvertisingMetrics(
    row({
      actions: [
        { action_type: 'lead', value: '4' },
        { action_type: 'purchase', value: '2' },
        { action_type: 'omni_purchase', value: '2' },
        { action_type: 'complete_registration', value: '3' },
        { action_type: 'unknown_custom_event', value: '7' },
      ],
    }),
  );
  expect(
    metrics.find((metric) => metric.label.startsWith('lead ')),
  ).toMatchObject({ value: '4', goalKinds: ['LEADS'] });
  expect(
    metrics.find((metric) => metric.label.startsWith('purchase ')),
  ).toMatchObject({ value: '2', goalKinds: ['PURCHASES'] });
  expect(
    metrics.find((metric) => metric.label.startsWith('omni_purchase ')),
  ).toMatchObject({ value: '2', goalKinds: ['PURCHASES'] });
  expect(
    metrics.find((metric) => metric.label.startsWith('complete_registration ')),
  ).toMatchObject({ value: '3', goalKinds: ['REGISTRATIONS'] });
  expect(
    metrics.find((metric) => metric.label.startsWith('unknown_custom_event ')),
  ).toMatchObject({ value: '7', goalKinds: [] });
  expect(
    metrics.every((metric) => !metric.goalKinds.includes('QUALIFIED_LEADS')),
  ).toBe(true);
});
it('keeps an explicit zero action known but duplicate event records ambiguous', () => {
  const zero = metaAdvertisingMetrics(
    row({ actions: [{ action_type: 'lead', value: '0' }] }),
  ).find((metric) => metric.goalKinds.includes('LEADS'));
  expect(zero).toMatchObject({ value: '0', reason: null });
  const duplicate = metaAdvertisingMetrics(
    row({
      actions: [
        { action_type: 'lead', value: '2' },
        { action_type: 'lead', value: '2' },
      ],
    }),
  ).find((metric) => metric.goalKinds.includes('LEADS'));
  expect(duplicate).toMatchObject({
    value: null,
    reason: 'AMBIGUOUS_PROVIDER_METRIC',
  });
});
it('keeps account and exact-ad metric identities separate', () => {
  const account = metaAdvertisingMetrics(row()).find((metric) =>
    metric.goalKinds.includes('LEADS'),
  );
  const ad = metaAdvertisingMetrics(row(), 'ad-123').find((metric) =>
    metric.goalKinds.includes('LEADS'),
  );
  expect(account?.key).not.toBe(ad?.key);
  expect(() => advertisingObservationMetric(context(), ad?.key ?? '')).toThrow(
    BadRequestException,
  );
});
it('keeps platform-attributed value and manual commerce observations distinct, including null versus zero', () => {
  const platform = metaAdvertisingMetrics(
    row({
      action_values: [
        { action_type: 'purchase', value: '50.25' },
        { action_type: 'lead', value: '10' },
      ],
    }),
  );
  expect(
    platform.find(
      (metric) => metric.unit === 'MONEY' && metric.goalKinds.includes('SALES'),
    ),
  ).toMatchObject({ value: '50.25', provenance: 'PLATFORM_REPORTED' });
  expect(
    platform.find((metric) =>
      metric.label.startsWith('lead (platform-attributed'),
    ),
  ).toMatchObject({ goalKinds: [] });
  const manual = manualAdvertisingMetrics({
    purchases: 0,
    qualifiedLeads: 2,
    bookedCalls: 0,
    webinarRegistrations: 0,
    attributedRevenue: 5000,
    shopifyRevenue: null,
  });
  expect(
    manual.find((metric) => metric.key === 'manual:qualifiedLeads'),
  ).toMatchObject({ goalKinds: ['QUALIFIED_LEADS'] });
  expect(
    manual.find((metric) => metric.key === 'manual:attributedRevenue'),
  ).toMatchObject({ value: '50', provenance: 'HUMAN_REPORTED' });
  expect(
    manual.find((metric) => metric.key === 'manual:shopifyRevenue'),
  ).toMatchObject({ value: null, reason: 'NOT_REPORTED' });
  const zero = manualAdvertisingMetrics({
    purchases: 0,
    qualifiedLeads: 0,
    bookedCalls: 0,
    webinarRegistrations: 0,
    attributedRevenue: 0,
    shopifyRevenue: 0,
  });
  expect(
    zero.find((metric) => metric.key === 'manual:shopifyRevenue'),
  ).toMatchObject({ value: '0' });
});
it('pins exact known goal provenance and leaves a null metric reason null', () => {
  const source = context();
  const metric = source.metrics.find((candidate) =>
    candidate.goalKinds.includes('LEADS'),
  );
  if (!metric) throw new Error('Expected lead fixture.');
  const snapshot = validateAdvertisingGoal(
    source,
    goal({ metricKey: metric.key, value: metric.value }),
  );
  expect(snapshot).toMatchObject({
    kind: 'LEADS',
    value: '3',
    metricUnit: 'COUNT',
    metricProvenance: 'PLATFORM_REPORTED',
    metricReason: null,
    sourceFingerprint: source.evidenceFingerprint,
    timezone: 'Asia/Qatar',
  });
  expect(() =>
    validateAdvertisingGoal(
      source,
      goal({ metricKey: metric.key, value: '9' }),
    ),
  ).toThrow(BadRequestException);
  expect(() =>
    validateAdvertisingGoal(
      source,
      goal({
        kind: 'QUALIFIED_LEADS',
        metricKey: metric.key,
        value: metric.value,
      }),
    ),
  ).toThrow(BadRequestException);
  expect(() =>
    validateAdvertisingGoal(
      source,
      goal({ kind: 'PURCHASES', metricKey: metric.key, value: metric.value }),
    ),
  ).toThrow(BadRequestException);
});
it('requires explicit evidence for human qualification and never overwrites the original report metric', () => {
  expect(() =>
    validateAdvertisingGoal(
      context(),
      goal({ kind: 'QUALIFIED_LEADS', provenance: 'HUMAN', value: '2' }),
    ),
  ).toThrow(BadRequestException);
  expect(
    validateAdvertisingGoal(
      context(),
      goal({
        kind: 'QUALIFIED_LEADS',
        provenance: 'HUMAN',
        value: '2',
        evidence: 'CRM qualification notes checked by the project manager.',
      }),
    ),
  ).toMatchObject({
    metricProvenance: 'HUMAN_REPORTED',
    metricReason: 'HUMAN_REPORT_NOT_INDEPENDENT_VERIFICATION',
    value: '2',
  });
  expect(() =>
    validateAdvertisingGoal(
      context(),
      goal({
        provenance: 'HUMAN',
        metricKey: 'account:lead',
        value: '2',
        evidence: 'Notes',
      }),
    ),
  ).toThrow(BadRequestException);
});
it('keeps an unmapped report outcome unknown and prevents count-target meaning on revenue', () => {
  expect(validateAdvertisingGoal(context(), goal())).toMatchObject({
    value: null,
    metricReason: 'NOT_MAPPED',
    metricProvenance: 'UNMAPPED',
  });
  expect(() =>
    validateAdvertisingGoal(context(), goal({ value: '0' })),
  ).toThrow(BadRequestException);
  expect(() =>
    validateAdvertisingGoal(
      context(),
      goal({
        kind: 'SALES',
        provenance: 'HUMAN',
        value: '100',
        evidence: 'Shopify export',
        targetCostMicros: '1000000',
      }),
    ),
  ).toThrow(BadRequestException);
});
