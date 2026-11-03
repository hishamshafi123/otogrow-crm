import { gql } from '@apollo/client';

export const ACTIVITY_EVENT_FIELDS = gql`
  fragment ActivityEventFields on OtogrowActivityEvent {
    id
    occurredAt
    actorId
    actorName
    actorType
    subjectMemberId
    subjectName
    detailsTruncated
    action
    category
    outcome
    summary
    projectId
    projectName
    clientId
    clientName
    taskId
    taskName
    agentName
    sourceType
    sourceId
    changes {
      field
      before
      after
    }
  }
`;
export const GET_ACTIVITY_CONTEXT = gql`
  query OtogrowActivityContext {
    otogrowActivityContext {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        memberId
        isAdmin
        isManager
        roleIds
        capabilities
      }
      coverageStartedAt
      canAnalyze
    }
  }
`;
export const GET_ACTIVITY_PAGE = gql`
  query OtogrowActivityPage($input: OtogrowActivityPageInput!) {
    otogrowActivityPage(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        memberId
        isAdmin
        isManager
        roleIds
        capabilities
      }
      filters {
        personId
        projectId
        clientId
        category
        action
        outcome
        from
        through
      }
      totalCount
      nextCursor
      coverageStartedAt
      events {
        ...ActivityEventFields
      }
    }
  }
  ${ACTIVITY_EVENT_FIELDS}
`;
export const GET_ACTIVITY_OPTIONS = gql`
  query OtogrowActivityOptions($input: OtogrowActivityOptionsInput!) {
    otogrowActivityOptions(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        memberId
        isAdmin
        isManager
        roleIds
        capabilities
      }
      totalCount
      nextCursor
      items {
        id
        name
      }
      selected {
        id
        name
      }
    }
  }
`;
export const GET_ACTIVITY_EVENT = gql`
  query OtogrowActivityEvent($input: OtogrowActivityEventInput!) {
    otogrowActivityEvent(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        memberId
        isAdmin
        isManager
        roleIds
        capabilities
      }
      event {
        ...ActivityEventFields
      }
    }
  }
  ${ACTIVITY_EVENT_FIELDS}
`;
