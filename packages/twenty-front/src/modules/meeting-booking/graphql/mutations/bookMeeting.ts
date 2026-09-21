import { gql } from '@apollo/client';

export const BOOK_MEETING = gql`
  mutation BookMeeting($input: BookMeetingInput!) {
    bookMeeting(input: $input) {
      warning
      eventId
      meetLink
      htmlLink
    }
  }
`;
