import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_PERIOD = gql`
  query DeliveryFinancePeriod($input: DeliveryFinancePeriodInput!) {
    deliveryFinancePeriod(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      period {
        ...FinancePeriodFields
      }
      summaries {
        ...FinancePeriodCurrencyFields
      }
      recognitionHash
      previewToken
      blockerCount
      nextBlockerId
      blockers {
        entryId
        month
        title
        sourceType
        reason
      }
      limitations
      canLock
      canReopen
    }
  }
  fragment FinancePeriodFields on DeliveryFinancePeriod {
    id
    month
    status
    revision
    changedBy
    changedByName
    changedAt
    reason
  }
  fragment FinancePeriodCurrencyFields on DeliveryFinancePeriodCurrencySummary {
    currency
    revenueMicros
    costMicros
    resultMicros
    draftCount
    postedCount
    voidCount
    projects {
      projectId
      projectName
      revenueMicros
      costMicros
      resultMicros
      postedCount
    }
  }
`;

export const CHANGE_DELIVERY_FINANCE_PERIOD = gql`
  mutation ChangeDeliveryFinancePeriod(
    $input: DeliveryFinancePeriodChangeInput!
  ) {
    changeDeliveryFinancePeriod(input: $input) {
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
      replayed
    }
  }
`;

export const GET_DELIVERY_FINANCE_PERIOD_HISTORY = gql`
  query DeliveryFinancePeriodHistory(
    $input: DeliveryFinancePeriodHistoryInput!
  ) {
    deliveryFinancePeriodHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      month
      nextBeforeId
      events {
        id
        action
        beforeStatus
        afterStatus
        revision
        reason
        actorId
        actorName
        createdAt
        recognitionHash
        summaries {
          currency
          revenueMicros
          costMicros
          resultMicros
          draftCount
          postedCount
          voidCount
          projects {
            projectId
            projectName
            revenueMicros
            costMicros
            resultMicros
            postedCount
          }
        }
      }
    }
  }
`;

export const GET_DELIVERY_FINANCE_RECOGNITION_AVAILABILITY = gql`
  query DeliveryFinanceRecognitionAvailability(
    $input: DeliveryFinancePeriodInput!
    $replacedInput: DeliveryFinancePeriodInput!
    $includeReplaced: Boolean!
  ) {
    deliveryFinancePeriod(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      period {
        month
        status
      }
    }
    replacedPeriod: deliveryFinancePeriod(input: $replacedInput)
      @include(if: $includeReplaced) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      period {
        month
        status
      }
    }
  }
`;
