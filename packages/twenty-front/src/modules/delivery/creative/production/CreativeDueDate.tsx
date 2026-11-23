import { Trans } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { detectTimeZone } from '@/localization/utils/detection/detectTimeZone';

type CreativeDueDateProps = {
  value: string | null;
};

export const CreativeDueDate = ({ value }: CreativeDueDateProps) => {
  const [params] = useSearchParams();
  if (!value) return <Trans>No due date</Trans>;
  const requestedTimezone = params.get('taskTimezone') ?? detectTimeZone();
  const date = new Date(value);
  let timezone = requestedTimezone;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: requestedTimezone });
  } catch {
    timezone = 'UTC';
  }
  return (
    <>
      <time dateTime={value}>
        {date.toLocaleString(undefined, {
          timeZone: timezone,
          timeZoneName: 'short',
        })}
      </time>
      {timezone !== requestedTimezone && (
        <small>
          <Trans>
            The calendar timezone is invalid. This due time uses UTC.
          </Trans>
        </small>
      )}
    </>
  );
};
