import { gql } from '@apollo/client';

export const GET_CLIENT_HUB = gql`
  query DeliveryClientHub {
    deliveryClientHub
  }
`;

export const GET_CLIENT_DIRECTORY_CANDIDATES = gql`
  query DeliveryClientDirectoryCandidates($search: String) {
    deliveryClientDirectoryCandidates(search: $search)
  }
`;

export const UPDATE_CLIENT_ROSTER = gql`
  mutation UpdateDeliveryClientRoster($input: JSON!) {
    updateDeliveryClientRoster(input: $input)
  }
`;

export const CHANGE_CLIENT_BUSINESS = gql`
  mutation ChangeDeliveryBusinessFromClient($input: JSON!) {
    changeDeliveryBusiness(input: $input)
  }
`;
