import gql from 'graphql-tag';

export const PROVISION_TWILIO_CALLING = gql`
  mutation ProvisionTwilioCalling {
    provisionTwilioCalling {
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
