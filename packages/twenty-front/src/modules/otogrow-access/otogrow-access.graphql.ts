import { gql } from '@apollo/client';

const ACCESS_FIELDS = gql`
  fragment OtogrowAccessFields on OtogrowAccess {
    workspaceId
    memberId
    userWorkspaceId
    roleIds
    capabilities
    nativeAdministrator
    grants {
      capability
      sourceId
      sourceName
      sourceType
    }
  }
`;
export const GET_OTOGROW_ACCESS = gql`
  query OtogrowAccess {
    otogrowAccess {
      ...OtogrowAccessFields
    }
  }
  ${ACCESS_FIELDS}
`;
const DIRECTORY_FIELDS = gql`
  fragment OtogrowDirectoryFields on OtogrowRoleDirectory {
    actor {
      ...OtogrowAccessFields
    }
    roles {
      id
      name
      description
      capabilities
      revision
    }
    members {
      memberId
      name
      roleIds
      revision
      access {
        ...OtogrowAccessFields
      }
    }
  }
  ${ACCESS_FIELDS}
`;
export const GET_OTOGROW_ROLE_DIRECTORY = gql`
  query OtogrowRoleDirectory {
    otogrowRoleDirectory {
      ...OtogrowDirectoryFields
    }
  }
  ${DIRECTORY_FIELDS}
`;
export const SAVE_OTOGROW_ROLE = gql`
  mutation SaveOtogrowRole($input: OtogrowRoleInput!) {
    saveOtogrowRole(input: $input) {
      ...OtogrowDirectoryFields
    }
  }
  ${DIRECTORY_FIELDS}
`;
export const ASSIGN_OTOGROW_ROLES = gql`
  mutation AssignOtogrowRoles($input: OtogrowRoleAssignmentInput!) {
    assignOtogrowRoles(input: $input) {
      ...OtogrowDirectoryFields
    }
  }
  ${DIRECTORY_FIELDS}
`;
