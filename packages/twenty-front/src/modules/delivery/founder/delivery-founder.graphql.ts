import { gql } from '@apollo/client';

export const GET_DELIVERY_FOUNDER_EXCEPTIONS = gql`
  query DeliveryFounderExceptions($input: DeliveryFounderExceptionsInput!) {
    deliveryFounderExceptions(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      canReadFinance
      projects {
        id
        name
      }
      owners {
        id
        name
      }
      coverage {
        domain
        status
        codes
      }
      counts {
        domain
        count
      }
      totalCount
      items {
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
      nextCursor
    }
  }
`;
