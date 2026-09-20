import gql from 'graphql-tag';

export const UPSERT_TELEGRAM_CONFIG = gql`
  mutation UpsertTelegramConfig($input: UpsertTelegramConfigInput!) {
    upsertTelegramConfig(input: $input) {
      id
      hasBotToken
      botTokenLastFour
      botUsername
      isActive
    }
  }
`;
