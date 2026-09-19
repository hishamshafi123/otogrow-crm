import gql from 'graphql-tag';

export const GET_TWILIO_CONFIG = gql`
  query GetTwilioConfig {
    twilioConfig {
      id
      accountSid
      hasAuthToken
      authTokenLastFour
      whatsappSenderNumber
      smsNumber
      voiceNumber
      callingEnabled
      isActive
    }
  }
`;
