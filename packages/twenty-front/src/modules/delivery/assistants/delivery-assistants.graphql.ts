import { gql } from '@apollo/client';

const SUMMARY = gql`
  fragment DeliveryAssistantSummaryFields on DeliveryAssistantSummary {
    id
    name
    purpose
    kind
    enabled
    version
    requiredInputs
    createdAt
    updatedAt
    canRun
  }
`;
const CONFIGURATION = gql`
  fragment DeliveryAssistantConfigurationFields on DeliveryAssistantConfiguration {
    name
    purpose
    kind
    enabled
    instructions
    requiredInputs
    outputFormat
    tools
    modelId
    projectIds
    roles
    roleIds
    dailyRunLimit
    maxOutputTokens
    humanConfirmation
  }
`;
const RUN = gql`
  fragment DeliveryAssistantRunSummaryFields on DeliveryAssistantRunSummary {
    id
    taskId
    taskTitle
    projectId
    projectName
    agentId
    agentName
    kind
    initiatorId
    taskRevision
    agentVersion
    status
    createdAt
    updatedAt
    decisionAt
    decisionAction
    hasFindings
    hasSuggestedBrief
    hasSuggestedCopy
  }
`;
const RECEIPT = gql`
  fragment DeliveryAssistantRunReceiptFields on DeliveryAssistantRunReceipt {
    workspaceId
    memberId
    userWorkspaceId
    runId
    taskId
    agentId
    status
    updatedAt
  }
`;
export const GET_ASSISTANT_CONTEXT = gql`
  query DeliveryAssistantContext($input: DeliveryAssistantContextInput!) {
    deliveryAssistantContext(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canConfigure
      actor {
        memberId
        isAdmin
        isManager
        capabilities
        roleIds
      }
      projects {
        id
        name
        revision
      }
      models {
        id
        provider
      }
      selectedTask {
        id
        title
        projectId
        revision
        state
        assigneeId
        brief
        draftCopy
      }
    }
  }
`;
export const GET_ASSISTANT_CATALOG = gql`
  query DeliveryAssistantCatalog($input: DeliveryAssistantCatalogInput!) {
    deliveryAssistantCatalog(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      totalCount
      items {
        ...DeliveryAssistantSummaryFields
      }
      nextCursor
    }
  }
  ${SUMMARY}
`;
export const GET_ASSISTANT = gql`
  query DeliveryAssistant($input: DeliveryAssistantSelectionInput!) {
    deliveryAssistant(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      assistant {
        ...DeliveryAssistantSummaryFields
      }
    }
  }
  ${SUMMARY}
`;
export const GET_ASSISTANT_CONFIGURATION = gql`
  query DeliveryAssistantConfiguration(
    $input: DeliveryAssistantSelectionInput!
  ) {
    deliveryAssistantConfiguration(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      id
      version
      createdAt
      updatedAt
      configuration {
        ...DeliveryAssistantConfigurationFields
      }
    }
  }
  ${CONFIGURATION}
`;
export const GET_ASSISTANT_RUNS = gql`
  query DeliveryAssistantRuns($input: DeliveryAssistantRunsInput!) {
    deliveryAssistantRuns(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      totalCount
      byStatus {
        status
        count
      }
      items {
        ...DeliveryAssistantRunSummaryFields
      }
      nextCursor
    }
  }
  ${RUN}
`;
export const GET_ASSISTANT_RUN = gql`
  query DeliveryAssistantRun($input: DeliveryAssistantRunInput!) {
    deliveryAssistantRun(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      requestId
      run {
        ...DeliveryAssistantRunSummaryFields
      }
      configuration {
        ...DeliveryAssistantConfigurationFields
      }
      context
      result {
        summary
        findings {
          severity
          evidence
          correction
        }
        suggestedBrief
        suggestedCopy
      }
      activity {
        at
        message
      }
      usage {
        inputTokens
        outputTokens
        cost
      }
      error
      decision {
        memberId
        at
        action
        field
      }
      canCancel
      canReject
      canAcceptFindings
      canAcceptBrief
      canAcceptCopy
      acceptanceBlockedReason
    }
  }
  ${RUN}
  ${CONFIGURATION}
`;
export const GET_ASSISTANT_REQUEST = gql`
  query DeliveryAssistantRequest($input: DeliveryAssistantRequestInput!) {
    deliveryAssistantRequest(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      requestId
      receipt {
        ...DeliveryAssistantRunReceiptFields
      }
    }
  }
  ${RECEIPT}
`;
export const SAVE_ASSISTANT = gql`
  mutation SaveDeliveryAssistant($input: SaveDeliveryAssistantInput!) {
    saveDeliveryAssistant(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      saved
      version
      replayed
    }
  }
`;
export const PREVIEW_ASSISTANT = gql`
  mutation PreviewDeliveryAssistant($input: PreviewDeliveryAssistantInput!) {
    previewDeliveryAssistant(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      agentId
      taskRevision
      agentVersion
      context
      budget {
        maximumCostUsd
        pricingRevision
        budgetReady
        blockedReason
        boundSource
      }
    }
  }
`;
export const START_ASSISTANT = gql`
  mutation StartDeliveryAssistant($input: StartDeliveryAssistantInput!) {
    startDeliveryAssistant(input: $input) {
      ...DeliveryAssistantRunReceiptFields
    }
  }
  ${RECEIPT}
`;
export const CANCEL_ASSISTANT_RUN = gql`
  mutation CancelDeliveryAssistantRun($input: DeliveryAssistantRunInput!) {
    cancelDeliveryAssistantRun(input: $input) {
      ...DeliveryAssistantRunReceiptFields
    }
  }
  ${RECEIPT}
`;
export const DECIDE_ASSISTANT_RUN = gql`
  mutation DecideDeliveryAssistantRun($input: DecideDeliveryAssistantInput!) {
    decideDeliveryAssistantRun(input: $input) {
      ...DeliveryAssistantRunReceiptFields
    }
  }
  ${RECEIPT}
`;
export const GET_ASSISTANT_TASK_CHOICES = gql`
  query DeliveryAssistantTaskChoices($input: DeliveryTaskListInput!) {
    deliveryTaskList(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      totalCount
      nextCursor
      items {
        id
        title
        projectId
        projectName
        revision
        state
        service
      }
    }
  }
`;
