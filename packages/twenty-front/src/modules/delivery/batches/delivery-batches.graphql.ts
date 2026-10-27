import { gql } from '@apollo/client';

const BATCH_FIELDS = gql`
  fragment DeliveryBatchFields on DeliveryBatches {
    workspaceId
    memberId
    userWorkspaceId
    projectId
    canManage
    batches {
      id
      label
      periodId
      startDate
      endDate
      timezone
      closed
      revision
    }
    selected {
      id
      label
      periodId
      startDate
      endDate
      timezone
      closed
      revision
    }
    tasks {
      taskId
      title
      concept
      available
      state
      taskRevision
      assigneeName
      reviewerName
      submissionVersion
      unit
      approved
      fulfilled
    }
    counts {
      key
      total
      approved
      fulfilled
    }
    history {
      id
      actorName
      action
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
    taskOptions {
      taskId
      title
      taskRevision
    }
    moreTaskOptions
    periods {
      id
      label
    }
    nextCursor
    nextTaskCursor
    nextHistoryCursor
  }
`;
export const GET_BATCHES = gql`
  query DeliveryBatches($input: DeliveryBatchesInput!) {
    deliveryBatches(input: $input) {
      ...DeliveryBatchFields
    }
  }
  ${BATCH_FIELDS}
`;
export const SAVE_BATCH = gql`
  mutation SaveDeliveryBatch($input: DeliveryBatchSaveInput!) {
    saveDeliveryBatch(input: $input) {
      ...DeliveryBatchFields
    }
  }
  ${BATCH_FIELDS}
`;
export const SET_BATCH_STATE = gql`
  mutation SetDeliveryBatchState($input: DeliveryBatchStateInput!) {
    setDeliveryBatchState(input: $input) {
      ...DeliveryBatchFields
    }
  }
  ${BATCH_FIELDS}
`;
export const SAVE_BATCH_ITEM = gql`
  mutation SaveDeliveryBatchItem($input: DeliveryBatchItemInput!) {
    saveDeliveryBatchItem(input: $input) {
      ...DeliveryBatchFields
    }
  }
  ${BATCH_FIELDS}
`;
