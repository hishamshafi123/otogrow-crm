import { isNonEmptyString } from '@sniptt/guards';

import {
  BUSINESS_HOURS_END,
  BUSINESS_HOURS_START,
} from 'src/modules/sequences/constants/sequence.constant';
import { type SequenceDelayUnit } from 'src/modules/sequences/constants/sequence-delay-unit.constant';
import { sequenceDelayToMs } from 'src/modules/sequences/utils/sequence-delay-to-ms.util';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

// Intl keeps this dependency-free; a wall-clock reading of `date` in
// `timeZone`, good enough for business-hours clamping (DST edges shift the
// send by an hour at worst).
const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
};

const zonedWallClockToUtc = (
  wallClock: Omit<ZonedParts, 'weekday'>,
  timeZone: string,
): Date => {
  const asUtc = Date.UTC(
    wallClock.year,
    wallClock.month - 1,
    wallClock.day,
    wallClock.hour,
    wallClock.minute,
  );

  const zonedParts = getZonedParts(new Date(asUtc), timeZone);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
  );

  return new Date(asUtc - (zonedAsUtc - asUtc));
};

const addDays = (
  wallClock: Omit<ZonedParts, 'weekday'>,
  days: number,
): Omit<ZonedParts, 'weekday'> => {
  const shifted = new Date(
    Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day + days),
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: wallClock.hour,
    minute: wallClock.minute,
  };
};

const isWeekend = (weekday: string): boolean =>
  weekday === 'Sat' || weekday === 'Sun';

// Clamps to Mon-Fri 09:00-17:00 in the given zone; anything outside is pushed
// to the next business day start.
const clampToBusinessHours = (date: Date, timeZone: string): Date => {
  const initialParts = getZonedParts(date, timeZone);

  if (
    !isWeekend(initialParts.weekday) &&
    initialParts.hour >= BUSINESS_HOURS_START &&
    initialParts.hour < BUSINESS_HOURS_END
  ) {
    return date;
  }

  let wallClock: Omit<ZonedParts, 'weekday'> = initialParts;

  if (isWeekend(initialParts.weekday) || initialParts.hour >= BUSINESS_HOURS_END) {
    wallClock = { ...addDays(wallClock, 1), hour: BUSINESS_HOURS_START, minute: 0 };
  } else {
    wallClock = { ...wallClock, hour: BUSINESS_HOURS_START, minute: 0 };
  }

  while (
    isWeekend(getZonedParts(zonedWallClockToUtc(wallClock, timeZone), timeZone).weekday)
  ) {
    wallClock = { ...addDays(wallClock, 1), hour: BUSINESS_HOURS_START, minute: 0 };
  }

  return zonedWallClockToUtc(wallClock, timeZone);
};

export const computeSequenceNextSendAt = ({
  delayValue,
  delayUnit,
  businessHoursTimeZone,
  from = new Date(),
}: {
  delayValue: number;
  delayUnit: SequenceDelayUnit;
  businessHoursTimeZone: string | null;
  from?: Date;
}): Date => {
  const target = new Date(
    from.getTime() + sequenceDelayToMs(delayValue, delayUnit),
  );

  if (!isNonEmptyString(businessHoursTimeZone)) {
    return target;
  }

  return clampToBusinessHours(target, businessHoursTimeZone);
};

export const computeNextBusinessDayStart = (
  timeZone: string | null,
  from = new Date(),
): Date => {
  if (!isNonEmptyString(timeZone)) {
    const tomorrow = new Date(from);

    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(BUSINESS_HOURS_START, 0, 0, 0);

    return tomorrow;
  }

  const wallClock = getZonedParts(from, timeZone);

  let next = {
    ...addDays(wallClock, 1),
    hour: BUSINESS_HOURS_START,
    minute: 0,
  };

  while (
    isWeekend(getZonedParts(zonedWallClockToUtc(next, timeZone), timeZone).weekday)
  ) {
    next = { ...addDays(next, 1), hour: BUSINESS_HOURS_START, minute: 0 };
  }

  return zonedWallClockToUtc(next, timeZone);
};
