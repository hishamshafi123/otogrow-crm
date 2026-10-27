import { gql } from '@apollo/client';

export const GET_DELIVERY_KNOWLEDGE = gql`
  query DeliveryKnowledge($input: DeliveryKnowledgeInput!) {
    deliveryKnowledge(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canPublish
      nextCursor
      items {
        id
        revision
        title
        category
        meetingDate
        version
        publishedVersion
        publishedAt
        createdBy
        canEdit
      }
      detail {
        id
        revision
        title
        category
        meetingDate
        version
        currentVersion
        publishedVersion
        publishedAt
        createdBy
        canEdit
        sourceUrl
        transcript
        knowledge
      }
    }
  }
`;
export const SAVE_DELIVERY_KNOWLEDGE = gql`
  mutation SaveDeliveryKnowledge($input: DeliveryKnowledgeSaveInput!) {
    saveDeliveryKnowledge(input: $input)
  }
`;
export const PUBLISH_DELIVERY_KNOWLEDGE = gql`
  mutation PublishDeliveryKnowledge($input: DeliveryKnowledgePublishInput!) {
    publishDeliveryKnowledge(input: $input)
  }
`;
