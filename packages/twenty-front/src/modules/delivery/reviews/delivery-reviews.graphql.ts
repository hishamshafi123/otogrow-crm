import { gql } from '@apollo/client';
const ASSIGNMENT = gql`
  fragment DeliveryReviewAssignmentFields on DeliveryReviewAssignment {
    id
    taskId
    submissionVersion
    revision
    mode
    reviewerId
    reviewerName
    reason
    changedByName
    changedAt
  }
`;
const ITEM = gql`
  fragment DeliveryReviewQueueItemFields on DeliveryReviewQueueItem {
    taskId
    title
    projectId
    projectName
    service
    taskRevision
    submissionVersion
    submittedAt
    ageSeconds
    ageState
    primaryReviewerId
    primaryReviewerName
    effectiveReviewerId
    effectiveReviewerName
    reviewerState
    assignmentMode
    assignmentRevision
    creativeVersion
    finalAssetId
    requiredCheckCount
    canReviewSubmission
    warnings
  }
`;
const TASK_REVIEW = gql`
  fragment DeliveryTaskReviewFields on DeliveryTaskReviewSnapshot {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    taskId
    taskRevision
    state
    pending {
      ...DeliveryReviewQueueItemFields
    }
    assignment {
      ...DeliveryReviewAssignmentFields
    }
    canManageAssignment
    canReviewSubmission
    canApprove
    assignmentNotice {
      id
      submissionVersion
      assignmentId
      assignmentRevision
      recipientId
      createdAt
      remindAt
      seenAt
      acknowledgedAt
      sendState
    }
    eligibleReviewers {
      id
      name
    }
  }
  ${ITEM}
  ${ASSIGNMENT}
`;
export const GET_REVIEW_QUEUE = gql`
  query DeliveryReviewQueue($input: DeliveryReviewQueueInput!) {
    deliveryReviewQueue(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canManage
      canReviewAssigned
      projects {
        id
        name
      }
      reviewers {
        id
        name
      }
      totalCount
      unknownAgeCount
      unavailableReviewerCount
      nextCursor
      items {
        ...DeliveryReviewQueueItemFields
      }
    }
  }
  ${ITEM}
`;
export const GET_TASK_REVIEW = gql`
  query DeliveryTaskReview($input: DeliveryTaskReviewInput!) {
    deliveryTaskReview(input: $input) {
      ...DeliveryTaskReviewFields
    }
  }
  ${TASK_REVIEW}
`;
export const ASSIGN_REVIEW = gql`
  mutation AssignDeliveryReview($input: DeliveryReviewAssignmentInput!) {
    assignDeliveryReview(input: $input) {
      assignment {
        ...DeliveryReviewAssignmentFields
      }
      taskReview {
        ...DeliveryTaskReviewFields
      }
      replayed
    }
  }
  ${TASK_REVIEW}
`;
export const SEE_REVIEW_ASSIGNMENT = gql`
  mutation SeeDeliveryReviewAssignment(
    $input: DeliveryReviewAssignmentSeenInput!
  ) {
    seeDeliveryReviewAssignment(input: $input) {
      ...DeliveryTaskReviewFields
    }
  }
  ${TASK_REVIEW}
`;
export const ACKNOWLEDGE_REVIEW_ASSIGNMENT = gql`
  mutation AcknowledgeDeliveryReviewAssignment(
    $input: DeliveryReviewAssignmentAcknowledgeInput!
  ) {
    acknowledgeDeliveryReviewAssignment(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      taskRevision
      submissionVersion
      assignmentRevision
      noticeId
      acknowledgedAt
    }
  }
`;
export const GET_REVIEW_ASSIGNMENT_HISTORY = gql`
  query DeliveryReviewAssignmentHistory(
    $input: DeliveryReviewAssignmentHistoryInput!
  ) {
    deliveryReviewAssignmentHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      submissionVersion
      nextBeforeId
      events {
        id
        revision
        mode
        reviewerId
        reviewerName
        primaryReviewerId
        primaryReviewerName
        previousMode
        previousReviewerId
        previousReviewerName
        reason
        actorName
        createdAt
      }
    }
  }
`;
