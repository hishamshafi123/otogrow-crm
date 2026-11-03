import { gql } from '@apollo/client';

const SEO_IDENTITY = gql`
  fragment SeoIdentity on DeliverySeoProjects {
    workspaceId
    memberId
    userWorkspaceId
    scope
    observedAt
    actor {
      memberId
      isManager
      isAdmin
    }
  }
`;
const SEO_METRIC = gql`
  fragment SeoMetric on DeliverySeoMetric {
    id
    key
    label
    unit
    value
    unknownReason
    source
    sourceUrl
    property
    segment
    definition
    observedAt
  }
`;
const SEO_SUMMARY = gql`
  fragment SeoSummary on DeliverySeoReportSummary {
    id
    projectId
    title
    status
    revision
    currentVersion
    approvedVersion
    periodStart
    periodEnd
    createdBy
    ownerId
    ownerName
    createdByName
  }
`;
const SEO_RECEIPT = gql`
  fragment SeoReceipt on DeliverySeoReceipt {
    requestId
    reportId
    action
    revision
    version
    status
    actorName
    note
    createdAt
    workspaceId
    actorId
    userWorkspaceId
    inputHash
  }
`;
const SEO_TASK = gql`
  fragment SeoTask on DeliverySeoTask {
    taskId
    title
    revision
    state
    submissionVersion
    verificationSummary
    verificationRunId
  }
`;
export const GET_SEO_PROJECTS = gql`
  ${SEO_IDENTITY}
  query DeliverySeoProjects($input: DeliverySeoProjectsInput!) {
    deliverySeoProjects(input: $input) {
      ...SeoIdentity
      items {
        id
        name
        revision
        companyId
      }
      totalCount
      nextId
    }
  }
`;
export const GET_SEO_REPORTS = gql`
  ${SEO_SUMMARY}
  query DeliverySeoReports($input: DeliverySeoReportsInput!) {
    deliverySeoReports(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        memberId
        isManager
        isAdmin
      }
      project {
        id
        name
        revision
        companyId
      }
      items {
        ...SeoSummary
      }
      totalCount
      nextId
    }
  }
`;
export const GET_SEO_STATE = gql`
  ${SEO_SUMMARY}
  query DeliverySeoReportState($input: DeliverySeoSelectionInput!) {
    deliverySeoReportState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        memberId
        isManager
        isAdmin
      }
      project {
        id
        name
        revision
        companyId
      }
      report {
        ...SeoSummary
      }
      canEdit
      canSubmit
      canReview
      clientAnchorChanged
    }
  }
`;
export const GET_SEO_REPORT = gql`
  ${SEO_SUMMARY}
  ${SEO_METRIC}
  ${SEO_TASK}
  ${SEO_RECEIPT}
  query DeliverySeoReport($input: DeliverySeoSelectionInput!) {
    deliverySeoReport(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        memberId
        isManager
        isAdmin
      }
      project {
        id
        name
        revision
        companyId
      }
      report {
        ...SeoSummary
      }
      version
      body {
        title
        ownerId
        period
        periodStart
        periodEnd
        timezone
        summary
        workNotes
        tasks {
          taskId
          revision
        }
        evidence {
          label
          url
          note
        }
        metrics {
          ...SeoMetric
        }
        comparisonId
        comparisonVersion
      }
      taskSnapshots {
        ...SeoTask
      }
      comparison {
        metricId
        label
        currentValue
        previousValue
        delta
        reason
      }
      comparisonTitle
      comparisonPeriodStart
      comparisonPeriodEnd
      comparisonTimezone
      history {
        ...SeoReceipt
      }
      nextEventId
      canEdit
      canSubmit
      canReview
      clientAnchorChanged
    }
  }
`;
export const GET_SEO_CHOICES = gql`
  ${SEO_TASK}
  query DeliverySeoChoices($input: DeliverySeoChoicesInput!) {
    deliverySeoChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        memberId
        isManager
        isAdmin
      }
      members {
        id
        name
      }
      tasks {
        ...SeoTask
      }
      totalTaskCount
      nextTaskId
      nextMemberId
    }
  }
`;
export const GET_SEO_RECEIPT = gql`
  ${SEO_RECEIPT}
  query DeliverySeoReceipt($input: DeliverySeoReceiptInput!) {
    deliverySeoReceipt(input: $input) {
      ...SeoReceipt
    }
  }
`;
export const SAVE_SEO_REPORT = gql`
  ${SEO_RECEIPT}
  mutation SaveDeliverySeoReport($input: DeliverySeoSaveInput!) {
    saveDeliverySeoReport(input: $input) {
      ...SeoReceipt
    }
  }
`;
export const DECIDE_SEO_REPORT = gql`
  ${SEO_RECEIPT}
  mutation DecideDeliverySeoReport($input: DeliverySeoDecisionInput!) {
    decideDeliverySeoReport(input: $input) {
      ...SeoReceipt
    }
  }
`;
