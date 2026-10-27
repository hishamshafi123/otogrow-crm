import { gql } from '@apollo/client';
export const GET_HANDOFFS = gql`
  query DeliveryHandoffs($search: String) {
    deliveryHandoffs(search: $search) {
      workspaceId
      memberId
      userWorkspaceId
      search
      hasMore
      opportunities {
        id
        name
        hasCompany
        quotes {
          id
          name
        }
      }
      handoffs {
        id
        opportunityId
        projectId
        engagementId
        managerId
        reviewerId
        setupTaskIds
        createdAt
      }
    }
  }
`;
export const GET_HANDOFF_PREVIEW = gql`
  query DeliveryHandoffPreview($input: DeliveryHandoffPreviewInput!) {
    deliveryHandoffPreview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      source {
        opportunityId
        opportunityName
        companyId
        companyName
        quoteId
        quoteNumber
        scope
        fingerprint
        totalAmountMicros
        currency
      }
    }
  }
`;
export const CREATE_HANDOFF = gql`
  mutation CreateDeliveryHandoff($input: DeliveryHandoffCreateInput!) {
    createDeliveryHandoff(input: $input) {
      id
      opportunityId
      projectId
      engagementId
      managerId
      reviewerId
      setupTaskIds
      createdAt
    }
  }
`;
