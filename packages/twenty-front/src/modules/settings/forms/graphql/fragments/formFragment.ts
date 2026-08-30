import gql from 'graphql-tag';

export const FORM_FRAGMENT = gql`
  fragment FormFragment on Form {
    id
    name
    publicId
    fields {
      key
      label
      type
      required
    }
    successMessage
    isActive
    createdAt
    updatedAt
  }
`;
