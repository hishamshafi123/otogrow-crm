import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_AI_COSTS = gql`
  query DeliveryFinanceAiCosts($input: DeliveryFinanceAiCostsInput!) {
    deliveryFinanceAiCosts(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      canReadBudget
      filter
      nextSpendId
      projects {
        id
        name
      }
      sources {
        ...FinanceAiCostSourceFields
      }
      selectedSource {
        ...FinanceAiCostSourceFields
      }
    }
  }
  fragment FinanceAiCostEntryReferenceFields on DeliveryFinanceAiCostEntryReference {
    id
    revision
    status
    month
    amountMicros
    matchedMicros
    activeMatchCount
  }
  fragment FinanceAiCostSourceFields on DeliveryFinanceAiCostSource {
    id
    revision
    state
    sourceKind
    modelId
    currency
    settledAmountMicros
    createdAt
    dispatchedAt
    settledAt
    projectId
    projectName
    eligible
    sourceWarnings
    sourceReviewToken
    nextEvidenceId
    claim {
      revision
      currentEntry {
        ...FinanceAiCostEntryReferenceFields
      }
      replacementEntry {
        ...FinanceAiCostEntryReferenceFields
      }
    }
    evidenceOptions {
      id
      basis
      amountMicros
      recordedAt
    }
  }
`;

export const PREPARE_DELIVERY_FINANCE_AI_COST = gql`
  mutation PrepareDeliveryFinanceAiCost(
    $input: DeliveryFinanceAiCostPrepareInput!
  ) {
    prepareDeliveryFinanceAiCost(input: $input) {
      entryId
      status
      replayed
    }
  }
`;

export const POST_DELIVERY_FINANCE_AI_COST = gql`
  mutation PostDeliveryFinanceAiCost($input: DeliveryFinanceAiCostPostInput!) {
    postDeliveryFinanceAiCost(input: $input) {
      entryId
      status
      replayed
    }
  }
`;
