import { gql } from '@apollo/client';

export const GET_DELIVERY_WORKSPACE = gql`
  query DeliveryWorkspace {
    deliveryWorkspace
  }
`;
