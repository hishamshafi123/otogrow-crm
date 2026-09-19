import gql from 'graphql-tag';

export const GENERATE_TWILIO_VOICE_TOKEN = gql`
  mutation GenerateTwilioVoiceToken {
    generateTwilioVoiceToken
  }
`;
