import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_PAYMENTS = gql`
  query DeliveryFinancePayments($input: DeliveryFinancePaymentsInput!) {
    deliveryFinancePayments(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      currency
      rejectedCashCount
      cashTotal
      receivableTotal
      entryTotal
      nextCashId
      nextReceivableId
      nextEntryId
      settlementTotal
      matchTotal
      nextSettlementId
      nextMatchId
      projects {
        id
        name
      }
      cash {
        ...FinanceCashSourceFields
      }
      receivables {
        ...FinanceCashSourceFields
      }
      entries {
        ...FinanceMatchableEntryFields
      }
      selectedCash {
        ...FinanceCashSourceFields
      }
      selectedReceivable {
        ...FinanceCashSourceFields
      }
      selectedEntry {
        ...FinanceMatchableEntryFields
      }
      settlements {
        ...FinanceCashRelationFields
      }
      matches {
        ...FinanceCashRelationFields
      }
    }
  }
  fragment FinanceCashSourceFields on DeliveryFinanceCashSource {
    id
    revision
    title
    category
    currency
    amountMicros
    date
    dueDate
    projectId
    projectName
    status
    evidenceUrl
    note
    sourceReviewToken
    sourceWarnings
    settledMicros
    remainingSettlementMicros
    matchedMicros
    remainingMatchMicros
    outstandingMicros
  }
  fragment FinanceMatchableEntryFields on DeliveryFinanceMatchableEntry {
    id
    revision
    month
    title
    kind
    currency
    status
    sourceReviewToken
    allocations {
      projectId
      projectName
      amountMicros
      matchedMicros
      remainingMatchMicros
    }
  }
  fragment FinanceCashRelationFields on DeliveryFinanceCashRelation {
    id
    kind
    revision
    cashId
    cashTitle
    receivableId
    entryId
    targetTitle
    month
    projectId
    projectName
    currency
    amountMicros
    status
    legacy
    canReverse
    createdBy
    createdByName
    createdAt
    reversedBy
    reversedByName
    reversedAt
    reversalReason
  }
`;
export const RECORD_DELIVERY_FINANCE_PAYMENT = gql`
  mutation RecordDeliveryFinancePayment($input: DeliveryFinancePaymentInput!) {
    recordDeliveryFinancePayment(input: $input)
  }
`;
export const SETTLE_DELIVERY_FINANCE_RECEIVABLE = gql`
  mutation SettleDeliveryFinanceReceivable(
    $input: DeliveryFinanceSettlementInput!
  ) {
    settleDeliveryFinanceReceivable(input: $input)
  }
`;
export const MATCH_DELIVERY_FINANCE_CASH = gql`
  mutation MatchDeliveryFinanceCash($input: DeliveryFinanceCashMatchInput!) {
    matchDeliveryFinanceCash(input: $input)
  }
`;
export const REVERSE_DELIVERY_FINANCE_RELATION = gql`
  mutation ReverseDeliveryFinanceRelation(
    $input: DeliveryFinanceReverseRelationInput!
  ) {
    reverseDeliveryFinanceRelation(input: $input)
  }
`;
