import gql from 'graphql-tag';
import { FORM_FRAGMENT } from '@/settings/forms/graphql/fragments/formFragment';

export const CREATE_FORM = gql`
  mutation CreateForm($input: CreateFormInput!) {
    createForm(input: $input) {
      ...FormFragment
    }
  }
  ${FORM_FRAGMENT}
`;
