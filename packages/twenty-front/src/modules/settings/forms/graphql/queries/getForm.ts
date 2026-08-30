import gql from 'graphql-tag';
import { FORM_FRAGMENT } from '@/settings/forms/graphql/fragments/formFragment';

export const GET_FORM = gql`
  query GetForm($id: UUID!) {
    form(id: $id) {
      ...FormFragment
    }
  }
  ${FORM_FRAGMENT}
`;
