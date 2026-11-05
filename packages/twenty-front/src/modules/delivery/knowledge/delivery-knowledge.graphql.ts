import { gql } from '@apollo/client';
import { KNOWLEDGE_ASSET_FIELDS } from '@/delivery/knowledge/assets/knowledge-assets.graphql';

export const GET_DELIVERY_KNOWLEDGE = gql`
  ${KNOWLEDGE_ASSET_FIELDS}
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
        attachments {
          ...KnowledgeAssetFields
        }
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
