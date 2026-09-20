import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { BOOK_MEETING } from '@/meeting-booking/graphql/mutations/bookMeeting';
import { type BookMeetingResult } from '@/meeting-booking/types/BookMeetingResult';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type BookMeetingParams = {
  personId: string;
  startTime: string;
  durationMinutes: number;
};

// bookMeeting is a core-schema (@CoreResolver) operation, so it must go
// through the core Apollo client — the default client targets /metadata.
export const useBookMeeting = () => {
  const apolloCoreClient = useApolloCoreClient();
  const [loading, setLoading] = useState(false);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const bookMeeting = async ({
    personId,
    startTime,
    durationMinutes,
  }: BookMeetingParams): Promise<BookMeetingResult | null> => {
    setLoading(true);

    try {
      const result = await apolloCoreClient.mutate<{
        bookMeeting: BookMeetingResult;
      }>({
        mutation: BOOK_MEETING,
        variables: { input: { personId, startTime, durationMinutes } },
      });

      const booked = result.data?.bookMeeting;

      if (!isDefined(booked)) {
        throw new Error('No booking result returned');
      }

      enqueueSuccessSnackBar({
        message: t`Meeting booked`,
        options: isNonEmptyString(booked.meetLink)
          ? {
              detailedMessage: booked.meetLink,
              buttonLabel: t`Copy Meet link`,
              buttonOnClick: () => {
                navigator.clipboard.writeText(booked.meetLink ?? '');
              },
              duration: 15000,
            }
          : undefined,
      });

      return booked;
    } catch (error) {
      // The server exception filter masks errors behind a generic
      // userFriendlyMessage, so surface the real top-level error message
      // (e.g. "Connect your Google account in Settings → Accounts first").
      const serverMessage = CombinedGraphQLErrors.is(error)
        ? error.errors[0]?.message
        : undefined;

      enqueueErrorSnackBar(
        isNonEmptyString(serverMessage)
          ? { message: serverMessage }
          : {
              ...(CombinedGraphQLErrors.is(error)
                ? { apolloError: error }
                : {}),
            },
      );

      return null;
    } finally {
      setLoading(false);
    }
  };

  return { bookMeeting, loading };
};
