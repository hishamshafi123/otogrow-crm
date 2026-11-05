import { Trans, useLingui } from '@lingui/react/macro';
import { type ContentSummary } from '@/delivery/content/content.types';

export const ContentTimestamp = ({
  value,
  timezone,
}: {
  value: string;
  timezone: string;
}) => {
  const { i18n } = useLingui();
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(value))}{' '}
      · {timezone}
    </time>
  );
};

export const ContentAttemptNotice = ({ post }: { post: ContentSummary }) => {
  if (
    !['RECORD_FAILED', 'RECORD_UNCERTAIN'].includes(
      post.lastAttemptAction ?? '',
    )
  )
    return null;
  return (
    <p>
      {post.lastAttemptAction === 'RECORD_UNCERTAIN' ? (
        <Trans>
          Publication is uncertain. Check the social account before attempting
          another post.
        </Trans>
      ) : (
        <Trans>
          The last manual posting attempt failed. Check the recorded issue
          before trying again.
        </Trans>
      )}
      {post.lastAttemptAt && (
        <>
          {' '}
          <ContentTimestamp
            value={post.lastAttemptAt}
            timezone={post.timezone}
          />
        </>
      )}
    </p>
  );
};
