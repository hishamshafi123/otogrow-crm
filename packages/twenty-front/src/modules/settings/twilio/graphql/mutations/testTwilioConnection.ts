import gql from 'graphql-tag';

export const TEST_TWILIO_CONNECTION = gql`
  mutation TestTwilioConnection {
    testTwilioConnection
  }
`;
