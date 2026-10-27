import { gql } from '@apollo/client';

export const GET_OTOGROW_ACTIVITY = gql`
  query OtogrowActivity($input: OtogrowActivityInput!) {
    otogrowActivity(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      events {
        id
        occurredAt
        actorId
        actorName
        actorType
        subjectMemberId
        subjectName
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
      nextCursor
      people {
        id
        name
      }
      projects {
        id
        name
      }
      clients {
        id
        name
      }
      coverageStartedAt
    }
  }
`;
