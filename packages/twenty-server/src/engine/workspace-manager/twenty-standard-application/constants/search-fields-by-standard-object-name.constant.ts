import { FieldMetadataType } from 'twenty-shared/types';

import { type AllStandardObjectFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-field-name.type';
import { type AllStandardObjectName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-name.type';

export const SEARCH_FIELDS_BY_STANDARD_OBJECT_NAME = {
  attachment: [{ name: 'name', type: FieldMetadataType.TEXT }],
  blocklist: [{ name: 'handle', type: FieldMetadataType.TEXT }],
  calendarChannelEventAssociation: [
    { name: 'eventExternalId', type: FieldMetadataType.TEXT },
  ],
  calendarEvent: [{ name: 'title', type: FieldMetadataType.TEXT }],
  calendarEventParticipant: [{ name: 'handle', type: FieldMetadataType.TEXT }],
  callRecording: [{ name: 'title', type: FieldMetadataType.TEXT }],
  company: [
    { name: 'name', type: FieldMetadataType.TEXT },
    { name: 'domainName', type: FieldMetadataType.LINKS },
  ],
  dashboard: [{ name: 'title', type: FieldMetadataType.TEXT }],
  message: [{ name: 'subject', type: FieldMetadataType.TEXT }],
  messageCampaign: [
    { name: 'name', type: FieldMetadataType.TEXT },
    { name: 'subject', type: FieldMetadataType.TEXT },
  ],
  messageChannelMessageAssociation: [
    { name: 'messageExternalId', type: FieldMetadataType.TEXT },
  ],
  messageChannelMessageAssociationMessageFolder: [],
  messageList: [{ name: 'name', type: FieldMetadataType.TEXT }],
  messageListMember: [{ name: 'id', type: FieldMetadataType.UUID }],
  messageParticipant: [{ name: 'handle', type: FieldMetadataType.TEXT }],
  messageThread: [{ name: 'subject', type: FieldMetadataType.TEXT }],
  note: [
    { name: 'title', type: FieldMetadataType.TEXT },
    { name: 'bodyV2', type: FieldMetadataType.RICH_TEXT },
  ],
  noteTarget: [{ name: 'id', type: FieldMetadataType.UUID }],
  opportunity: [{ name: 'name', type: FieldMetadataType.TEXT }],
  person: [
    { name: 'name', type: FieldMetadataType.FULL_NAME },
    { name: 'emails', type: FieldMetadataType.EMAILS },
    { name: 'phones', type: FieldMetadataType.PHONES },
    { name: 'jobTitle', type: FieldMetadataType.TEXT },
  ],
  task: [
    { name: 'title', type: FieldMetadataType.TEXT },
    { name: 'bodyV2', type: FieldMetadataType.RICH_TEXT },
  ],
  taskTarget: [{ name: 'id', type: FieldMetadataType.UUID }],
  sequence: [{ name: 'name', type: FieldMetadataType.TEXT }],
  sequenceStep: [{ name: 'id', type: FieldMetadataType.UUID }],
  sequenceEnrollment: [{ name: 'id', type: FieldMetadataType.UUID }],
  channelMessage: [{ name: 'body', type: FieldMetadataType.TEXT }],
  call: [
    { name: 'fromNumber', type: FieldMetadataType.TEXT },
    { name: 'toNumber', type: FieldMetadataType.TEXT },
  ],
  leadScoringRule: [{ name: 'name', type: FieldMetadataType.TEXT }],
  leadScoreEvent: [{ name: 'reason', type: FieldMetadataType.TEXT }],
  priceBookItem: [{ name: 'name', type: FieldMetadataType.TEXT }],
  quote: [{ name: 'quoteNumber', type: FieldMetadataType.TEXT }],
  quoteLineItem: [{ name: 'label', type: FieldMetadataType.TEXT }],
  timelineActivity: [
    { name: 'linkedRecordCachedName', type: FieldMetadataType.TEXT },
  ],
  workflow: [{ name: 'name', type: FieldMetadataType.TEXT }],
  workflowAutomatedTrigger: [{ name: 'id', type: FieldMetadataType.UUID }],
  workflowRun: [{ name: 'name', type: FieldMetadataType.TEXT }],
  workflowVersion: [{ name: 'name', type: FieldMetadataType.TEXT }],
  workspaceMember: [
    { name: 'name', type: FieldMetadataType.FULL_NAME },
    { name: 'userEmail', type: FieldMetadataType.TEXT },
  ],
} satisfies {
  [ObjectName in AllStandardObjectName]: {
    name: AllStandardObjectFieldName<ObjectName>;
    type: FieldMetadataType;
  }[];
};
