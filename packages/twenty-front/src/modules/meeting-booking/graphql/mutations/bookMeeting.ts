import { gql } from '@apollo/client';

export const BOOK_MEETING = gql`
  mutation BookMeeting($input: BookMeetingInput!) {
    bookMeeting(input: $input) {
      eventId
      meetLink
      htmlLink
    }
  }
`;
