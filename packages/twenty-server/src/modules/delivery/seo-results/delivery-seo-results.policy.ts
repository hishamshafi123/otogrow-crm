import { BadRequestException } from '@nestjs/common';
import { type z } from 'zod';
import {
  type SeoBody,
  type SeoComparisonSnapshot,
  type SeoMetric,
} from './delivery-seo-results.types';

export const parseSeoInput = <TValue>(
  schema: z.ZodType<TValue>,
  input: unknown,
): TValue => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues[0]?.message ?? 'Check this SEO report.',
    );
  return parsed.data;
};
const metricIdentity = (metric: SeoMetric) =>
  JSON.stringify([
    metric.key,
    metric.label,
    metric.unit,
    metric.source,
    metric.property,
    metric.segment,
    metric.definition,
  ]);
const scaled = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'));
};
const unscaled = (value: bigint) => {
  const sign = value < BigInt(0) ? '-' : '';
  const positive = value < BigInt(0) ? -value : value;
  return `${sign}${positive / BigInt(1000000)}${
    positive % BigInt(1000000)
      ? `.${String(positive % BigInt(1000000))
          .padStart(6, '0')
          .replace(/0+$/, '')}`
      : ''
  }`;
};
export const compareSeoMetrics = (
  current: SeoBody,
  previous: SeoComparisonSnapshot,
) =>
  current.metrics.map((metric) => {
    const matches = previous.metrics.filter(
      (candidate) => metricIdentity(candidate) === metricIdentity(metric),
    );
    const match = matches.length === 1 ? matches[0] : null;
    const compatible =
      current.period === previous.period &&
      current.timezone === previous.timezone &&
      previous.periodEnd < current.periodStart &&
      match !== null;
    const reason = !compatible
      ? 'Measurement definition, scope, period or timezone differs.'
      : metric.value === null || match?.value === null
        ? 'One measurement is unavailable.'
        : null;
    return {
      metricId: metric.id,
      label: metric.label,
      currentValue: metric.value,
      previousValue: match?.value ?? null,
      delta:
        reason === null &&
        metric.value !== null &&
        match?.value !== null &&
        match?.value !== undefined
          ? unscaled(scaled(metric.value) - scaled(match.value))
          : null,
      reason,
    };
  });
