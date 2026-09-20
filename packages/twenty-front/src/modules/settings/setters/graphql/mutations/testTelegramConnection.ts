import gql from 'graphql-tag';

export const TEST_TELEGRAM_CONNECTION = gql`
  mutation TestTelegramConnection {
    testTelegramConnection
  }
`;
