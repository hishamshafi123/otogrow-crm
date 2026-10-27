import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_FORECAST = gql`
  query DeliveryFinanceForecast($input: DeliveryFinanceForecastInput!) {
    deliveryFinanceForecast(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      currency
      horizonDays
      businessDate
      timezone
      anchor {
        id
        revision
        currency
        amountMicros
        closingDate
        timezone
        note
        evidenceUrl
        changedBy
        changedByName
        changedAt
      }
      actualInflowMicros
      actualOutflowMicros
      currentCashMicros
      expectedInflowMicros
      expectedOutflowMicros
      endingCashMicros
      firstNegativeDate
      knownUnscheduledInflowMicros
      knownUnscheduledOutflowMicros
      unknownCollectionCount
      unappliedActualOutflowMicros
      projectionComplete
      warnings
      owners {
        id
        name
      }
      items {
        ...FinanceForecastItemFields
      }
      itemCount
      nextItemId
      selectedItem {
        ...FinanceForecastItemFields
      }
      realizations {
        ...FinanceForecastRealizationFields
      }
      nextRealizationId
      exceptions {
        key
        code
        itemId
        sourceId
        sourceType
        title
        date
        amountMicros
      }
      exceptionCount
      nextExceptionKey
      timeline {
        date
        inflowMicros
        outflowMicros
        closingMicros
        itemIds
      }
    }
  }
  fragment FinanceForecastItemFields on DeliveryFinanceForecastItem {
    id
    revision
    status
    kind
    sourceType
    sourceId
    planMonth
    title
    currency
    amountMicros
    remainingMicros
    appliedMicros
    expectedDate
    contractualDueDate
    ownerId
    ownerName
    ownerEligible
    nextActionDate
    note
    sourceReviewToken
    reviewToken
    eligible
    warnings
    changedAt
    changedByName
  }
  fragment FinanceForecastRealizationFields on DeliveryFinanceForecastRealization {
    id
    revision
    itemId
    cashId
    cashTitle
    targetTitle
    currency
    amountMicros
    status
    note
    createdAt
    createdByName
    reversedAt
    reversedByName
    reversalReason
  }
`;

export const GET_DELIVERY_FINANCE_FORECAST_SOURCES = gql`
  query DeliveryFinanceForecastSources(
    $input: DeliveryFinanceForecastSourcesInput!
  ) {
    deliveryFinanceForecastSources(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      currency
      kind
      nextId
      sources {
        ...FinanceForecastSourceFields
      }
      selectedSource {
        ...FinanceForecastSourceFields
      }
    }
  }
  fragment FinanceForecastSourceFields on DeliveryFinanceForecastSource {
    id
    sourceType
    title
    category
    currency
    date
    dueDate
    projectId
    projectName
    amountMicros
    remainingMicros
    planMonth
    suggestedDate
    occurrenceItemId
    sourceReviewToken
    eligible
    warnings
  }
`;

export const GET_DELIVERY_FINANCE_FORECAST_HISTORY = gql`
  query DeliveryFinanceForecastHistory(
    $input: DeliveryFinanceForecastHistoryInput!
  ) {
    deliveryFinanceForecastHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      nextBeforeId
      events {
        id
        sourceType
        sourceId
        action
        revision
        actorName
        actorId
        createdAt
        reason
        beforeStatus
        afterStatus
        currency
        amountMicros
        date
        title
        ownerName
        note
        timezone
        evidenceUrl
        originSourceType
        originSourceId
        planMonth
        sourceRevision
        sourceAmountMicros
        cashId
        itemId
        cashDate
        reversedAt
      }
    }
  }
`;

export const SAVE_DELIVERY_FINANCE_FORECAST_ANCHOR = gql`
  mutation SaveDeliveryFinanceForecastAnchor(
    $input: DeliveryFinanceForecastAnchorInput!
  ) {
    saveDeliveryFinanceForecastAnchor(input: $input) {
      anchor {
        id
        revision
        currency
        amountMicros
        closingDate
        timezone
        note
        evidenceUrl
        changedBy
        changedByName
        changedAt
      }
      replayed
    }
  }
`;
export const SAVE_DELIVERY_FINANCE_FORECAST_ITEM = gql`
  mutation SaveDeliveryFinanceForecastItem(
    $input: DeliveryFinanceForecastItemInput!
  ) {
    saveDeliveryFinanceForecastItem(input: $input) {
      item {
        id
        revision
        status
        kind
        sourceType
        sourceId
        planMonth
        title
        currency
        amountMicros
        remainingMicros
        appliedMicros
        expectedDate
        contractualDueDate
        ownerId
        ownerName
        ownerEligible
        nextActionDate
        note
        sourceReviewToken
        reviewToken
        eligible
        warnings
        changedAt
        changedByName
      }
      replayed
    }
  }
`;
export const REALIZE_DELIVERY_FINANCE_FORECAST_OUTFLOW = gql`
  mutation RealizeDeliveryFinanceForecastOutflow(
    $input: DeliveryFinanceForecastRealizeInput!
  ) {
    realizeDeliveryFinanceForecastOutflow(input: $input) {
      realization {
        id
        revision
        itemId
        cashId
        cashTitle
        targetTitle
        currency
        amountMicros
        status
        note
        createdAt
        createdByName
        reversedAt
        reversedByName
        reversalReason
      }
      replayed
    }
  }
`;
export const REVERSE_DELIVERY_FINANCE_FORECAST_REALIZATION = gql`
  mutation ReverseDeliveryFinanceForecastRealization(
    $input: DeliveryFinanceForecastReverseInput!
  ) {
    reverseDeliveryFinanceForecastRealization(input: $input) {
      realization {
        id
        revision
        itemId
        cashId
        cashTitle
        targetTitle
        currency
        amountMicros
        status
        note
        createdAt
        createdByName
        reversedAt
        reversedByName
        reversalReason
      }
      replayed
    }
  }
`;
