import { gql } from '@apollo/client';
import { ACTIVITY_EVENT_FIELDS } from '@/otogrow-activity/activity-reads.graphql';
import { ACTIVITY_CURRENT_WORK_FIELDS } from '@/otogrow-activity/analysis/activity-current-work.graphql';

export const ACTIVITY_ANALYSIS_AGENT_FIELDS = gql`
  fragment ActivityAnalysisAgentFields on OtogrowActivityAnalysisAgent {
    id
    name
    version
    modelId
    maxOutputTokens
  }
`;
export const ACTIVITY_ANALYSIS_RUN_FIELDS = gql`
  fragment ActivityAnalysisRunFields on OtogrowActivityAnalysisRunSummary {
    id
    requestId
    status
    revision
    initiatorId
    initiatorName
    bodyFingerprint
    contextFingerprint
    createdAt
    updatedAt
    startedAt
    finishedAt
    error
    resultAvailable
    includedCount
    omittedCount
    agent {
      ...ActivityAnalysisAgentFields
    }
  }
  ${ACTIVITY_ANALYSIS_AGENT_FIELDS}
`;
export const ACTIVITY_ANALYSIS_RECEIPT_FIELDS = gql`
  fragment ActivityAnalysisReceiptFields on OtogrowActivityAnalysisReceipt {
    requestId
    runId
    action
    actorId
    userWorkspaceId
    inputHash
    bodyFingerprint
    revision
    status
    createdAt
  }
`;
export const ACTIVITY_ANALYSIS_CONTEXT_FIELDS = gql`
  fragment ActivityAnalysisContextFields on OtogrowActivityAnalysisContext {
    capturedAt
    from
    through
    coverageStartedAt
    totalCount
    includedCount
    omittedCount
    truncatedFieldCount
    omittedBytes
    containsFinance
    question
    assistantInstructions
    promptVersion
    outputContractVersion
    limitations
    filters {
      personId
      projectId
      clientId
      category
      action
      outcome
      from
      through
    }
    events {
      ...ActivityEventFields
    }
    citations {
      id
      kind
      label
      eventId
      occurredAt
      href
      taskId
      capturedAt
    }
    currentWork {
      ...ActivityCurrentWorkFields
    }
  }
  ${ACTIVITY_EVENT_FIELDS}
  ${ACTIVITY_CURRENT_WORK_FIELDS}
`;
export const GET_ACTIVITY_ANALYSIS_PREVIEW = gql`
  query OtogrowActivityAnalysisPreview(
    $input: OtogrowActivityAnalysisPreviewInput!
  ) {
    otogrowActivityAnalysisPreview(input: $input) {
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
      bodyFingerprint
      contextFingerprint
      evidenceFingerprint
      canStart
      blockedReasons
      agent {
        ...ActivityAnalysisAgentFields
      }
      context {
        ...ActivityAnalysisContextFields
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
  ${ACTIVITY_ANALYSIS_AGENT_FIELDS}
  ${ACTIVITY_ANALYSIS_CONTEXT_FIELDS}
`;
export const GET_ACTIVITY_ANALYSIS_RUNS = gql`
  query OtogrowActivityAnalysisRuns($input: OtogrowActivityAnalysisRunsInput!) {
    otogrowActivityAnalysisRuns(input: $input) {
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
      totalCount
      nextCursor
      items {
        ...ActivityAnalysisRunFields
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
`;
export const GET_ACTIVITY_ANALYSIS_RUN_STATE = gql`
  query OtogrowActivityAnalysisRunState(
    $input: OtogrowActivityAnalysisRunInput!
  ) {
    otogrowActivityAnalysisRunState(input: $input) {
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
      canCancel
      run {
        ...ActivityAnalysisRunFields
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
`;
export const GET_ACTIVITY_ANALYSIS_RUN = gql`
  query OtogrowActivityAnalysisRun($input: OtogrowActivityAnalysisRunInput!) {
    otogrowActivityAnalysisRun(input: $input) {
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
      canCancel
      run {
        ...ActivityAnalysisRunFields
      }
      context {
        ...ActivityAnalysisContextFields
      }
      result {
        summary
        summaryCitationIds
        unknowns
        limitations
        findings {
          id
          kind
          text
          citationIds
        }
      }
      usage {
        inputTokens
        outputTokens
        costUsd
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
  ${ACTIVITY_ANALYSIS_CONTEXT_FIELDS}
`;
export const GET_ACTIVITY_ANALYSIS_REQUEST = gql`
  query OtogrowActivityAnalysisRequest(
    $input: OtogrowActivityAnalysisRequestInput!
  ) {
    otogrowActivityAnalysisRequest(input: $input) {
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
      receipt {
        ...ActivityAnalysisReceiptFields
      }
      run {
        ...ActivityAnalysisRunFields
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RECEIPT_FIELDS}
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
`;
export const START_ACTIVITY_ANALYSIS = gql`
  mutation StartOtogrowActivityAnalysis(
    $input: StartOtogrowActivityAnalysisInput!
  ) {
    startOtogrowActivityAnalysis(input: $input) {
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
      receipt {
        ...ActivityAnalysisReceiptFields
      }
      run {
        ...ActivityAnalysisRunFields
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RECEIPT_FIELDS}
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
`;
export const CANCEL_ACTIVITY_ANALYSIS = gql`
  mutation CancelOtogrowActivityAnalysis(
    $input: CancelOtogrowActivityAnalysisInput!
  ) {
    cancelOtogrowActivityAnalysis(input: $input) {
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
      receipt {
        ...ActivityAnalysisReceiptFields
      }
      run {
        ...ActivityAnalysisRunFields
      }
    }
  }
  ${ACTIVITY_ANALYSIS_RECEIPT_FIELDS}
  ${ACTIVITY_ANALYSIS_RUN_FIELDS}
`;
