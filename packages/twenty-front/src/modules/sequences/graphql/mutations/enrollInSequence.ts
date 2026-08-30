import { gql } from '@apollo/client';

export const ENROLL_IN_SEQUENCE = gql`
  mutation EnrollInSequence($input: EnrollInSequenceInput!) {
    enrollInSequence(input: $input) {
      enrolledCount
      enrollmentIds
    }
  }
`;
