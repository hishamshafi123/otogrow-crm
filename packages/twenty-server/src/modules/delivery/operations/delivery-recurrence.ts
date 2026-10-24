import { type Recurrence } from 'src/modules/delivery/operations/delivery-operations.types';

export const localCalendar = (now: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
};
const moveDate = (value: string, days: number) =>
  new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const latestRecurrence = (
  template: Recurrence,
  timezone: string,
  now: Date,
) => {
  if (template.paused) return null;
  const local = localCalendar(now, timezone);
  let cursor =
    local.time >= template.time ? local.date : moveDate(local.date, -1);
  if (template.endDate && cursor > template.endDate) cursor = template.endDate;
  let latest: string | null = null;
  let count = 0;
  // A date identity avoids duplicate work during a repeated DST hour; a skipped hour runs at the next tick.
  for (
    let days = 0;
    days < 36600 &&
    cursor >= template.startDate &&
    (!template.lastDate || cursor > template.lastDate);
    days++, cursor = moveDate(cursor, -1)
  ) {
    const date = new Date(`${cursor}T12:00:00Z`);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const matches =
      template.frequency === 'DAILY' ||
      (template.frequency === 'WEEKLY' &&
        template.weekdays.includes(date.getUTCDay())) ||
      (template.frequency === 'MONTHLY' &&
        date.getUTCDate() === Math.min(template.monthDay, lastDay));
    if (matches) {
      latest ??= cursor;
      count++;
    }
  }
  return latest ? { date: latest, skipped: count - 1 } : null;
};
