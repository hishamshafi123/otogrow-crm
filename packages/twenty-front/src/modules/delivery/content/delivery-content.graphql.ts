import { gql } from '@apollo/client';

const CONTENT_PROJECT = gql`
  fragment ContentProject on DeliveryContentProject {
    id
    name
    revision
    companyId
  }
`;
const CONTENT_ACCOUNT = gql`
  fragment ContentAccount on DeliveryContentAccount {
    id
    projectId
    companyId
    revision
    platform
    name
    handle
    profileUrl
    archived
  }
`;
const CONTENT_PLAN = gql`
  fragment ContentPlan on DeliveryContentPlan {
    id
    projectId
    companyId
    revision
    title
    purpose
    engagementId
    service
    createdBy
    canEdit
  }
`;
const CONTENT_SUMMARY = gql`
  fragment ContentSummary on DeliveryContentSummary {
    id
    planId
    planTitle
    projectId
    revision
    currentVersion
    lastAttemptAction
    lastAttemptAt
    status
    ownerId
    ownerName
    reviewerId
    reviewerName
    platform
    accountName
    plannedAt
    plannedLocal
    timezone
    format
  }
`;
const CONTENT_ASSET = gql`
  fragment ContentAssetSnapshot on DeliveryContentAssetSnapshot {
    taskId
    submissionVersion
    assetId
    title
    name
    mimeType
    creativeVersion
    reviewedBy
    reviewedAt
    sourceHash
  }
`;
const CONTENT_BODY = gql`
  ${CONTENT_ACCOUNT}
  ${CONTENT_ASSET}
  fragment ContentSavedBody on DeliveryContentSavedBody {
    accountId
    accountRevision
    ownerId
    reviewerId
    format
    caption
    plannedAt
    plannedLocal
    timezone
    notes
    asset {
      taskId
      submissionVersion
      assetId
    }
    account {
      ...ContentAccount
    }
    assetSnapshot {
      ...ContentAssetSnapshot
    }
    ownerName
    reviewerName
    contributorIds
    sourceFingerprint
  }
`;
const CONTENT_RECEIPT = gql`
  fragment ContentReceipt on DeliveryContentReceipt {
    id
    workspaceId
    actorId
    userWorkspaceId
    requestId
    targetKind
    targetId
    planId
    version
    inputHash
    action
    status
    revision
    note
    evidenceUrl
    publishedAt
    correctsEventId
    actorName
    createdAt
  }
`;
export const GET_CONTENT_PROJECTS = gql`
  ${CONTENT_PROJECT}
  query DeliveryContentProjects($input: DeliveryContentProjectsInput!) {
    deliveryContentProjects(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...ContentProject
      }
      totalCount
      nextId
    }
  }
`;
export const GET_CONTENT_CHOICES = gql`
  ${CONTENT_PROJECT}
  ${CONTENT_ACCOUNT}
  query DeliveryContentProjectChoices(
    $input: DeliveryContentProjectChoicesInput!
  ) {
    deliveryContentProjectChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...ContentProject
      }
      accounts {
        ...ContentAccount
      }
      members {
        id
        name
        canReview
      }
      engagements {
        id
        name
        services
      }
      selectedAccounts {
        ...ContentAccount
      }
      selectedMembers {
        id
        name
        canReview
      }
      selectedEngagements {
        id
        name
        services
      }
      nextAccountId
      nextMemberId
      nextEngagementId
      unavailableSelectedIds
    }
  }
`;
export const GET_CONTENT_PLANS = gql`
  ${CONTENT_PLAN}
  query DeliveryContentPlans($input: DeliveryContentPlansInput!) {
    deliveryContentPlans(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...ContentPlan
      }
      totalCount
      nextId
    }
  }
`;
export const GET_CONTENT_LIST = gql`
  ${CONTENT_SUMMARY}
  query DeliveryContentList($input: DeliveryContentListInput!) {
    deliveryContentList(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...ContentSummary
      }
      totalCount
      nextId
      platformCounts {
        platform
        count
        publishedCount
        reviewCount
      }
    }
  }
`;
export const GET_CONTENT_ASSETS = gql`
  ${CONTENT_ASSET}
  query DeliveryContentAssetChoices($input: DeliveryContentAssetChoicesInput!) {
    deliveryContentAssetChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...ContentAssetSnapshot
      }
      nextTaskId
    }
  }
`;
export const GET_CONTENT_CALENDAR = gql`
  query DeliveryContentCalendar($input: DeliveryContentCalendarInput!) {
    deliveryContentCalendar(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      timezone
      from
      to
      days {
        date
        count
      }
      totalCount
    }
  }
`;
export const GET_CONTENT_DETAIL = gql`
  ${CONTENT_SUMMARY}
  ${CONTENT_PROJECT}
  ${CONTENT_PLAN}
  ${CONTENT_BODY}
  ${CONTENT_RECEIPT}
  query DeliveryContentDetail($input: DeliveryContentSelectionInput!) {
    deliveryContentDetail(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      variant {
        ...ContentSummary
      }
      project {
        ...ContentProject
      }
      plan {
        ...ContentPlan
      }
      selectedVersion
      body {
        ...ContentSavedBody
      }
      history {
        ...ContentReceipt
      }
      nextEventId
      currentSourceFingerprint
      sourceChanged
      latestPublication {
        ...ContentReceipt
      }
      canEdit
      allowedActions
      blockedReason
    }
  }
`;
export const GET_CONTENT_RECEIPT = gql`
  ${CONTENT_RECEIPT}
  query DeliveryContentReceipt($input: DeliveryContentReceiptInput!) {
    deliveryContentReceipt(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      receipt {
        ...ContentReceipt
      }
    }
  }
`;
export const PREVIEW_CONTENT = gql`
  ${CONTENT_BODY}
  query PreviewDeliveryContent($input: DeliveryContentSaveInput!) {
    previewDeliveryContent(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      variantId
      requestId
      inputHash
      body {
        ...ContentSavedBody
      }
    }
  }
`;
export const SAVE_CONTENT_ACCOUNT = gql`
  ${CONTENT_RECEIPT}
  mutation SaveDeliveryContentAccount(
    $input: DeliveryContentAccountSaveInput!
  ) {
    saveDeliveryContentAccount(input: $input) {
      ...ContentReceipt
    }
  }
`;
export const SAVE_CONTENT_PLAN = gql`
  ${CONTENT_RECEIPT}
  mutation SaveDeliveryContentPlan($input: DeliveryContentPlanSaveInput!) {
    saveDeliveryContentPlan(input: $input) {
      ...ContentReceipt
    }
  }
`;
export const SAVE_CONTENT = gql`
  ${CONTENT_RECEIPT}
  mutation SaveDeliveryContent($input: DeliveryContentSaveInput!) {
    saveDeliveryContent(input: $input) {
      ...ContentReceipt
    }
  }
`;
export const DECIDE_CONTENT = gql`
  ${CONTENT_RECEIPT}
  mutation DecideDeliveryContent($input: DeliveryContentDecisionInput!) {
    decideDeliveryContent(input: $input) {
      ...ContentReceipt
    }
  }
`;
