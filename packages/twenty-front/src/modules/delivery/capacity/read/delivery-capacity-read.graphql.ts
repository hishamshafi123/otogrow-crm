import { gql } from '@apollo/client';
export const GET_CAPACITY_SUMMARY = gql`
  query DeliveryCapacitySummary($input: DeliveryCapacitySummaryInput!) {
    deliveryCapacitySummary(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      timezone
      startDate
      endDate
      totalMemberCount
      nextCursor
      warningScope
      warnings {
        code
        count
        scope
      }
      members {
        memberId
        name
        overloadDays
        incompleteDays
        needsPlanningCount
        days {
          date
          availableMinutes
          availabilityInvalid
          availabilityRevision
          assignmentCount
          workMinutes
          productionMinutes
          revisionMinutes
          reviewMinutes
          waitMinutes
          unknownCount
          unknownWait
          overloadMinutes
          unavailableReviewCount
        }
      }
    }
  }
`;
export const GET_CAPACITY_ASSIGNMENTS = gql`
  query DeliveryCapacityAssignments($input: DeliveryCapacityAssignmentsInput!) {
    deliveryCapacityAssignments(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      timezone
      startDate
      endDate
      selectedMemberId
      bucket
      selectionScope
      date
      totalCount
      nextCursor
      items {
        taskId
        title
        projectId
        projectName
        revision
        state
        kind
        date
        ownerId
        ownerName
        workMinutes
        revisionMinutes
        waitMinutes
        unknownEffort
        unknownWait
        reviewerState
        submissionVersion
        reviewAssignmentRevision
        warnings
      }
    }
  }
`;
