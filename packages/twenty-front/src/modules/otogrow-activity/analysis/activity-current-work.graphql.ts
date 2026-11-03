import { gql } from '@apollo/client';

export const ACTIVITY_CURRENT_TASK_FIELDS = gql`
  fragment ActivityCurrentTaskFields on OtogrowActivityCurrentTaskFacts {
    taskId
    title
    projectId
    projectName
    clientId
    clientName
    taskRevision
    state
    blocker
    ownerId
    ownerName
    dueAt
    submissionVersion
    submittedAt
    primaryReviewerId
    primaryReviewerName
    effectiveReviewerId
    effectiveReviewerName
    reviewerState
    assignmentMode
    assignmentRevision
    warnings
    detailsTruncated
    href
  }
`;
export const ACTIVITY_CURRENT_WORK_FIELDS = gql`
  fragment ActivityCurrentWorkFields on OtogrowActivityCurrentWorkSnapshot {
    capturedAt
    scope {
      personId
      projectId
      clientId
    }
    totalCount
    includedCount
    omittedCount
    truncatedFieldCount
    omittedBytes
    complete
    items {
      ...ActivityCurrentTaskFields
    }
    limitations
    fingerprint
    nativeVisibilityFingerprint
  }
  ${ACTIVITY_CURRENT_TASK_FIELDS}
`;
export const GET_ACTIVITY_CURRENT_TASK = gql`
  query OtogrowActivityCurrentTask($input: OtogrowActivityCurrentTaskInput!) {
    otogrowActivityCurrentTask(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        memberId
        isAdmin
        isManager
        roleIds
        capabilities
      }
      capturedAt
      scopeSelection {
        personId
        projectId
        clientId
      }
      task {
        ...ActivityCurrentTaskFields
      }
      unavailableReason
    }
  }
  ${ACTIVITY_CURRENT_TASK_FIELDS}
`;
