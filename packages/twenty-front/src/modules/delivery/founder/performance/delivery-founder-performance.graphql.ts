import { gql } from '@apollo/client';

export const GET_DELIVERY_FOUNDER_PERFORMANCE = gql`
  query DeliveryFounderPerformance($input: DeliveryFounderPerformanceInput!) {
    deliveryFounderPerformance(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      month
      previousMonth
      timezone
      currency
      canReadFinance
      projects {
        id
        name
      }
      operations {
        ...FounderPerformanceOperations
      }
      currencies {
        currency
        revenueMicros
        costMicros
        resultMicros
        previousRevenueMicros
        previousCostMicros
        previousResultMicros
        salaryCostMicros
        overheadCostMicros
        aiCostMicros
        otherCostMicros
        unassignedRevenueMicros
        unassignedCostMicros
        cashCollectedMicros
        receivablesMicros
        overdueReceivablesMicros
        draftEntryCount
        postedEntryCount
        periodStatus
        financeComplete
        cashReportingConfirmed
        cashComplete
      }
      clients {
        projectId
        projectName
        companyId
        teamCount
        operations {
          ...FounderPerformanceOperations
        }
        finance {
          currency
          revenueMicros
          costMicros
          resultMicros
          previousRevenueMicros
          previousCostMicros
          previousResultMicros
          salaryCostMicros
          cashCollectedMicros
          receivablesMicros
        }
      }
      clientTotal
      nextProjectId
      employees {
        memberId
        name
        roleLabel
        clientCount
        operations {
          ...FounderPerformanceOperations
        }
        salaryCosts {
          currency
          amountMicros
        }
      }
      employeeTotal
      nextMemberId
      warnings
    }
  }
  fragment FounderPerformanceOperations on DeliveryFounderPerformanceOperations {
    openTaskCount
    overdueTaskCount
    blockedTaskCount
    waitingReviewCount
    approvedTaskCount
    dueTaskCount
    onTimeApprovedTaskCount
    reviewedTaskCount
    firstPassApprovedTaskCount
    revisionCount
    internalRevisionCount
  }
`;
