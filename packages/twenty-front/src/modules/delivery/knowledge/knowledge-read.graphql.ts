import { gql } from '@apollo/client';

const KNOWLEDGE_ACTOR = gql`
  fragment KnowledgeReadActor on DeliveryKnowledgeReadActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;

export const GET_KNOWLEDGE_CONTEXT = gql`
  query DeliveryKnowledgeContext($input: DeliveryKnowledgeContextInput!) {
    deliveryKnowledgeContext(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canPublish
      actor {
        ...KnowledgeReadActor
      }
      selectedProject {
        id
        name
        revision
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
export const GET_KNOWLEDGE_PROJECTS = gql`
  query DeliveryKnowledgeProjects($input: DeliveryKnowledgeProjectsInput!) {
    deliveryKnowledgeProjects(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      totalCount
      nextCursor
      scope
      actor {
        ...KnowledgeReadActor
      }
      items {
        id
        name
        revision
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
const KNOWLEDGE_ITEM = gql`
  fragment KnowledgeReadItem on DeliveryKnowledgeItem {
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
`;
export const GET_KNOWLEDGE_LIST = gql`
  query DeliveryKnowledgeList($input: DeliveryKnowledgeListInput!) {
    deliveryKnowledgeList(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      totalCount
      nextCursor
      scope
      actor {
        ...KnowledgeReadActor
      }
      project {
        id
        name
        revision
      }
      items {
        ...KnowledgeReadItem
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
  ${KNOWLEDGE_ITEM}
`;
export const GET_KNOWLEDGE_STATE = gql`
  query DeliveryKnowledgeState($input: DeliveryKnowledgeSelectionInput!) {
    deliveryKnowledgeState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canPublish
      actor {
        ...KnowledgeReadActor
      }
      project {
        id
        name
        revision
      }
      source {
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
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
export const GET_KNOWLEDGE_DETAIL = gql`
  query DeliveryKnowledgeDetail($input: DeliveryKnowledgeSelectionInput!) {
    deliveryKnowledgeDetail(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canPublish
      actor {
        ...KnowledgeReadActor
      }
      project {
        id
        name
        revision
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
        fathomProvenance {
          provider
          recordingId
          title
          recordedAt
          sourceUrl
          importedAt
          importedBy
          proofHash
          segmentCount
          humanEdited
        }
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
export const SAVE_KNOWLEDGE_SOURCE = gql`
  mutation SaveDeliveryKnowledgeSource($input: DeliveryKnowledgeSaveInput!) {
    saveDeliveryKnowledgeSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canPublish
      actor {
        ...KnowledgeReadActor
      }
      project {
        id
        name
        revision
      }
      source {
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
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
export const PUBLISH_KNOWLEDGE_SOURCE = gql`
  mutation PublishDeliveryKnowledgeSource(
    $input: DeliveryKnowledgePublishInput!
  ) {
    publishDeliveryKnowledgeSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canPublish
      actor {
        ...KnowledgeReadActor
      }
      project {
        id
        name
        revision
      }
      source {
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
      }
    }
  }
  ${KNOWLEDGE_ACTOR}
`;
