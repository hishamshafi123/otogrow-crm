import gql from 'graphql-tag';

export const DELETE_TWILIO_CONFIG = gql`
  mutation DeleteTwilioConfig {
    deleteTwilioConfig {
      id
    }
  }
`;
