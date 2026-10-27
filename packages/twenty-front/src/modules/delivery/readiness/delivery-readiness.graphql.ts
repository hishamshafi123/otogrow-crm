import { gql } from '@apollo/client';
export const GET_DELIVERY_READINESS = gql`
  query DeliveryReadiness {
    deliveryReadiness {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      items {
        id
        capability
        accountName
        status
        reason
        destination
        lastSuccessAt
      }
    }
  }
`;
