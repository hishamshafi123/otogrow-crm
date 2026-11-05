import { Temporal } from 'temporal-polyfill';
import { isDateWithoutTime } from 'twenty-shared/utils';

export const contentTimezoneValid = (timezone: string) => {
  if (!timezone || /^[+-]/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const contentPlannedInstant = (
  localDateTime: string,
  timezone: string,
) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime) ||
    !contentTimezoneValid(timezone)
  )
    return null;
  try {
    return Temporal.PlainDateTime.from(localDateTime)
      .toZonedDateTime(timezone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  } catch {
    return null;
  }
};

export const contentLocalDateTime = (instant: string, timezone: string) => {
  if (!contentTimezoneValid(timezone)) return null;
  try {
    return Temporal.Instant.from(instant)
      .toZonedDateTimeISO(timezone)
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' });
  } catch {
    return null;
  }
};

export const contentDayWindow = (date: string, timezone: string) => {
  if (!isDateWithoutTime(date) || !contentTimezoneValid(timezone)) return null;
  try {
    const start = Temporal.PlainDate.from(date);
    return {
      from: start.toZonedDateTime(timezone).toInstant().toString(),
      to: start
        .add({ days: 1 })
        .toZonedDateTime(timezone)
        .toInstant()
        .toString(),
    };
  } catch {
    return null;
  }
};

export const contentMonthWindow = (month: string, timezone: string) => {
  if (!/^\d{4}-\d{2}$/.test(month) || !contentTimezoneValid(timezone))
    return null;
  try {
    const current = Temporal.PlainYearMonth.from(month);
    const start = current.toPlainDate({ day: 1 });
    return {
      from: start.toZonedDateTime(timezone).toInstant().toString(),
      to: current
        .add({ months: 1 })
        .toPlainDate({ day: 1 })
        .toZonedDateTime(timezone)
        .toInstant()
        .toString(),
      firstWeekday: start.dayOfWeek,
      dates: Array.from({ length: current.daysInMonth }, (_, index) =>
        start.add({ days: index }).toString(),
      ),
    };
  } catch {
    return null;
  }
};
