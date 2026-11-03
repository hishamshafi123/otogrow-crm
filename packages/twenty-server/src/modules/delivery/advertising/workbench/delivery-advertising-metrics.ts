import { BadRequestException } from '@nestjs/common';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  type AdvertisingGoal,
  type AdvertisingGoalKind,
  type AdvertisingGoalSnapshot,
  type AdvertisingMetric,
  type AdvertisingSourceSnapshot,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
type AdvertisingMetricContext = {
  source: Pick<
    AdvertisingSourceSnapshot,
    'currency' | 'fromDate' | 'throughDate' | 'timezone'
  >;
  metrics: AdvertisingMetric[];
  evidenceFingerprint: string;
};

export const advertisingDecimal = (value: unknown): string | null => {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value !== 'string' || !/^\d{1,18}(\.\d{1,12})?$/.test(value))
    return null;
  const [integer, fraction = ''] = value.split('.');
  const decimal = fraction.replace(/0+$/, '');
  return `${integer.replace(/^0+(?=\d)/, '')}${decimal ? `.${decimal}` : ''}`;
};
export const advertisingMoneyMicros = (value: unknown): string | null => {
  const parsed = advertisingDecimal(value);
  if (parsed === null) return null;
  const [integer, fraction = ''] = parsed.split('.');
  if (fraction.length > 6) return null;
  return (
    BigInt(integer) * BigInt(1000000) +
    BigInt(fraction.padEnd(6, '0'))
  ).toString();
};
export const advertisingMinorDecimal = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return null;
  const minor = BigInt(value);
  const fraction = String(minor % BigInt(100))
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${minor / BigInt(100)}${fraction ? `.${fraction}` : ''}`;
};
const PURCHASE_EVENTS = new Set([
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'onsite_web_app_purchase',
]);
const LEAD_EVENTS = new Set([
  'lead',
  'omni_lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead_grouped',
]);
const REGISTRATION_EVENTS = new Set([
  'complete_registration',
  'omni_complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
]);
const eventGoals = (event: string, money: boolean): AdvertisingGoalKind[] =>
  PURCHASE_EVENTS.has(event)
    ? money
      ? ['SALES']
      : ['PURCHASES']
    : money
      ? []
      : LEAD_EVENTS.has(event)
        ? ['LEADS']
        : REGISTRATION_EVENTS.has(event)
          ? ['REGISTRATIONS']
          : [];
export const metaAdvertisingBaseMetric = (
  row: MetaInsightRow | null,
  field: 'spend' | 'impressions' | 'clicks',
) => {
  const value = row ? advertisingDecimal(row[field]) : null;
  const present = row?.reportedFields?.[field];
  return {
    value:
      present === false || (present === undefined && value === '0')
        ? null
        : value,
    reason: !row
      ? 'NO_PROVIDER_ROW'
      : present === false
        ? 'NOT_REPORTED'
        : present === undefined && value === '0'
          ? 'LEGACY_FIELD_PRESENCE_NOT_RECORDED'
          : value === null
            ? 'UNSUPPORTED_PROVIDER_VALUE'
            : null,
  };
};
export const metaAdvertisingMetrics = (
  row: MetaInsightRow | null,
  adId: string | null = null,
): AdvertisingMetric[] => {
  const prefix = adId ? `ad:${advertisingHash(adId).slice(0, 24)}` : 'account';
  const base: AdvertisingMetric[] = [
    {
      key: `${prefix}:spend`,
      label: 'Platform spend',
      unit: 'MONEY',
      goalKinds: [],
      ...metaAdvertisingBaseMetric(row, 'spend'),
      provenance: 'PLATFORM_REPORTED',
    },
    {
      key: `${prefix}:impressions`,
      label: 'Platform impressions',
      unit: 'OTHER',
      goalKinds: [],
      ...metaAdvertisingBaseMetric(row, 'impressions'),
      provenance: 'PLATFORM_REPORTED',
    },
    {
      key: `${prefix}:clicks`,
      label: 'Platform clicks',
      unit: 'OTHER',
      goalKinds: [],
      ...metaAdvertisingBaseMetric(row, 'clicks'),
      provenance: 'PLATFORM_REPORTED',
    },
  ];
  for (const collection of ['actions', 'action_values'] as const) {
    const rows = row?.[collection] ?? [];
    for (const actionType of [
      ...new Set(rows.map((action) => action.action_type)),
    ].sort()) {
      const values = rows.filter((action) => action.action_type === actionType);
      const parsed =
        values.length === 1 ? advertisingDecimal(values[0].value) : null;
      base.push({
        key: `${prefix}:${collection}:${advertisingHash(actionType).slice(0, 32)}`,
        label: `${adId ? `Ad ${adId}: ` : ''}${actionType} (${collection === 'actions' ? 'platform count' : 'platform-attributed value'})`,
        unit: collection === 'actions' ? 'COUNT' : 'MONEY',
        goalKinds: eventGoals(actionType, collection === 'action_values'),
        value: parsed,
        provenance: 'PLATFORM_REPORTED',
        reason:
          values.length > 1
            ? 'AMBIGUOUS_PROVIDER_METRIC'
            : parsed === null
              ? 'UNSUPPORTED_PROVIDER_VALUE'
              : null,
      });
    }
  }
  return base;
};
export const manualAdvertisingMetrics = (
  record: Pick<
    Extract<BusinessRecord, { kind: 'AD_REPORT' }>,
    | 'purchases'
    | 'qualifiedLeads'
    | 'bookedCalls'
    | 'webinarRegistrations'
    | 'attributedRevenue'
    | 'shopifyRevenue'
  >,
): AdvertisingMetric[] =>
  (
    [
      [
        'purchases',
        'Manually reported purchases',
        'COUNT',
        ['PURCHASES'],
        record.purchases,
      ],
      [
        'qualifiedLeads',
        'Manually reported qualified leads',
        'COUNT',
        ['QUALIFIED_LEADS'],
        record.qualifiedLeads,
      ],
      [
        'bookedCalls',
        'Manually reported booked calls',
        'COUNT',
        ['BOOKED_CALLS'],
        record.bookedCalls,
      ],
      [
        'webinarRegistrations',
        'Manually reported webinar registrations',
        'COUNT',
        ['REGISTRATIONS'],
        record.webinarRegistrations,
      ],
      [
        'attributedRevenue',
        'Manually reported platform-attributed revenue',
        'MONEY',
        ['SALES'],
        advertisingMinorDecimal(record.attributedRevenue),
      ],
      [
        'shopifyRevenue',
        'Manually observed Shopify revenue',
        'MONEY',
        ['SALES'],
        advertisingMinorDecimal(record.shopifyRevenue),
      ],
    ] satisfies [
      string,
      string,
      AdvertisingMetric['unit'],
      AdvertisingGoalKind[],
      unknown,
    ][]
  ).map(([key, label, unit, goals, value]) => ({
    key: `manual:${key}`,
    label,
    unit,
    goalKinds: goals,
    value: advertisingDecimal(value),
    provenance: 'HUMAN_REPORTED',
    reason:
      value === null
        ? 'NOT_REPORTED'
        : 'HUMAN_REPORT_NOT_INDEPENDENT_VERIFICATION',
  }));

export const advertisingObservationMetric = (
  source: Pick<AdvertisingMetricContext, 'metrics'>,
  key: string,
): AdvertisingMetric => {
  const metric = source.metrics.find((candidate) => candidate.key === key);
  if (!metric)
    throw new BadRequestException(
      'Choose one metric from this exact source and metric scope.',
    );
  return metric;
};
export const validateAdvertisingGoal = (
  source: AdvertisingMetricContext,
  goal: AdvertisingGoal,
): AdvertisingGoalSnapshot => {
  let metric: AdvertisingMetric | null = null;
  if (goal.provenance === 'REPORT') {
    if (goal.metricKey) {
      metric = advertisingObservationMetric(source, goal.metricKey);
      if (!metric.goalKinds.includes(goal.kind))
        throw new BadRequestException(
          'The selected metric does not establish this business outcome.',
        );
      if (goal.value !== metric.value)
        throw new BadRequestException(
          'Use the exact reported metric value; record a separately evidenced human observation to change it.',
        );
    } else if (goal.value !== null)
      throw new BadRequestException(
        'An unmapped report metric must remain unknown.',
      );
  } else {
    if (goal.metricKey !== null || !goal.evidence.trim())
      throw new BadRequestException(
        'Human-provided outcomes need evidence and cannot overwrite a report metric.',
      );
  }
  const unit = metric?.unit ?? (goal.kind === 'SALES' ? 'MONEY' : 'COUNT');
  if (unit === 'MONEY' && goal.targetCostMicros !== null)
    throw new BadRequestException(
      'A target cost per outcome requires a count outcome rather than revenue.',
    );
  return {
    ...goal,
    metricLabel: metric?.label ?? null,
    metricProvenance:
      metric?.provenance ??
      (goal.provenance === 'HUMAN' ? 'HUMAN_REPORTED' : 'UNMAPPED'),
    metricReason: metric
      ? metric.reason
      : goal.provenance === 'REPORT'
        ? 'NOT_MAPPED'
        : 'HUMAN_REPORT_NOT_INDEPENDENT_VERIFICATION',
    metricUnit: unit,
    currency: source.source.currency,
    fromDate: source.source.fromDate,
    throughDate: source.source.throughDate,
    sourceFingerprint: source.evidenceFingerprint,
    timezone: source.source.timezone,
  };
};
