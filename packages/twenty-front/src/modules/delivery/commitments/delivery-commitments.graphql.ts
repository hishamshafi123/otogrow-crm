import { gql } from '@apollo/client';

const COMMITMENT_FIELDS = gql`
  fragment DeliveryCommitmentFields on DeliveryCommitments {
    workspaceId
    memberId
    userWorkspaceId
    engagementId
    engagementName
    projectId
    canManage
    taskDetailsAvailable
    legacyAllowance
    selectedPeriodId
    periods {
      id
      label
      billing
      startDate
      endDateExclusive
      timezone
      state
      revision
    }
    lines {
      id
      periodId
      label
      unit
      revision
      promisedQuantity
      assignedQuantity
      fulfilledQuantity
      remainingQuantity
      overdeliveredQuantity
    }
    allocations {
      taskId
      taskName
      periodId
      lineId
      parentTaskId
      revision
      state
      credited
      creditReason
      fulfilledAt
      creditedCycle
      creditedSubmissionVersion
    }
    taskOptions {
      taskId
      name
      taskRevision
      state
      allocationRevision
      allocatedPeriodId
      allocatedLineId
      allocatedUnit
    }
    selectedTask {
      taskId
      name
      taskRevision
      state
      allocationRevision
      allocatedPeriodId
      allocatedLineId
      allocatedUnit
    }
    selectedParent {
      taskId
      name
      taskRevision
      state
      allocationRevision
      allocatedPeriodId
      allocatedLineId
      allocatedUnit
    }
    orphanAllocations {
      allocationId
      periodId
      lineId
      revision
      state
      createdAt
      updatedAt
      canRemove
      removalBlockReason
    }
    nextOrphanAllocationCursor
    moreTaskOptions
    history {
      id
      action
      actorName
      actorType
      occurredAt
      taskId
      taskName
      reason
      changes {
        field
        before
        after
      }
    }
    nextAllocationCursor
    nextHistoryCursor
  }
`;
export const GET_COMMITMENTS = gql`
  query DeliveryCommitments($input: DeliveryCommitmentsInput!) {
    deliveryCommitments(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const SAVE_COMMITMENT_PERIOD = gql`
  mutation SaveDeliveryCommitmentPeriod(
    $input: DeliveryCommitmentPeriodSaveInput!
  ) {
    saveDeliveryCommitmentPeriod(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const SET_COMMITMENT_PERIOD_STATE = gql`
  mutation SetDeliveryCommitmentPeriodState(
    $input: DeliveryCommitmentPeriodStateInput!
  ) {
    setDeliveryCommitmentPeriodState(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const SAVE_COMMITMENT_LINE = gql`
  mutation SaveDeliveryCommitmentLine(
    $input: DeliveryCommitmentLineSaveInput!
  ) {
    saveDeliveryCommitmentLine(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const ASSIGN_COMMITMENT_TASK = gql`
  mutation AssignDeliveryCommitmentTask(
    $input: DeliveryCommitmentTaskAssignInput!
  ) {
    assignDeliveryCommitmentTask(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const REMOVE_COMMITMENT_TASK = gql`
  mutation RemoveDeliveryCommitmentTask(
    $input: DeliveryCommitmentTaskRemoveInput!
  ) {
    removeDeliveryCommitmentTask(input: $input) {
      ...DeliveryCommitmentFields
    }
  }
  ${COMMITMENT_FIELDS}
`;
export const GET_COMMITMENT_ENGAGEMENTS = gql`
  query DeliveryCommitmentEngagements {
    deliveryCommitmentEngagements {
      workspaceId
      memberId
      userWorkspaceId
      engagements {
        id
        name
        projectId
        billing
      }
    }
  }
`;

const ORPHAN_CLEANUP_RESULT = gql`
  fragment DeliveryCommitmentOrphanCleanupFields on DeliveryCommitmentOrphanCleanupResult {
    workspaceId
    memberId
    userWorkspaceId
    engagementId
    periodId
    requestId
    allocationId
    requestedAllocationRevision
    periodRevision
    state
    removedAllocationRevision
    occurredAt
  }
`;
export const REMOVE_ORPHAN_ALLOCATION = gql`
  mutation RemoveDeliveryOrphanCommitmentAllocation(
    $input: DeliveryCommitmentOrphanCleanupInput!
  ) {
    removeDeliveryOrphanCommitmentAllocation(input: $input) {
      ...DeliveryCommitmentOrphanCleanupFields
    }
  }
  ${ORPHAN_CLEANUP_RESULT}
`;
export const GET_ORPHAN_CLEANUP_RECEIPT = gql`
  query DeliveryOrphanCommitmentCleanupReceipt(
    $input: DeliveryCommitmentOrphanCleanupInput!
  ) {
    deliveryOrphanCommitmentCleanupReceipt(input: $input) {
      ...DeliveryCommitmentOrphanCleanupFields
    }
  }
  ${ORPHAN_CLEANUP_RESULT}
`;
export const CANCEL_ORPHAN_CLEANUP = gql`
  mutation CancelDeliveryOrphanCommitmentCleanup(
    $input: DeliveryCommitmentOrphanCleanupInput!
  ) {
    cancelDeliveryOrphanCommitmentCleanup(input: $input) {
      ...DeliveryCommitmentOrphanCleanupFields
    }
  }
  ${ORPHAN_CLEANUP_RESULT}
`;
