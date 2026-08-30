import gql from 'graphql-tag';

export const UPSERT_TWILIO_CONFIG = gql`
  mutation UpsertTwilioConfig($input: UpsertTwilioConfigInput!) {
    upsertTwilioConfig(input: $input) {
      id
      accountSid
      hasAuthToken
      authTokenLastFour
      whatsappSenderNumber
      smsNumber
      isActive
    }
  }
`;
