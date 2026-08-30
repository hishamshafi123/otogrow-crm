import gql from 'graphql-tag';

export const DELETE_FORM = gql`
  mutation DeleteForm($id: UUID!) {
    deleteForm(id: $id) {
      id
    }
  }
`;
