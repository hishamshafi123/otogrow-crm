import { gql } from '@apollo/client';
export const GET_REVISIONS = gql`
  query DeliveryRevisions($input: DeliveryRevisionsInput!) {
    deliveryRevisions(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      canManage
      canReadFinance
      canManageFinance
      total
      nextBeforeRound
      rounds {
        id
        round
        revision
        submissionVersion
        source
        reason
        cause
        createdAt
        effortMinutes
        internalCost
        proposedCharge
        currency
      }
    }
  }
`;
export const SAVE_REVISION = gql`
  mutation SaveDeliveryRevision($input: DeliveryRevisionSaveInput!) {
    saveDeliveryRevision(input: $input)
  }
`;
export const GET_REVISION_COSTS = gql`
  query DeliveryRevisionCosts($input: DeliveryRevisionCostsInput!) {
    deliveryRevisionCosts(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      startDate
      endDate
      projectId
      groups {
        projectId
        projectName
        cause
        currency
        rounds
        missingCostCount
        missingEffortCount
        recordedCost
        proposedCharges
        recordedEffortMinutes
      }
    }
  }
`;
