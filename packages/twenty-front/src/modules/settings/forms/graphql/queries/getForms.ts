import gql from 'graphql-tag';
import { FORM_FRAGMENT } from '@/settings/forms/graphql/fragments/formFragment';

export const GET_FORMS = gql`
  query GetForms {
    forms {
      ...FormFragment
    }
  }
  ${FORM_FRAGMENT}
`;
