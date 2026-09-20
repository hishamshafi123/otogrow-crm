import gql from 'graphql-tag';

export const GET_TELEGRAM_CONFIG = gql`
  query GetTelegramConfig {
    telegramConfig {
      id
      hasBotToken
      botTokenLastFour
      botUsername
      isActive
    }
  }
`;
