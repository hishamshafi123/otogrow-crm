import { Trans, useLingui } from '@lingui/react/macro';
import { contentMonthWindow } from '@/delivery/content/content-dates';
import {
  StyledContentAgenda,
  StyledContentCalendar,
  StyledContentDay,
  StyledContentItem,
} from '@/delivery/content/contentStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ContentCalendarProps = {
  month: string;
  timezone: string;
  days: { date: string; count: number }[];
  totalCount: number;
  onSelectDate: (date: string) => void;
};
export const ContentCalendar = ({
  month,
  timezone,
  days,
  totalCount,
  onSelectDate,
}: ContentCalendarProps) => {
  const { t } = useLingui();
  const range = contentMonthWindow(month, timezone);
  if (!range)
    return (
      <p role="alert">
        <Trans>Choose a valid month and time zone.</Trans>
      </p>
    );
  const counts = new Map(days.map((day) => [day.date, day.count]));
  const occupied = range.dates.filter((date) => (counts.get(date) ?? 0) > 0);
  return (
    <StyledDeliveryStack>
      <p>
        {t`${totalCount} posts by planned date in this calendar range`} ·{' '}
        {timezone}
      </p>
      <p>
        <Trans>
          Dates are plans for manual posting. No social platform schedule is
          connected.
        </Trans>
      </p>
      <StyledContentCalendar
        role="group"
        aria-label={t`Planned publication calendar`}
      >
        {[t`Mon`, t`Tue`, t`Wed`, t`Thu`, t`Fri`, t`Sat`, t`Sun`].map(
          (day, index) => (
            <strong key={index}>{day}</strong>
          ),
        )}
        {Array.from({ length: range.firstWeekday - 1 }, (_, index) => (
          <span key={`empty:${index}`} aria-hidden="true" />
        ))}
        {range.dates.map((date) => {
          const count = counts.get(date) ?? 0;
          return (
            <StyledContentDay
              key={date}
              type="button"
              aria-label={t`${date}: ${count} posts by planned date`}
              data-has-posts={count > 0 ? 'true' : undefined}
              onClick={() => onSelectDate(date)}
            >
              <strong>{Number(date.slice(-2))}</strong>
              <span>{t`${count} posts`}</span>
            </StyledContentDay>
          );
        })}
      </StyledContentCalendar>
      <StyledContentAgenda
        role="group"
        aria-label={t`Planned publication agenda`}
      >
        {occupied.map((date) => (
          <StyledContentItem key={date}>
            <StyledDeliveryButton
              type="button"
              onClick={() => onSelectDate(date)}
            >
              {date} · {t`${counts.get(date) ?? 0} posts by planned date`}
            </StyledDeliveryButton>
          </StyledContentItem>
        ))}
      </StyledContentAgenda>
      {!totalCount && (
        <p>
          <Trans>
            No posts match this range. Prepare a variant or choose another
            month.
          </Trans>
        </p>
      )}
    </StyledDeliveryStack>
  );
};
