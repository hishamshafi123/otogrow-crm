import gql from 'graphql-tag';
import { FORM_FRAGMENT } from '@/settings/forms/graphql/fragments/formFragment';

export const UPDATE_FORM = gql`
  mutation UpdateForm($input: UpdateFormInput!) {
    updateForm(input: $input) {
      ...FormFragment
    }
  }
  ${FORM_FRAGMENT}
`;
