import { gql } from '@apollo/client';

export const UNENROLL_FROM_SEQUENCE = gql`
  mutation UnenrollFromSequence($input: UnenrollFromSequenceInput!) {
    unenrollFromSequence(input: $input) {
      unenrolledCount
    }
  }
`;
