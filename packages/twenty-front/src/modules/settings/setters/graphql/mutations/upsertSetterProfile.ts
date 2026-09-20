import gql from 'graphql-tag';

export const UPSERT_SETTER_PROFILE = gql`
  mutation UpsertSetterProfile($input: UpsertSetterProfileInput!) {
    upsertSetterProfile(input: $input) {
      id
      workspaceMemberId
      isSetter
      activeDays
      activeStartHour
      activeEndHour
      dailyLeadCap
      hasTelegramChatId
    }
  }
`;
