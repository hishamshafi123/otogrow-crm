import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE = gql`
  query DeliveryFinance($input: DeliveryFinanceInput!) {
    deliveryFinance(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      month
      currency
      canManage
      period {
        id
        month
        status
        revision
        changedBy
        changedByName
        changedAt
        reason
      }
      planTotal
      entryTotal
      nextPlanId
      nextEntryId
      projects {
        id
        name
      }
      members {
        id
        name
      }
      plans {
        ...FinancePlanFields
      }
      selectedPlan {
        ...FinancePlanFields
      }
      entries {
        ...FinanceEntryFields
      }
      selectedEntry {
        ...FinanceEntryFields
      }
      summaries {
        currency
        revenueMicros
        costMicros
        resultMicros
        unassignedRevenueMicros
        unassignedCostMicros
        draftCount
        postedCount
        voidCount
        projects {
          projectId
          projectName
          revenueMicros
          costMicros
          resultMicros
        }
      }
    }
  }
  fragment FinancePlanFields on DeliveryFinancePlan {
    id
    revision
    type
    name
    currency
    monthlyAmountMicros
    memberId
    memberName
    memberActive
    startMonth
    endMonth
    dueDay
    active
    createdAt
    updatedAt
  }
  fragment FinanceEntryFields on DeliveryFinanceEntry {
    id
    revision
    month
    kind
    category
    title
    currency
    amountMicros
    note
    evidenceUrl
    status
    sourceType
    sourcePlan {
      planId
      revision
      type
      name
      memberId
      memberName
      monthlyAmountMicros
      startMonth
      endMonth
      dueDay
    }
    sourceAiSpend {
      spendId
      spendRevision
      evidenceEventId
      basis
      amountMicros
      currency
      modelId
      sourceKind
      recordedAt
      projectId
      projectName
      replacesEntryId
      correctionReason
    }
    sourceWarnings
    lockedMonths
    sourceReviewToken
    dueDate
    remainingAllocationMicros
    allocations {
      projectId
      projectName
      amountMicros
    }
    createdBy
    createdAt
    updatedAt
    postedAt
    voidedAt
    voidReason
  }
`;
export const SAVE_DELIVERY_FINANCE_PLAN = gql`
  mutation SaveDeliveryFinancePlan($input: DeliveryFinancePlanInput!) {
    saveDeliveryFinancePlan(input: $input)
  }
`;
export const SAVE_DELIVERY_FINANCE_ENTRY = gql`
  mutation SaveDeliveryFinanceEntry($input: DeliveryFinanceEntryInput!) {
    saveDeliveryFinanceEntry(input: $input)
  }
`;
export const PREPARE_DELIVERY_FINANCE_MONTH = gql`
  mutation PrepareDeliveryFinanceMonth($input: DeliveryFinancePrepareInput!) {
    prepareDeliveryFinanceMonth(input: $input) {
      createdCount
      existingCount
      nextPlanId
      skipped {
        planId
        reason
      }
    }
  }
`;
export const POST_DELIVERY_FINANCE_ENTRY = gql`
  mutation PostDeliveryFinanceEntry($input: DeliveryFinancePostInput!) {
    postDeliveryFinanceEntry(input: $input)
  }
`;
export const VOID_DELIVERY_FINANCE_ENTRY = gql`
  mutation VoidDeliveryFinanceEntry($input: DeliveryFinanceVoidInput!) {
    voidDeliveryFinanceEntry(input: $input)
  }
`;
export const GET_DELIVERY_FINANCE_HISTORY = gql`
  query DeliveryFinanceEntryHistory($input: DeliveryFinanceHistoryInput!) {
    deliveryFinanceEntryHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      entryId
      nextBeforeId
      events {
        id
        actorId
        actorName
        action
        revision
        reason
        createdAt
        beforeAmountMicros
        afterAmountMicros
        beforeStatus
        afterStatus
      }
    }
  }
`;
