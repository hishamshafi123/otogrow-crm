import { gql } from '@apollo/client';
const VIDEO_QA_ACTOR = gql`
  fragment VideoQaActor on DeliveryCreativeActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;
const VIDEO_QA_ASSET = gql`
  fragment VideoQaAsset on DeliveryVideoQaAsset {
    id
    name
    mimeType
    size
    sha256
    briefVersion
    productionVersion
    assemblyVersion
    shotId
    shotVersion
  }
`;
const VIDEO_QA_PREPARATION = gql`
  fragment VideoQaPreparation on DeliveryVideoQaPreparation {
    pipelineVersion
    durationMs
    width
    height
    hasAudio
    audioChannels
    proxySha256
    proxyBytes
    samplingIntervalMs
    limitations
    frames {
      index
      atMs
      sha256
      size
    }
    technicalFindings {
      code
      startMs
      endMs
      evidence
    }
  }
`;
const VIDEO_QA_PREVIEW = gql`
  ${VIDEO_QA_ACTOR}
  ${VIDEO_QA_ASSET}
  ${VIDEO_QA_PREPARATION}
  fragment VideoQaPreview on DeliveryVideoQaPreview {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    scope
    actor {
      ...VideoQaActor
    }
    taskId
    taskRevision
    projectId
    creativeVersion
    briefVersion
    brief {
      outputKind
      objective
      audience
      painPoint
      angle
      concept
      productFacts
      mandatoryClaims
      visualDirection
      format
      duration
      hook
      cta
      music
      brandAssets
    }
    asset {
      ...VideoQaAsset
    }
    references {
      ...VideoQaAsset
    }
    modelId
    manualTranscript
    sourceFingerprint
    preparationFingerprint
    preparation {
      ...VideoQaPreparation
    }
    maximumCostUsd
    pricingRevision
    budgetReady
    blockedReason
  }
`;
const VIDEO_QA_STATE = gql`
  ${VIDEO_QA_ACTOR}
  fragment VideoQaState on DeliveryVideoQaState {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    scope
    actor {
      ...VideoQaActor
    }
    taskId
    taskRevision
    runId
    status
    createdAt
    updatedAt
    error
    sourceCurrent
    canCancel
    assetId
    briefVersion
  }
`;
const VIDEO_QA_RECEIPT = gql`
  ${VIDEO_QA_ACTOR}
  fragment VideoQaReceipt on DeliveryVideoQaReceipt {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    scope
    actor {
      ...VideoQaActor
    }
    taskId
    runId
    requestId
    inputHash
    action
    status
    createdAt
  }
`;
export const GET_VIDEO_QA_PREVIEW = gql`
  ${VIDEO_QA_PREVIEW}
  query DeliveryVideoQaPreview($input: DeliveryVideoQaPreviewInput!) {
    deliveryVideoQaPreview(input: $input) {
      ...VideoQaPreview
    }
  }
`;
export const GET_VIDEO_QA_STATE = gql`
  ${VIDEO_QA_STATE}
  query DeliveryVideoQaState($input: DeliveryVideoQaSelectionInput!) {
    deliveryVideoQaState(input: $input) {
      ...VideoQaState
    }
  }
`;
export const GET_VIDEO_QA_RUN = gql`
  ${VIDEO_QA_PREVIEW}
  ${VIDEO_QA_ACTOR}
  query DeliveryVideoQaRun($input: DeliveryVideoQaSelectionInput!) {
    deliveryVideoQaRun(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...VideoQaActor
      }
      taskId
      taskRevision
      runId
      status
      createdAt
      updatedAt
      error
      sourceCurrent
      canCancel
      assetId
      briefVersion
      completedAt
      input {
        ...VideoQaPreview
      }
      result {
        summary
        limitations
        transcript {
          startMs
          endMs
          text
        }
        visibleText {
          startMs
          endMs
          text
        }
        findings {
          category
          severity
          startMs
          endMs
          frameIndexes
          referenceAssetIds
          evidence
          correction
          uncertainty
        }
      }
    }
  }
`;
export const GET_VIDEO_QA_RECEIPT = gql`
  ${VIDEO_QA_RECEIPT}
  query DeliveryVideoQaReceipt($input: DeliveryVideoQaReceiptInput!) {
    deliveryVideoQaReceipt(input: $input) {
      ...VideoQaReceipt
    }
  }
`;
export const START_VIDEO_QA = gql`
  ${VIDEO_QA_RECEIPT}
  mutation StartDeliveryVideoQa($input: DeliveryVideoQaStartInput!) {
    startDeliveryVideoQa(input: $input) {
      ...VideoQaReceipt
    }
  }
`;
export const CANCEL_VIDEO_QA = gql`
  ${VIDEO_QA_RECEIPT}
  mutation CancelDeliveryVideoQa($input: DeliveryVideoQaCancelInput!) {
    cancelDeliveryVideoQa(input: $input) {
      ...VideoQaReceipt
    }
  }
`;
