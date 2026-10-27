import { gql } from '@apollo/client';

export const WORKFLOW_DEFINITION = gql`
  fragment DeliveryWorkflowDefinitionFields on DeliveryWorkflowDefinition {
    name
    description
    service
    definitionOfDone
    checklist {
      id
      label
      required
    }
    evidence {
      id
      label
      instructions
      kind
      required
    }
    reviewChecks {
      id
      label
      required
    }
  }
`;
export const APPLIED_WORKFLOW = gql`
  fragment DeliveryAppliedWorkflowFields on DeliveryAppliedWorkflow {
    templateId
    version
    revision
    appliedAt
    appliedByName
    definition {
      ...DeliveryWorkflowDefinitionFields
    }
    checkedIds
    evidence {
      requirementId
      value
    }
  }
  ${WORKFLOW_DEFINITION}
`;
const CATALOG_FIELDS = gql`
  fragment DeliveryWorkflowCatalogFields on DeliveryWorkflowCatalog {
    workspaceId
    memberId
    userWorkspaceId
    templates {
      id
      revision
      archived
      stateReason
      current {
        templateId
        version
        publishedAt
        publishedByName
        reason
        definition {
          ...DeliveryWorkflowDefinitionFields
        }
      }
    }
    versions {
      templateId
      version
      publishedAt
      publishedByName
      reason
      definition {
        ...DeliveryWorkflowDefinitionFields
      }
    }
    starters {
      key
      definition {
        ...DeliveryWorkflowDefinitionFields
      }
    }
  }
  ${WORKFLOW_DEFINITION}
`;
const TASK_FIELDS = gql`
  fragment DeliveryTaskWorkflowFields on DeliveryTaskWorkflow {
    workspaceId
    memberId
    userWorkspaceId
    taskId
    taskRevision
    canManage
    canEdit
    locked
    workflow {
      ...DeliveryAppliedWorkflowFields
    }
    previousApplications {
      ...DeliveryAppliedWorkflowFields
    }
    missingRequirements
    nextHistoryCursor
  }
  ${APPLIED_WORKFLOW}
`;
export const GET_WORKFLOW_CATALOG = gql`
  query DeliveryWorkflowCatalog($input: DeliveryWorkflowCatalogInput!) {
    deliveryWorkflowCatalog(input: $input) {
      ...DeliveryWorkflowCatalogFields
    }
  }
  ${CATALOG_FIELDS}
`;
export const SAVE_WORKFLOW = gql`
  mutation SaveDeliveryWorkflow($input: DeliveryWorkflowSaveInput!) {
    saveDeliveryWorkflow(input: $input) {
      ...DeliveryWorkflowCatalogFields
    }
  }
  ${CATALOG_FIELDS}
`;
export const ARCHIVE_WORKFLOW = gql`
  mutation ArchiveDeliveryWorkflow($input: DeliveryWorkflowArchiveInput!) {
    archiveDeliveryWorkflow(input: $input) {
      ...DeliveryWorkflowCatalogFields
    }
  }
  ${CATALOG_FIELDS}
`;
export const GET_TASK_WORKFLOW = gql`
  query DeliveryTaskWorkflow($input: DeliveryTaskWorkflowInput!) {
    deliveryTaskWorkflow(input: $input) {
      ...DeliveryTaskWorkflowFields
    }
  }
  ${TASK_FIELDS}
`;
export const APPLY_WORKFLOW = gql`
  mutation ApplyDeliveryWorkflow($input: DeliveryWorkflowApplyInput!) {
    applyDeliveryWorkflow(input: $input) {
      ...DeliveryTaskWorkflowFields
    }
  }
  ${TASK_FIELDS}
`;
export const SAVE_WORKFLOW_PROGRESS = gql`
  mutation SaveDeliveryWorkflowProgress(
    $input: DeliveryWorkflowProgressInput!
  ) {
    saveDeliveryWorkflowProgress(input: $input) {
      ...DeliveryTaskWorkflowFields
    }
  }
  ${TASK_FIELDS}
`;
