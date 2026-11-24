import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_V2 = gql`
  query DeliveryFinanceV2($input: JSON) {
    deliveryFinanceV2(input: $input)
  }
`;

export const CHANGE_DELIVERY_FINANCE_V2 = gql`
  mutation ChangeDeliveryFinanceV2($input: JSON!) {
    changeDeliveryFinanceV2(input: $input)
  }
`;
