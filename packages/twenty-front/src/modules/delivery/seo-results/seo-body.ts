import {
  getValidTimeZoneOrUndefined,
  isValidUuid,
  isValidUrl,
} from 'twenty-shared/utils';
import { type SeoBody } from '@/delivery/seo-results/seo-results.types';
import { type DeliverySeoBodyInput } from '~/generated-metadata/graphql';

export const newSeoBody = (): SeoBody => ({
  title: '',
  ownerId: '',
  period: 'WEEKLY',
  periodStart: '',
  periodEnd: '',
  timezone: 'Asia/Qatar',
  summary: '',
  workNotes: '',
  tasks: [],
  evidence: [],
  metrics: [],
  comparisonId: null,
  comparisonVersion: null,
});
export const canonicalSeoBody = (body: DeliverySeoBodyInput): SeoBody => ({
  title: body.title.trim(),
  ownerId: body.ownerId,
  period: body.period,
  periodStart: body.periodStart,
  periodEnd: body.periodEnd,
  timezone: body.timezone,
  summary: body.summary.trim(),
  workNotes: body.workNotes.trim(),
  comparisonId: body.comparisonId ?? null,
  comparisonVersion: body.comparisonVersion ?? null,
  tasks: body.tasks.map((task) => ({
    taskId: task.taskId,
    revision: task.revision,
  })),
  evidence: body.evidence.map((item) => ({
    label: item.label.trim(),
    url: item.url.trim(),
    note: item.note.trim(),
  })),
  metrics: body.metrics.map((item) => ({
    id: item.id,
    key: item.key,
    unit: item.unit,
    value: item.value ?? null,
    label: item.label.trim(),
    unknownReason: item.unknownReason.trim(),
    source: item.source,
    sourceUrl: item.sourceUrl,
    observedAt: item.observedAt,
    property: item.property.trim(),
    segment: item.segment.trim(),
    definition: item.definition.trim(),
  })),
});
export const seoBodyValid = (body: SeoBody) => {
  const start = Date.parse(`${body.periodStart}T00:00:00Z`);
  const end = Date.parse(`${body.periodEnd}T00:00:00Z`);
  const periodValid =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    (body.period === 'WEEKLY'
      ? end - start === 6 * 86400000
      : body.periodStart.endsWith('-01') &&
        body.periodStart.slice(0, 7) === body.periodEnd.slice(0, 7) &&
        new Date(end + 86400000).getUTCDate() === 1);
  return Boolean(
    body.title.trim() &&
    body.title.length <= 200 &&
    isValidUuid(body.ownerId) &&
    periodValid &&
    getValidTimeZoneOrUndefined(body.timezone) &&
    body.metrics.every((metric) => {
      const validValue =
        metric.value === null
          ? Boolean(metric.unknownReason.trim())
          : /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(metric.value) &&
            (metric.unit !== 'COUNT' || !metric.value.includes('.')) &&
            (metric.unit !== 'PERCENT' || Number(metric.value) <= 100) &&
            (metric.unit !== 'POSITION' || Number(metric.value) > 0);
      return (
        validValue &&
        metric.label.trim().length > 0 &&
        metric.property.trim().length > 0 &&
        metric.segment.trim().length > 0 &&
        metric.definition.trim().length > 0 &&
        isValidUrl(metric.sourceUrl) &&
        /^https?:\/\//.test(metric.sourceUrl) &&
        Number.isFinite(Date.parse(metric.observedAt))
      );
    }) &&
    body.evidence.every(
      (item) =>
        item.label.trim().length > 0 &&
        isValidUrl(item.url) &&
        /^https?:\/\//.test(item.url),
    ),
  );
};
