export type LeadFormFieldType = 'text' | 'email' | 'phone' | 'textarea';

// Mirrors FORM_FIELD_KEYS on the server: only these keys may be collected
export const LEAD_FORM_FIELD_DEFINITIONS = [
  { key: 'firstName', label: 'First name', type: 'text' },
  { key: 'lastName', label: 'Last name', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'jobTitle', label: 'Job title', type: 'text' },
  { key: 'message', label: 'Message', type: 'textarea' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  type: LeadFormFieldType;
}>;

export type LeadFormFieldKey =
  (typeof LEAD_FORM_FIELD_DEFINITIONS)[number]['key'];
