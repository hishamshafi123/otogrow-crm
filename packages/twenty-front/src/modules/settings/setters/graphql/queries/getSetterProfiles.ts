import gql from 'graphql-tag';

export const GET_SETTER_PROFILES = gql`
  query GetSetterProfiles {
    setterProfiles {
      id
      workspaceMemberId
      memberName
      memberEmail
      isSetter
      activeDays
      activeStartHour
      activeEndHour
      dailyLeadCap
      hasTelegramChatId
    }
  }
`;
