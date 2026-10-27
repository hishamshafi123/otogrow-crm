import { gql } from '@apollo/client';

const AI_BUDGET_FIELDS = gql`
  fragment OtogrowAiBudgetFields on OtogrowAiBudgetSnapshot {
    workspaceId
    memberId
    userWorkspaceId
    coverageStartedAt
    configured
    chargedUsd
    heldUsd
    unresolvedCount
    budgets {
      id
      scope
      scopeId
      scopeName
      revision
      enabled
      capUsd
      openingSpentUsd
      chargedUsd
      heldUsd
      remainingUsd
    }
    priceProfiles {
      id
      modelId
      kind
      revision
      enabled
      source
      verifiedAt
      pricing {
        inputUsdPerMillionTokens
        outputUsdPerMillionTokens
        reasoningUsdPerMillionTokens
        cacheReadUsdPerMillionTokens
        cacheWriteUsdPerMillionTokens
        maxInputTokens
        maxOutputTokens
        maxReasoningTokens
        outputIncludesReasoning
        longContextThresholdTokens
        longInputUsdPerMillionTokens
        longOutputUsdPerMillionTokens
        longReasoningUsdPerMillionTokens
        longCacheReadUsdPerMillionTokens
        longCacheWriteUsdPerMillionTokens
      }
    }
    recentSpend {
      id
      revision
      sourceKind
      sourceRunId
      state
      modelId
      kind
      clientName
      taskName
      reservedUsd
      actualUsd
      reportedActualUsd
      heldUsd
      boundSource
      priceSource
      priceRevision
      priceVerifiedAt
      createdAt
      dispatchedAt
      settledAt
      attentionReason
    }
    clients {
      id
      name
    }
    tasks {
      id
      name
    }
    nextCursor
  }
`;

export const GET_AI_BUDGET = gql`
  query OtogrowAiBudgetSnapshot($input: OtogrowAiBudgetSnapshotInput!) {
    otogrowAiBudgetSnapshot(input: $input) {
      ...OtogrowAiBudgetFields
    }
  }
  ${AI_BUDGET_FIELDS}
`;
export const SAVE_AI_BUDGET = gql`
  mutation SaveOtogrowAiBudget($input: OtogrowAiBudgetSaveInput!) {
    saveOtogrowAiBudget(input: $input) {
      ...OtogrowAiBudgetFields
    }
  }
  ${AI_BUDGET_FIELDS}
`;
export const SAVE_AI_PRICE = gql`
  mutation SaveOtogrowAiPrice($input: OtogrowAiPriceSaveInput!) {
    saveOtogrowAiPrice(input: $input) {
      ...OtogrowAiBudgetFields
    }
  }
  ${AI_BUDGET_FIELDS}
`;
export const RECONCILE_AI_SPEND = gql`
  mutation ReconcileOtogrowAiSpend($input: OtogrowAiSpendReconcileInput!) {
    reconcileOtogrowAiSpend(input: $input) {
      ...OtogrowAiBudgetFields
    }
  }
  ${AI_BUDGET_FIELDS}
`;

export const GET_AI_SPEND_HISTORY = gql`
  query OtogrowAiSpendHistory($input: OtogrowAiSpendHistoryInput!) {
    otogrowAiSpendHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      spendId
      sourceKind
      sourceRunId
      modelId
      kind
      clientName
      taskName
      priceSource
      priceRevision
      priceVerifiedAt
      nextCursor
      events {
        id
        action
        actorId
        actorName
        actorAttribution
        createdAt
        before {
          state
          revision
          reservedUsd
          actualUsd
          reportedActualUsd
        }
        after {
          state
          revision
          reservedUsd
          actualUsd
          reportedActualUsd
        }
        evidenceReference
        reason
      }
    }
  }
`;
