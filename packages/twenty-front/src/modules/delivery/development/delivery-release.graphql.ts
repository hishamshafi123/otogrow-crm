import { gql } from '@apollo/client';

const RELEASE_PROJECT = gql`
  fragment ReleaseProject on DeliveryReleaseProject {
    id
    name
    revision
    companyId
  }
`;
const RELEASE_SUMMARY = gql`
  fragment ReleaseSummary on DeliveryReleaseSummary {
    id
    projectId
    companyId
    title
    ownerName
    ownerId
    createdBy
    revision
    currentVersion
    status
    targetDate
  }
`;
const RELEASE_TASK = gql`
  fragment ReleaseTask on DeliveryReleaseTask {
    taskId
    revision
    title
    assigneeId
    state
    submissionVersion
    submittedBy
    reviewedBy
    reviewedAt
    approved
    sourceHash
  }
`;
const RELEASE_RECEIPT = gql`
  fragment ReleaseReceipt on DeliveryReleaseReceipt {
    workspaceId
    actorId
    userWorkspaceId
    requestId
    releaseId
    inputHash
    action
    note
    evidenceUrl
    environment
    commitSha
    actorName
    revision
    version
    status
    createdAt
  }
`;
export const GET_RELEASE_PROJECTS = gql`
  ${RELEASE_PROJECT}
  query DeliveryReleaseProjects($input: DeliveryReleaseProjectsInput!) {
    deliveryReleaseProjects(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...ReleaseProject
      }
      totalCount
      nextId
    }
  }
`;
export const GET_RELEASE_LIST = gql`
  ${RELEASE_PROJECT}
  ${RELEASE_SUMMARY}
  query DeliveryReleaseList($input: DeliveryReleaseListInput!) {
    deliveryReleaseList(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...ReleaseProject
      }
      items {
        ...ReleaseSummary
      }
      totalCount
      nextId
    }
  }
`;
export const GET_RELEASE_CHOICES = gql`
  ${RELEASE_PROJECT}
  ${RELEASE_TASK}
  query DeliveryReleaseChoices($input: DeliveryReleaseChoicesInput!) {
    deliveryReleaseChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...ReleaseProject
      }
      owners {
        id
        name
      }
      tasks {
        ...ReleaseTask
      }
      selectedTasks {
        ...ReleaseTask
      }
      totalCount
      nextTaskId
    }
  }
`;
export const GET_RELEASE_DETAIL = gql`
  ${RELEASE_PROJECT}
  ${RELEASE_SUMMARY}
  ${RELEASE_TASK}
  ${RELEASE_RECEIPT}
  query DeliveryReleaseDetail($input: DeliveryReleaseSelectionInput!) {
    deliveryReleaseDetail(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      release {
        ...ReleaseSummary
      }
      project {
        ...ReleaseProject
      }
      selectedVersion
      body {
        title
        ownerId
        targetDate
        repositoryUrl
        commitSha
        summary
        acceptanceCriteria
        rollbackPlan
        sourceFingerprint
        work {
          taskId
          revision
          issueUrl
          pullRequestUrl
          blockedByTaskIds
        }
        checks {
          id
          kind
          label
          status
          evidenceUrl
          note
        }
        tasks {
          ...ReleaseTask
        }
      }
      history {
        ...ReleaseReceipt
      }
      nextEventId
      currentSourceFingerprint
      sourceChanged
      canEdit
      canSubmit
      canReview
      canRecordDeployment
      canRecordHandover
      canRecordAcceptance
      reviewBlockedReason
    }
  }
`;
export const GET_RELEASE_RECEIPT = gql`
  ${RELEASE_RECEIPT}
  query DeliveryReleaseReceipt($input: DeliveryReleaseReceiptInput!) {
    deliveryReleaseReceipt(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      receipt {
        ...ReleaseReceipt
      }
    }
  }
`;
export const SAVE_RELEASE = gql`
  ${RELEASE_RECEIPT}
  mutation SaveDeliveryRelease($input: DeliveryReleaseSaveInput!) {
    saveDeliveryRelease(input: $input) {
      ...ReleaseReceipt
    }
  }
`;
export const PREVIEW_RELEASE = gql`
  ${RELEASE_TASK}
  query PreviewDeliveryRelease($input: DeliveryReleaseSaveInput!) {
    previewDeliveryRelease(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      releaseId
      requestId
      inputHash
      ownerName
      reviewBlockedReason
      body {
        title
        ownerId
        targetDate
        repositoryUrl
        commitSha
        summary
        acceptanceCriteria
        rollbackPlan
        sourceFingerprint
        work {
          taskId
          revision
          issueUrl
          pullRequestUrl
          blockedByTaskIds
        }
        checks {
          id
          kind
          label
          status
          evidenceUrl
          note
        }
        tasks {
          ...ReleaseTask
        }
      }
    }
  }
`;
export const DECIDE_RELEASE = gql`
  ${RELEASE_RECEIPT}
  mutation DecideDeliveryRelease($input: DeliveryReleaseDecisionInput!) {
    decideDeliveryRelease(input: $input) {
      ...ReleaseReceipt
    }
  }
`;
