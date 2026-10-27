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
