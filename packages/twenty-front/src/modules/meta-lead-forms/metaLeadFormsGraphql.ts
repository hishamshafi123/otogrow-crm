import { gql } from '@apollo/client';

export const GET_META_LEAD_FORMS = gql`
  query MetaLeadForms {
    metaLeadForms {
      id
      name
      spreadsheetId
      sheetId
      isActive
      lastSyncedAt
      lastError
    }
  }
`;
export const GET_META_SHEET_LEADS = gql`
  query MetaSheetLeads($formId: UUID!, $offset: Int!) {
    metaSheetLeads(formId: $formId, offset: $offset) {
      id
      leadId
      personId
      name
      email
      phone
      answers {
        label
        value
      }
      createdAt
    }
  }
`;
export const CREATE_META_LEAD_FORM = gql`
  mutation CreateMetaLeadForm($input: CreateMetaLeadFormInput!) {
    createMetaLeadForm(input: $input) {
      id
    }
  }
`;
export const SYNC_META_LEAD_FORM = gql`
  mutation SyncMetaLeadForm($id: UUID!) {
    syncMetaLeadForm(id: $id) {
      id
      lastSyncedAt
      lastError
    }
  }
`;
export const SET_META_LEAD_FORM_ACTIVE = gql`
  mutation SetMetaLeadFormActive($id: UUID!, $isActive: Boolean!) {
    setMetaLeadFormActive(id: $id, isActive: $isActive) {
      id
      isActive
    }
  }
`;
export type MetaLeadForm = {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetId: number;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};
export type MetaSheetLead = {
  id: string;
  leadId: string;
  personId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: { label: string; value: string }[];
  createdAt: string;
};
