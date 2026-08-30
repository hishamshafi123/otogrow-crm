import { gql } from '@apollo/client';

export const SEQUENCE_ANALYTICS = gql`
  query SequenceAnalytics($sequenceId: UUID!) {
    sequenceAnalytics(sequenceId: $sequenceId) {
      sequenceId
      totalEnrollments
      activeCount
      repliedCount
      unsubscribedCount
      bouncedCount
      completedCount
      removedCount
      errorCount
      sentCount
    }
  }
`;
