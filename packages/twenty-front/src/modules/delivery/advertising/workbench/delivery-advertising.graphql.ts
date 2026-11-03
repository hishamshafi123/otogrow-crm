import { gql } from '@apollo/client';

export const ADVERTISING_ACTOR_FIELDS = gql`
  fragment AdvertisingActorFields on DeliveryTaskActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;
export const ADVERTISING_SOURCE_FIELDS = gql`
  fragment AdvertisingSourceFields on DeliveryAdvertisingSourceSnapshot {
    kind
    id
    fingerprint
    evidenceFingerprint
    sourceRevision
    legacyTaskId
    title
    projectId
    companyId
    engagementId
    accountId
    clientProvenance
    channel
    currency
    fromDate
    throughDate
    timezone
    spendMicros
    sourceStatus
    routing {
      projectId
      projectRevision
      companyId
      engagementId
      managerId
      marketerId
    }
  }
`;
export const ADVERTISING_TASK_FIELDS = gql`
  fragment AdvertisingTaskFields on DeliveryAdvertisingTask {
    id
    title
    revision
    state
    ownerId
    ownerName
    reviewerId
    reviewerName
    dueAt
    submissionVersion
    submissionState
    evidence {
      url
      label
    }
  }
`;
const ADVERTISING_RECEIPT_FIELDS = gql`
  fragment AdvertisingReceiptFields on DeliveryAdvertisingCommandReceipt {
    requestId
    reviewId
    action
    actorId
    createdAt
    revision
    state
    observationId
    actionTasks {
      actionId
      taskId
    }
  }
`;
export const GET_ADVERTISING_CONTEXT = gql`
  query DeliveryAdvertisingContext {
    deliveryAdvertisingContext {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canManage
      actor {
        ...AdvertisingActorFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_ADVERTISING_REVIEWS = gql`
  query DeliveryAdvertisingReviews($input: DeliveryAdvertisingReviewsInput!) {
    deliveryAdvertisingReviews(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      totalCount
      nextCursor
      currentDraftId
      actor {
        ...AdvertisingActorFields
      }
      items {
        id
        revision
        state
        createdAt
        assignedAt
        actionCount
        goalKind
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_ADVERTISING_REVIEW = gql`
  query DeliveryAdvertisingReview($input: DeliveryAdvertisingReviewInput!) {
    deliveryAdvertisingReview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canEdit
      canAssign
      blockingReasons
      currentSourceFingerprint
      actor {
        ...AdvertisingActorFields
      }
      review {
        id
        revision
        state
        note
        noChangeReason
        createdBy
        assignedBy
        assignedAt
        createdAt
        legacyHandling {
          mode
          taskId
          taskRevision
          taskState
          reason
        }
        source {
          ...AdvertisingSourceFields
        }
        goal {
          kind
          metricKey
          metricAdId
          provenance
          value
          evidence
          targetCostMicros
          metricLabel
          metricProvenance
          metricReason
          metricUnit
          currency
          fromDate
          throughDate
          timezone
          sourceFingerprint
        }
        actions {
          origin {
            runId
            suggestionId
            humanEdited
          }
          id
          title
          rationale
          expectedResult
          evidence
          ownerId
          ownerName
          reviewerId
          reviewerName
          dueDate
          assistantId
          adoptTaskId
          taskId
          assistantVersion
          assistantName
          task {
            ...AdvertisingTaskFields
          }
        }
      }
      legacyAdoptedReviewId
      legacyTask {
        ...AdvertisingTaskFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_SOURCE_FIELDS}
  ${ADVERTISING_TASK_FIELDS}
`;
export const GET_ADVERTISING_REVIEW_STATE = gql`
  query DeliveryAdvertisingReviewState(
    $input: DeliveryAdvertisingReviewInput!
  ) {
    deliveryAdvertisingReviewState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canEdit
      canAssign
      blockingReasons
      currentSourceFingerprint
      actor {
        ...AdvertisingActorFields
      }
      review {
        id
        revision
        state
        sourceKind
        sourceId
      }
      tasks {
        actionId
        taskId
        revision
        state
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_ADVERTISING_CHOICES = gql`
  query DeliveryAdvertisingChoices($input: DeliveryAdvertisingChoicesInput!) {
    deliveryAdvertisingChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      totalCount
      nextCursor
      actor {
        ...AdvertisingActorFields
      }
      items {
        id
        name
        version
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_ADVERTISING_RECEIPT = gql`
  query DeliveryAdvertisingReceipt($input: DeliveryAdvertisingReceiptInput!) {
    deliveryAdvertisingReceipt(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingReceiptFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_RECEIPT_FIELDS}
`;
export const GET_ADVERTISING_OBSERVATIONS = gql`
  query DeliveryAdvertisingObservations(
    $input: DeliveryAdvertisingObservationsInput!
  ) {
    deliveryAdvertisingObservations(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      totalCount
      nextCursor
      actor {
        ...AdvertisingActorFields
      }
      items {
        id
        reviewId
        actionId
        correctsId
        correctedById
        actorId
        createdAt
        assessment
        sourceKind
        sourceId
        metricKey
        metricAdId
        value
        fromDate
        throughDate
        evidence
        note
        metric {
          key
          label
          unit
          goalKinds
          value
          provenance
          reason
        }
        source {
          ...AdvertisingSourceFields
        }
        task {
          ...AdvertisingTaskFields
        }
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_SOURCE_FIELDS}
  ${ADVERTISING_TASK_FIELDS}
`;
export const SAVE_ADVERTISING_REVIEW = gql`
  mutation SaveDeliveryAdvertisingReview(
    $input: SaveDeliveryAdvertisingReviewInput!
  ) {
    saveDeliveryAdvertisingReview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingReceiptFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_RECEIPT_FIELDS}
`;
export const ASSIGN_ADVERTISING_REVIEW = gql`
  mutation AssignDeliveryAdvertisingReview(
    $input: AssignDeliveryAdvertisingReviewInput!
  ) {
    assignDeliveryAdvertisingReview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingReceiptFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_RECEIPT_FIELDS}
`;
export const OBSERVE_ADVERTISING_ACTION = gql`
  mutation ObserveDeliveryAdvertisingAction(
    $input: ObserveDeliveryAdvertisingActionInput!
  ) {
    observeDeliveryAdvertisingAction(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      receipt {
        ...AdvertisingReceiptFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_RECEIPT_FIELDS}
`;
