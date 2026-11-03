import { gql } from '@apollo/client';
const REVIEW = gql`
  fragment DeliveryTaskReadReview on DeliveryTaskReviewAuthority {
    submissionVersion
    primaryReviewerId
    effectiveReviewerId
    assignmentRevision
    assignmentMode
    reviewerState
    canReview
  }
`;
const LIFECYCLE = gql`
  fragment DeliveryTaskReadLifecycle on DeliveryTaskLifecycle {
    status
    cycle
    deliveredAt
    nextCheckAt
    deliveredSubmissionVersion
    timezone
  }
`;
export const GET_TASK_CONTEXT = gql`
  query DeliveryWorkspaceContext {
    deliveryWorkspaceContext {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        memberId
        isAdmin
        isManager
        capabilities
        roleIds
      }
      projects {
        id
        revision
        name
        companyId
        memberIds
      }
      members {
        id
        name
        access
        roleLabel
      }
      companies {
        id
        name
      }
    }
  }
`;
export const GET_TASK_LIST = gql`
  query DeliveryTaskList($input: DeliveryTaskListInput!) {
    deliveryTaskList(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      pageReferenceAt
      timezone
      businessDate
      totalCount
      byState {
        key
        count
      }
      byWorkGroup {
        key
        count
      }
      overview {
        totalCount
        approvedCount
        overdueCount
        reviewCount
        dueTodayCount
        blockedCount
      }
      serviceOptions
      nextCursor
      items {
        id
        title
        projectId
        projectName
        revision
        assigneeId
        assigneeName
        service
        state
        priority
        scheduledDate
        dueAt
        workGroup
        checklistDone
        checklistTotal
        hasCreative
        blockerPreview
        blockerTruncated
        warnings
        review {
          ...DeliveryTaskReadReview
        }
        delivery {
          ...DeliveryTaskReadLifecycle
        }
      }
    }
  }
  ${REVIEW}
  ${LIFECYCLE}
`;
export const GET_TASK_DETAIL = gql`
  query DeliveryTaskDetail($input: DeliveryTaskDetailInput!) {
    deliveryTaskDetail(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      task {
        id
        title
        assigneeId
        dueAt
        projectId
        revision
        details
        review {
          ...DeliveryTaskReadReview
        }
        delivery {
          ...DeliveryTaskReadLifecycle
        }
      }
    }
  }
  ${REVIEW}
  ${LIFECYCLE}
`;
export const CHANGE_TASK = gql`
  mutation ChangeDeliveryTask($input: DeliveryTaskCommandInput!) {
    changeDeliveryTask(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      revision
      state
    }
  }
`;
export const SEE_TASK_ASSIGNMENT = gql`
  mutation SeeDeliveryTaskAssignment($input: DeliveryTaskAssignmentSeenInput!) {
    seeDeliveryTaskAssignment(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      seen
    }
  }
`;
