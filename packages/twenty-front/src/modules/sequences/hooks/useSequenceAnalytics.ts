import { useQuery } from '@apollo/client/react';

import { SEQUENCE_ANALYTICS } from '@/sequences/graphql/queries/sequenceAnalytics';
import {
  type SequenceAnalyticsQuery,
  type SequenceAnalyticsQueryVariables,
} from '~/generated-metadata/graphql';

export const useSequenceAnalytics = ({
  sequenceId,
}: {
  sequenceId: string;
}) => {
  const { data, loading } = useQuery<
    SequenceAnalyticsQuery,
    SequenceAnalyticsQueryVariables
  >(SEQUENCE_ANALYTICS, {
    variables: { sequenceId },
  });

  return { analytics: data?.sequenceAnalytics, loading };
};
