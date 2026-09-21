import { gql } from '@apollo/client';

export const GET_MEETING_AVAILABILITY = gql`
  query MeetingAvailability($input: MeetingAvailabilityInput!) {
    meetingAvailability(input: $input) {
      timeZone
      slots {
        startTime
        endTime
      }
    }
  }
`;
