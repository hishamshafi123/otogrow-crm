import { gql } from '@apollo/client';

const RECEIPT = gql`
  fragment DeliveryClientSetupReceiptFields on DeliveryClientSetupReceipt {
    workspaceId
    memberId
    userWorkspaceId
    requestId
    companyId
    projectId
    engagementId
    taskId
    createdAt
    replayed
    reusedProject
    reusedEngagement
  }
`;
export const GET_CLIENT_SETUP = gql`
  query DeliveryClientSetup($input: DeliveryClientSetupContextInput!) {
    deliveryClientSetup(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      companySearch
      companies {
        id
        name
        sourceToken
      }
      companiesHasMore
      selectedCompany {
        id
        name
        sourceToken
      }
      projects {
        id
        name
        revision
        memberIds
      }
      members {
        id
        name
        access
      }
      servicePlans {
        id
        revision
        projectId
        name
        services
        billing
        scope
        allowance
        contact
        fields {
          id
          label
          required
        }
        advertising {
          managerId
          marketerId
          currency
          channel
          period
        }
      }
    }
  }
`;
export const CREATE_CLIENT_SETUP = gql`
  mutation CreateDeliveryClientSetup($input: DeliveryClientSetupCreateInput!) {
    createDeliveryClientSetup(input: $input) {
      ...DeliveryClientSetupReceiptFields
    }
  }
  ${RECEIPT}
`;
export const GET_CLIENT_SETUP_RECEIPT = gql`
  query DeliveryClientSetupReceipt($input: DeliveryClientSetupReceiptInput!) {
    deliveryClientSetupReceipt(input: $input) {
      ...DeliveryClientSetupReceiptFields
    }
  }
  ${RECEIPT}
`;
