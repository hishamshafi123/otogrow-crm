import { gql } from '@apollo/client';
export const GET_CAPACITY = gql`
  query DeliveryCapacity($input: DeliveryCapacityInput!) {
    deliveryCapacity(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      startDate
      availability {
        memberId
        date
        minutes
        revision
      }
    }
  }
`;
export const SAVE_AVAILABILITY = gql`
  mutation SaveDeliveryAvailability($input: DeliveryAvailabilityInput!) {
    saveDeliveryAvailability(input: $input) {
      memberId
      date
      minutes
      revision
    }
  }
`;
