export const FORM_FIELD_TYPES = ['text', 'email', 'phone', 'textarea'] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

// Only these keys may be mapped onto Person/Company records on submission
export const FORM_FIELD_KEYS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'message',
] as const;

export type FormFieldKey = (typeof FORM_FIELD_KEYS)[number];

export type FormFieldDefinition = {
  key: FormFieldKey;
  label: string;
  type: FormFieldType;
  required: boolean;
};

// Keys mapped onto dedicated Person fields on submission; the rest are stored
// verbatim in person.leadFormAnswers
export const FORM_PERSON_MAPPED_FIELD_KEYS: readonly FormFieldKey[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
];
