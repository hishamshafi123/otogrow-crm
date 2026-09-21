import { gql } from '@apollo/client';

export const GET_META_LEAD_FORMS = gql`
  query MetaLeadForms {
    metaLeadFormActivity {
      formId
      totalCount
      unreadCount
    }
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
      isUnread
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
  isUnread: boolean;
  id: string;
  leadId: string;
  personId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: { label: string; value: string }[];
  createdAt: string;
};

export const MARK_META_SHEET_LEADS_READ = gql`
  mutation MarkMetaSheetLeadsRead($formId: UUID!, $leadIds: [UUID!]!) {
    markMetaSheetLeadsRead(formId: $formId, leadIds: $leadIds)
  }
`;
export type MetaLeadFormActivity = {
  formId: string;
  totalCount: number;
  unreadCount: number;
};
