import { gql } from '@apollo/client';

const RULE_FIELDS = gql`
  fragment FounderEscalationRuleFields on DeliveryFounderEscalationRule {
    id
    revision
    name
    condition
    minimumReviewWaitHours
    recipientId
    priority
    projectScope
    projectIds
    includeCompany
    currency
    serviceMonth
    repeatMode
    repeatHours
    maxSends
    enabled
    recipientName
    recipientEligible
    grantingAdminEligible
    changedAt
    changedByName
    lastEvaluatedAt
    evaluationError
  }
`;
const SOURCE_FIELDS = gql`
  fragment FounderEscalationSourceFields on DeliveryFounderException {
    key
    domain
    reasonCode
    sourceType
    sourceId
    sourceRevision
    projectId
    projectName
    title
    occurredAt
    dueAt
    ownerId
    ownerName
    ownerState
    evidence {
      state
      date
      timezone
      currency
      amountMicros
      revenueMicros
      costMicros
      resultMicros
      promisedQuantity
      fulfilledQuantity
      remainingQuantity
      reviewSubmittedAt
      reviewSubmissionVersion
      reviewAssignmentRevision
      warnings
    }
    nextAction {
      code
      targetType
      targetId
      engagementId
      periodId
      currency
      serviceMonth
      sourceKind
      submissionVersion
    }
  }
`;
const EPISODE_FIELDS = gql`
  fragment FounderEscalationEpisodeFields on DeliveryFounderEscalationEpisode {
    id
    ruleId
    revision
    sourceKey
    condition
    title
    status
    firstSeenAt
    lastSeenAt
    resolvedAt
    acknowledgedAt
    acknowledgedByName
    acknowledgementReason
    source {
      ...FounderEscalationSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;
export const GET_DELIVERY_FOUNDER_ESCALATIONS = gql`
  query DeliveryFounderEscalations($input: DeliveryFounderEscalationsInput!) {
    deliveryFounderEscalations(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canReadFinance
      observedAt
      workerObservedAt
      routingAdopted
      routingRevision
      telegramEnabled
      botConfigured
      linkedRecipientIds
      recipients {
        id
        name
      }
      projects {
        id
        name
      }
      conditions {
        code
        domain
        requiresServiceMonth
      }
      rules {
        ...FounderEscalationRuleFields
      }
      nextRuleId
      episodes {
        ...FounderEscalationEpisodeFields
      }
      nextEpisodeId
      notices {
        id
        ruleId
        episodeId
        kind
        sequence
        ruleRevision
        priority
        recipientName
        createdAt
        actorName
        reason
        transportStatus
        attemptedAt
        finishedAt
        error
        configuration {
          id
          revision
          name
          condition
          minimumReviewWaitHours
          recipientId
          priority
          projectScope
          projectIds
          includeCompany
          currency
          serviceMonth
          repeatMode
          repeatHours
          maxSends
        }
      }
      nextNoticeId
    }
  }
  ${RULE_FIELDS}
  ${EPISODE_FIELDS}
`;
export const PREVIEW_DELIVERY_FOUNDER_ESCALATION_RULE = gql`
  query PreviewDeliveryFounderEscalationRule(
    $input: DeliveryFounderEscalationRuleDraftInput!
  ) {
    previewDeliveryFounderEscalationRule(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canReadFinance
      previewToken
      observedAt
      matchCount
      canEnable
      items {
        ...FounderEscalationSourceFields
      }
      coverage {
        domain
        status
        codes
      }
      warnings
    }
  }
  ${SOURCE_FIELDS}
`;
export const SAVE_DELIVERY_FOUNDER_ESCALATION_RULE = gql`
  mutation SaveDeliveryFounderEscalationRule(
    $input: DeliveryFounderEscalationRuleSaveInput!
  ) {
    saveDeliveryFounderEscalationRule(input: $input) {
      rule {
        ...FounderEscalationRuleFields
      }
      replayed
    }
  }
  ${RULE_FIELDS}
`;
export const CHANGE_DELIVERY_FOUNDER_ESCALATION_RULE = gql`
  mutation ChangeDeliveryFounderEscalationRule(
    $input: DeliveryFounderEscalationRuleStateInput!
  ) {
    changeDeliveryFounderEscalationRule(input: $input) {
      rule {
        ...FounderEscalationRuleFields
      }
      replayed
    }
  }
  ${RULE_FIELDS}
`;
export const ACKNOWLEDGE_DELIVERY_FOUNDER_ESCALATION = gql`
  mutation AcknowledgeDeliveryFounderEscalation(
    $input: DeliveryFounderEscalationAcknowledgeInput!
  ) {
    acknowledgeDeliveryFounderEscalation(input: $input) {
      episode {
        ...FounderEscalationEpisodeFields
      }
      replayed
    }
  }
  ${EPISODE_FIELDS}
`;
