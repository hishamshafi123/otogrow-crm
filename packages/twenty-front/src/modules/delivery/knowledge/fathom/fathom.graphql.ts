import { gql } from '@apollo/client';

const FATHOM_ACTOR = gql`
  fragment FathomActor on DeliveryKnowledgeReadActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;
const FATHOM_SETTINGS = gql`
  fragment FathomSettings on DeliveryFathomSettings {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    actor {
      ...FathomActor
    }
    revision
    enabled
    credentialConfigured
  }
  ${FATHOM_ACTOR}
`;
export const GET_FATHOM_SETTINGS = gql`
  query DeliveryFathomSettings {
    deliveryFathomSettings {
      ...FathomSettings
    }
  }
  ${FATHOM_SETTINGS}
`;
export const SAVE_FATHOM_SETTINGS = gql`
  mutation SaveDeliveryFathomSettings($input: DeliveryFathomSettingsInput!) {
    saveDeliveryFathomSettings(input: $input) {
      ...FathomSettings
    }
  }
  ${FATHOM_SETTINGS}
`;
export const FIND_FATHOM_MEETINGS = gql`
  mutation FindDeliveryFathomMeetings($input: DeliveryFathomMeetingsInput!) {
    findDeliveryFathomMeetings(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...FathomActor
      }
      projectId
      sourceId
      connectionRevision
      nextCursor
      scannedCount
      items {
        recordingId
        title
        recordedAt
        sourceUrl
        proof
      }
    }
  }
  ${FATHOM_ACTOR}
`;
export const PREVIEW_FATHOM_TRANSCRIPT = gql`
  mutation PreviewDeliveryFathomTranscript(
    $input: DeliveryFathomPreviewInput!
  ) {
    previewDeliveryFathomTranscript(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...FathomActor
      }
      projectId
      sourceId
      connectionRevision
      meeting {
        recordingId
        title
        recordedAt
        sourceUrl
        proof
      }
      transcript
      segmentCount
      proof
      proofHash
      expiresAt
      existingSourceId
    }
  }
  ${FATHOM_ACTOR}
`;
