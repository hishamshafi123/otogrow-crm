import { gql } from '@apollo/client';

export const KNOWLEDGE_ASSET_FIELDS = gql`
  fragment KnowledgeAssetFields on DeliveryKnowledgeAsset {
    id
    name
    mimeType
    size
    sha256
    uploadedBy
    createdAt
  }
`;
export const KNOWLEDGE_UPLOAD_FIELDS = gql`
  fragment KnowledgeUploadFields on DeliveryKnowledgeUploadReceipt {
    id
    requestId
    workspaceId
    projectId
    sourceId
    companyId
    sourceRevision
    name
    mimeType
    size
    sha256
    uploadedBy
    uploaderUserWorkspaceId
    createdAt
    state
    failureReason
    canRecover
    canDiscard
    cleanupPending
    availability
    canAttach
  }
`;
export const KNOWLEDGE_UPLOAD_RESULT = gql`
  ${KNOWLEDGE_UPLOAD_FIELDS}
  fragment KnowledgeUploadResult on DeliveryKnowledgeUploadResult {
    workspaceId
    memberId
    userWorkspaceId
    projectId
    sourceId
    receipt {
      ...KnowledgeUploadFields
    }
  }
`;
export const GET_KNOWLEDGE_UPLOAD = gql`
  ${KNOWLEDGE_UPLOAD_RESULT}
  query DeliveryKnowledgeUpload($input: DeliveryKnowledgeUploadInput!) {
    deliveryKnowledgeUpload(input: $input) {
      ...KnowledgeUploadResult
    }
  }
`;
export const RECOVER_KNOWLEDGE_UPLOAD = gql`
  ${KNOWLEDGE_UPLOAD_RESULT}
  mutation RecoverDeliveryKnowledgeUpload(
    $input: DeliveryKnowledgeUploadInput!
  ) {
    recoverDeliveryKnowledgeUpload(input: $input) {
      ...KnowledgeUploadResult
    }
  }
`;
export const DISCARD_KNOWLEDGE_UPLOAD = gql`
  ${KNOWLEDGE_UPLOAD_RESULT}
  mutation DiscardDeliveryKnowledgeUpload(
    $input: DeliveryKnowledgeUploadInput!
  ) {
    discardDeliveryKnowledgeUpload(input: $input) {
      ...KnowledgeUploadResult
    }
  }
`;
export const GET_KNOWLEDGE_UPLOADS = gql`
  ${KNOWLEDGE_UPLOAD_FIELDS}
  query DeliveryKnowledgeUploads($input: DeliveryKnowledgeUploadsInput!) {
    deliveryKnowledgeUploads(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      projectId
      items {
        ...KnowledgeUploadFields
      }
      nextCursor
    }
  }
`;
