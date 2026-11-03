import { isValidUuid } from 'twenty-shared/utils';
import {
  type DeliveryCapacitySummaryInput,
  type DeliveryCapacityAssignmentsInput,
} from '~/generated-metadata/graphql';
import { capacityDates } from '@/delivery/capacity/capacityModel';
import { Temporal } from 'temporal-polyfill';
export const capacityCalendarDate = (observedAt: string, timezone: string) => {
  try {
    return Temporal.Instant.from(observedAt)
      .toZonedDateTimeISO(timezone)
      .toPlainDate()
      .toString();
  } catch {
    return '';
  }
};
export const capacityReadInputs = (
  params: URLSearchParams,
  defaultDate: string,
  timezone: string,
): {
  valid: boolean;
  summary: DeliveryCapacitySummaryInput | null;
  assignments: DeliveryCapacityAssignmentsInput | null;
} => {
  const startDate = params.get('capacityFrom') ?? defaultDate;
  const dates = capacityDates(startDate);
  const after = params.get('capacityAfter');
  const assignmentsAfter = params.get('capacityAssignmentsAfter');
  const memberId = params.get('capacityMember');
  const missing = params.get('capacityMissingOwner');
  const bucket = params.get('capacityBucket');
  const date = params.get('capacityDate');
  let validTimezone = true;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    validTimezone = false;
  }
  if (
    !validTimezone ||
    dates.length !== 7 ||
    (after && after.length > 2000) ||
    (assignmentsAfter && assignmentsAfter.length > 2000) ||
    (memberId && !isValidUuid(memberId)) ||
    (missing && missing !== '1') ||
    (memberId && missing) ||
    (!bucket && Boolean(memberId || missing || date || assignmentsAfter)) ||
    (bucket &&
      !['DAY', 'NEEDS_PLANNING', 'UNAVAILABLE_OWNER'].includes(bucket)) ||
    (bucket && !memberId && missing !== '1') ||
    (bucket === 'DAY' ? !date || !dates.includes(date) : Boolean(date)) ||
    (bucket === 'UNAVAILABLE_OWNER' && missing !== '1')
  )
    return { valid: false, summary: null, assignments: null };
  return {
    valid: true,
    summary: { startDate, timezone, after, limit: 25 },
    assignments: bucket
      ? {
          startDate,
          timezone,
          memberId: memberId ?? null,
          bucket,
          date: date ?? null,
          after: assignmentsAfter,
          limit: 25,
        }
      : null,
  };
};
export const clearCapacitySelection = {
  capacityMember: null,
  capacityBucket: null,
  capacityDate: null,
  capacityMissingOwner: null,
  capacityAssignmentsAfter: null,
} as const;
