import { gql } from '@apollo/client';
import {
  ADVERTISING_ACTOR_FIELDS,
  ADVERTISING_SOURCE_FIELDS,
} from '@/delivery/advertising/workbench/delivery-advertising.graphql';

const AGENT = gql`
  fragment AdvertisingDraftAgentFields on DeliveryAdvertisingDraftAgent {
    id
    name
    version
    modelId
    maxOutputTokens
  }
`;
const SUMMARY = gql`
  fragment AdvertisingDraftRunSummaryFields on DeliveryAdvertisingDraftRunSummary {
    id
    requestId
    initiatorId
    initiatorName
    sourceKind
    sourceId
    projectId
    status
    revision
    createdAt
    startedAt
    finishedAt
    error
    agent {
      ...AdvertisingDraftAgentFields
    }
  }
  ${AGENT}
`;
const CONTEXT = gql`
  fragment AdvertisingDraftContextFields on DeliveryAdvertisingDraftContext {
    source {
      ...AdvertisingSourceFields
    }
    goal {
      kind
      metricKey
      metricAdId
      metricLabel
      provenance
      value
      evidence
      targetCostMicros
      metricProvenance
      metricReason
      metricUnit
      currency
      fromDate
      throughDate
      timezone
      sourceFingerprint
    }
    metrics {
      key
      label
      unit
      goalKinds
      value
      provenance
      reason
    }
    knowledge {
      fingerprint
      totalSources
      omittedSources
      sources {
        sourceId
        version
        title
        category
        meetingDate
        knowledge
        truncated
      }
    }
    references {
      id
      kind
      label
      sourceId
      version
      value
      unit
      href
    }
    instructions
    assistantInstructions
    coverage
    limitations
    promptVersion
    outputVersion
  }
  ${ADVERTISING_SOURCE_FIELDS}
`;
const RECEIPT = gql`
  fragment AdvertisingDraftReceiptFields on DeliveryAdvertisingDraftCommandReceipt {
    action
    requestId
    runId
    actorId
    userWorkspaceId
    inputHash
    bodyFingerprint
    createdAt
    revision
    status
  }
`;
export const GET_ADVERTISING_DRAFT_PREVIEW = gql`
  query DeliveryAdvertisingDraftPreview(
    $input: DeliveryAdvertisingDraftPreviewInput!
  ) {
    deliveryAdvertisingDraftPreview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      bodyFingerprint
      contextFingerprint
      sourceFingerprint
      knowledgeFingerprint
      agent {
        ...AdvertisingDraftAgentFields
      }
      context {
        ...AdvertisingDraftContextFields
      }
      budget {
        maximumCostUsd
        pricingRevision
        budgetReady
        blockedReason
        boundSource
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${AGENT}
  ${CONTEXT}
`;
export const GET_ADVERTISING_DRAFT_RUNS = gql`
  query DeliveryAdvertisingDraftRuns(
    $input: DeliveryAdvertisingDraftRunsInput!
  ) {
    deliveryAdvertisingDraftRuns(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      totalCount
      nextCursor
      scope
      items {
        ...AdvertisingDraftRunSummaryFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${SUMMARY}
`;
export const GET_ADVERTISING_DRAFT_RUN_STATE = gql`
  query DeliveryAdvertisingDraftRunState(
    $input: DeliveryAdvertisingDraftRunInput!
  ) {
    deliveryAdvertisingDraftRunState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      currentSourceFingerprint
      canUseResult
      canCancel
      blockingReasons
      run {
        ...AdvertisingDraftRunSummaryFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${SUMMARY}
`;
export const GET_ADVERTISING_DRAFT_RUN = gql`
  query DeliveryAdvertisingDraftRun($input: DeliveryAdvertisingDraftRunInput!) {
    deliveryAdvertisingDraftRun(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      currentSourceFingerprint
      canUseResult
      canCancel
      blockingReasons
      run {
        id
        requestId
        initiatorId
        initiatorName
        sourceKind
        sourceId
        projectId
        status
        revision
        createdAt
        startedAt
        finishedAt
        error
        bodyFingerprint
        contextFingerprint
        agent {
          ...AdvertisingDraftAgentFields
        }
        context {
          ...AdvertisingDraftContextFields
        }
        usage {
          inputTokens
          outputTokens
          costUsd
        }
        result {
          summary
          limitations
          citations
          noChangeReason
          suggestions {
            id
            title
            rationale
            expectedResult
            evidence
            citations
          }
        }
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${AGENT}
  ${CONTEXT}
`;
export const GET_ADVERTISING_DRAFT_REQUEST = gql`
  query DeliveryAdvertisingDraftRequest(
    $input: DeliveryAdvertisingDraftRequestInput!
  ) {
    deliveryAdvertisingDraftRequest(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingDraftReceiptFields
      }
      run {
        ...AdvertisingDraftRunSummaryFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${RECEIPT}
  ${SUMMARY}
`;
export const START_ADVERTISING_DRAFT = gql`
  mutation StartDeliveryAdvertisingDraft(
    $input: StartDeliveryAdvertisingDraftInput!
  ) {
    startDeliveryAdvertisingDraft(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingDraftReceiptFields
      }
      run {
        ...AdvertisingDraftRunSummaryFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${RECEIPT}
  ${SUMMARY}
`;
export const CANCEL_ADVERTISING_DRAFT = gql`
  mutation CancelDeliveryAdvertisingDraft(
    $input: CancelDeliveryAdvertisingDraftInput!
  ) {
    cancelDeliveryAdvertisingDraft(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingDraftReceiptFields
      }
      run {
        ...AdvertisingDraftRunSummaryFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${RECEIPT}
  ${SUMMARY}
`;
