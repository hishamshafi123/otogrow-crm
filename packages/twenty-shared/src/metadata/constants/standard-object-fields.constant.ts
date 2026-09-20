import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from '@/application/constants/TwentyStandardApplicationUniversalIdentifier';
import { getSystemRelationFieldUniversalIdentifier } from '@/application/deterministic-identifier/get-system-relation-field-universal-identifier.util';
import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from '@/metadata/constants/standard-object-universal-identifiers.constant';
import { buildStandardObjectSystemFields } from '@/metadata/utils/internal/build-standard-object-system-fields.util';

// Important notice:
// - Never ever mutate an existing universal identifier
// - Deleting an existing universal identifier should be very rare
// - System field universal identifiers (id, createdAt, updatedAt, deletedAt,
//   createdBy, updatedBy, position, searchVector) are deterministically derived
//   from the standard application universal identifier, the object universal
//   identifier and the field name (buildStandardObjectSystemFields). The name
//   field is a default field, not a system field, and keeps its hardcoded
//   universal identifier.
// - System relation field universal identifiers are deterministically derived
//   from the object + the relation target object
//   (getSystemRelationFieldUniversalIdentifier).
//
// Fields live in their own const so that both STANDARD_OBJECTS' `fields` and
// its INDEX view (buildStandardObjectIndexView) can read the same field
// universal identifiers.
export const STANDARD_OBJECT_FIELDS = {
  timelineActivity: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
    ),
    name: { universalIdentifier: '20202020-7207-46e8-9dab-849505ae8497' },
    timelineActivityTypeId: {
      universalIdentifier: '20202020-e5f8-4839-9dcf-781e260624ee',
    },
    happensAt: {
      universalIdentifier: '20202020-9526-4993-b339-c4318c4d39f0',
    },
    properties: {
      universalIdentifier: '20202020-f142-4b04-b91b-6a2b4af3bf11',
    },
    workspaceMember: {
      universalIdentifier: '20202020-af23-4479-9a30-868edc474b36',
    },
    targetPerson: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
      }),
    },
    targetCompany: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
      }),
    },
    targetOpportunity: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
      }),
    },
    targetTask: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task,
      }),
    },
    targetNote: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note,
      }),
    },
    targetWorkflow: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflow,
      }),
    },
    targetWorkflowVersion: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowVersion,
      }),
    },
    targetWorkflowRun: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowRun,
      }),
    },
    targetDashboard: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard,
      }),
    },
    targetMessageList: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageList,
      }),
    },
    targetMessageCampaign: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageCampaign,
      }),
    },
    linkedRecordCachedName: {
      universalIdentifier: '20202020-cfdb-4bef-bbce-a29f41230934',
    },
    linkedRecordId: {
      universalIdentifier: '20202020-2e0e-48c0-b445-ee6c1e61687d',
    },
    linkedObjectMetadataId: {
      universalIdentifier: '20202020-c595-449d-9f89-562758c9ee69',
    },
  },
  attachment: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
    ),
    name: { universalIdentifier: '20202020-87a5-48f8-bbf7-ade388825a57' },
    file: { universalIdentifier: '20202020-15db-460e-8166-c7b5d87ad4be' },
    //deprecated
    fullPath: { universalIdentifier: '20202020-0d19-453d-8e8d-fbcda8ca3747' },
    //deprecated
    fileCategory: {
      universalIdentifier: '20202020-8c3f-4d9e-9a1b-2e5f7a8c9d0e',
    },
    targetTask: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task,
      }),
    },
    targetNote: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note,
      }),
    },
    targetPerson: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
      }),
    },
    targetCompany: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
      }),
    },
    targetOpportunity: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
      }),
    },
    targetDashboard: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard,
      }),
    },
    targetWorkflow: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflow,
      }),
    },
  },
  blocklist: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.blocklist,
    ),
    handle: { universalIdentifier: '20202020-eef3-44ed-aa32-4641d7fd4a3e' },
    workspaceMember: {
      universalIdentifier: '20202020-548d-4084-a947-fa20a39f7c06',
    },
  },
  calendarChannelEventAssociation: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarChannelEventAssociation,
    ),
    calendarChannelId: {
      universalIdentifier: '20202020-93ee-4da4-8d58-0282c4a9cb7d',
    },
    calendarEvent: {
      universalIdentifier: '20202020-5aa5-437e-bb86-f42d457783e3',
    },
    eventExternalId: {
      universalIdentifier: '20202020-9ec8-48bb-b279-21d0734a75a1',
    },
    recurringEventExternalId: {
      universalIdentifier: '20202020-c58f-4c69-9bf8-9518fa31aa50',
    },
  },
  calendarEventParticipant: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEventParticipant,
    ),
    calendarEvent: {
      universalIdentifier: '20202020-fe3a-401c-b889-af4f4657a861',
    },
    handle: {
      universalIdentifier: '20202020-8692-4580-8210-9e09cbd031a7',
    },
    displayName: {
      universalIdentifier: '20202020-ee1e-4f9f-8ac1-5c0b2f69691e',
    },
    isOrganizer: {
      universalIdentifier: '20202020-66e7-4e00-9e06-d06c92650580',
    },
    responseStatus: {
      universalIdentifier: '20202020-cec0-4be8-8fba-c366abc23147',
    },
    person: {
      universalIdentifier: '20202020-5761-4842-8186-e1898ef93966',
    },
    workspaceMember: {
      universalIdentifier: '20202020-20e4-4591-93ed-aeb17a4dcbd2',
    },
  },
  calendarEvent: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEvent,
    ),
    title: { universalIdentifier: '20202020-080e-49d1-b21d-9702a7e2525c' },
    isCanceled: {
      universalIdentifier: '20202020-335b-4e04-b470-43b84b64863c',
    },
    isFullDay: {
      universalIdentifier: '20202020-551c-402c-bb6d-dfe9efe86bcb',
    },
    startsAt: {
      universalIdentifier: '20202020-2c57-4c75-93c5-2ac950a6ed67',
    },
    endsAt: { universalIdentifier: '20202020-2554-4ee1-a617-17907f6bab21' },
    externalCreatedAt: {
      universalIdentifier: '20202020-9f03-4058-a898-346c62181599',
    },
    externalUpdatedAt: {
      universalIdentifier: '20202020-b355-4c18-8825-ef42c8a5a755',
    },
    description: {
      universalIdentifier: '20202020-52c4-4266-a98f-e90af0b4d271',
    },
    location: {
      universalIdentifier: '20202020-641a-4ffe-960d-c3c186d95b17',
    },
    iCalUid: {
      universalIdentifier: '20202020-f24b-45f4-b6a3-d2f9fcb98714',
    },
    conferenceSolution: {
      universalIdentifier: '20202020-1c3f-4b5a-b526-5411a82179eb',
    },
    conferenceLink: {
      universalIdentifier: '20202020-35da-43ef-9ca0-e936e9dc237b',
    },
    calendarChannelEventAssociations: {
      universalIdentifier: '20202020-bdf8-4572-a2cc-ecbb6bcc3a02',
    },
    calendarEventParticipants: {
      universalIdentifier: '20202020-e07e-4ccb-88f5-6f3d00458eec',
    },
    callRecordings: {
      universalIdentifier: '48d6d151-18e2-4111-b405-d85fb9d860d8',
    },
  },
  callRecording: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.callRecording,
    ),
    title: {
      universalIdentifier: '4cff8863-a1d1-45fd-a370-4eb6aa1f2a5b',
    },
    status: {
      universalIdentifier: '3e617680-d93e-4309-a54f-90f69528bfd7',
    },
    recordingRequestStatus: {
      universalIdentifier: '7fd681c9-244c-4e98-8939-7b175d472638',
    },
    applicationId: {
      universalIdentifier: '24ec1239-1240-42cb-8a2d-302632378e09',
    },
    externalBotId: {
      universalIdentifier: '0a2da128-9bcc-488b-bc31-65318c41bdf9',
    },
    externalRecordingId: {
      universalIdentifier: '6d17fb71-324b-4625-a5be-b3580607e2c7',
    },
    startedAt: {
      universalIdentifier: '6c56c23f-1987-410a-860a-df3b2b3f9a33',
    },
    endedAt: {
      universalIdentifier: '7a38a9cf-8424-4d6e-b80a-6883d3c662ef',
    },
    video: {
      universalIdentifier: 'bb9523d3-457e-4f4b-8c79-27a77afb87da',
    },
    audio: {
      universalIdentifier: '2eafc2d0-8fec-430c-a939-65ca5fbc0f08',
    },
    transcript: {
      universalIdentifier: '27b86d68-57d1-4607-aca0-191896b1ad43',
    },
    summary: {
      universalIdentifier: 'adb0f472-756b-4d3f-b21e-ea32bf73a5e4',
    },
    calendarEvent: {
      universalIdentifier: '49e64b28-bd98-4775-80ea-4781bdd45e35',
    },
  },
  company: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
    ),
    name: { universalIdentifier: '20202020-4d99-4e2e-a84c-4a27837b1ece' },
    domainName: {
      universalIdentifier: '20202020-0c28-43d8-8ba5-3659924d3489',
    },
    address: { universalIdentifier: '20202020-c5ce-4adc-b7b6-9c0979fc55e7' },
    linkedinLink: {
      universalIdentifier: '20202020-ebeb-4beb-b9ad-6848036fb451',
    },
    annualRevenue: {
      universalIdentifier: '60f533b7-2166-4071-a767-ceb0286822fd',
    },
    people: { universalIdentifier: '20202020-3213-4ddf-9494-6422bcff8d7c' },
    accountOwner: {
      universalIdentifier: '20202020-95b8-4e10-9881-edb5d4765f9d',
    },
    taskTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
      }),
    },
    noteTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
      }),
    },
    opportunities: {
      universalIdentifier: '20202020-add3-4658-8e23-d70dccb6d0ec',
    },
    quotes: {
      universalIdentifier: 'bc2c5e39-908e-4688-b7c1-78feb1d58c42',
    },
    calls: {
      universalIdentifier: '7a1e67cb-d4ae-434b-9473-527ace78020b',
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  dashboard: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard,
    ),
    title: { universalIdentifier: '20202020-20ee-4091-95dc-44b57eda3a89' },
    pageLayoutId: {
      universalIdentifier: '20202020-bb53-4648-aa36-1d9d54e6f7f2',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
  },
  messageCampaign: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageCampaign,
    ),
    name: { universalIdentifier: 'dc8bca0e-37c4-4b78-814d-2e91124274e3' },
    subject: { universalIdentifier: '7251544c-b07a-4f0d-9d0a-48514367f230' },
    bodyTemplate: {
      universalIdentifier: 'b3a69d08-31ca-4a8d-8359-5ca462899342',
    },
    fromAddress: {
      universalIdentifier: '91e1a33c-c1ff-411a-b720-9085e13c05db',
    },
    status: { universalIdentifier: 'c7117256-3de6-48e1-87df-c99c32bad610' },
    sentAt: { universalIdentifier: 'e2315b4f-9edf-4df2-96b9-961e76368671' },
    sentCount: {
      universalIdentifier: '2f333d2b-37b8-4ddc-ad0d-c07c6ce066ad',
    },
    failedCount: {
      universalIdentifier: 'd373fcd7-b1ce-4c77-8031-a5785c475028',
    },
    bouncedCount: {
      universalIdentifier: '20d884a9-34dd-4667-8ecb-ceec224258e2',
    },
    complainedCount: {
      universalIdentifier: '82842cfa-f12a-4bab-bbde-b2cf587d0406',
    },
    unsubscribeTopicId: {
      universalIdentifier: '0648e7ad-1769-4ff6-a4d5-72da79ef169c',
    },
    list: { universalIdentifier: 'cb24dcdf-f0e8-4c71-8cff-70b714e86530' },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageCampaign,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
    messages: { universalIdentifier: 'e5a177a7-512b-4778-928e-69777a528f7c' },
    recipients: {
      universalIdentifier: '05a3271c-5b91-493c-8f30-2d27b31d019e',
    },
  },
  messageList: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageList,
    ),
    name: { universalIdentifier: '69b9ed8b-7b26-4108-894f-05700ef7e8ee' },
    members: {
      universalIdentifier: '92df3493-91cf-4665-8587-1b08917d299b',
    },
    campaigns: {
      universalIdentifier: 'e098d838-31ab-4812-91a8-f055f45a6832',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageList,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  messageListMember: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageListMember,
    ),
    person: { universalIdentifier: '34288425-8805-42fb-8b98-ee13d09be3d3' },
    list: {
      universalIdentifier: 'd5402005-e8f9-4fbe-8696-b6723cd85018',
    },
  },
  messageChannelMessageAssociation: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageChannelMessageAssociation,
    ),
    messageChannelId: {
      universalIdentifier: '20202020-b658-408f-bd46-3bd2d15d7e52',
    },
    message: {
      universalIdentifier: '20202020-da5d-4ac5-8743-342ab0a0336b',
    },
    messageExternalId: {
      universalIdentifier: '20202020-37d6-438f-b6fd-6503596c8f34',
    },
    messageThread: {
      universalIdentifier: '20202020-fac8-42a8-94dd-44dbc920ae16',
    },
    messageThreadExternalId: {
      universalIdentifier: '20202020-35fb-421e-afa0-0b8e8f7f9018',
    },
    direction: {
      universalIdentifier: '75c9b0f7-9e76-44d4-a2f9-47051e61eec7',
    },
    messageFolders: {
      universalIdentifier: '9bfc9da7-ae2d-44fd-9563-ede90c5d6222',
    },
  },
  messageChannelMessageAssociationMessageFolder: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageChannelMessageAssociationMessageFolder,
    ),
    messageChannelMessageAssociation: {
      universalIdentifier: '7411cfa3-4fd9-4b90-a636-940015fd7243',
    },
    messageFolderId: {
      universalIdentifier: 'b3369d31-3856-4a7a-b007-ee353918127c',
    },
  },
  messageParticipant: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageParticipant,
    ),
    message: {
      universalIdentifier: '20202020-985b-429a-9db9-9e55f4898a2a',
    },
    role: {
      universalIdentifier: '20202020-65d1-42f4-8729-c9ec1f52aecd',
    },
    handle: {
      universalIdentifier: '20202020-2456-464e-b422-b965a4db4a0b',
    },
    displayName: {
      universalIdentifier: '20202020-36dd-4a4f-ac02-228425be9fac',
    },
    person: {
      universalIdentifier: '20202020-249d-4e0f-82cd-1b9df5cd3da2',
    },
    workspaceMember: {
      universalIdentifier: '20202020-77a7-4845-99ed-1bcbb478be6f',
    },
    messageCampaign: {
      universalIdentifier: '5bc768db-919f-41da-8c43-df08084d526f',
    },
  },
  messageThread: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread,
    ),
    messages: {
      universalIdentifier: '20202020-3115-404f-aade-e1154b28e35a',
    },
    messageChannelMessageAssociations: {
      universalIdentifier: '20202020-314e-40a4-906d-a5d5d6c285f6',
    },
    subject: {
      universalIdentifier: 'a8ddbf8c-1137-45d1-b89e-5ffbd83f67c8',
    },
  },
  sequence: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.sequence,
    ),
    name: { universalIdentifier: 'e498860c-a04e-493f-9dc4-bb3519f7774f' },
    status: { universalIdentifier: '675d051c-29ba-4d96-8dcf-10ab300ff728' },
    businessHoursTimeZone: {
      universalIdentifier: 'e3cade10-d649-4a73-a3ab-d349f43abbad',
    },
    dailySendCap: {
      universalIdentifier: '4e7f2abb-3158-4af6-bb17-4a5638e4efdc',
    },
    unsubscribeTopicId: {
      universalIdentifier: '8bce3b5e-52ba-4ff8-aad4-4e76432f324a',
    },
    owner: { universalIdentifier: 'e821d456-0724-4ef3-97e8-676a9d987c17' },
    steps: { universalIdentifier: '895426ce-2eb5-4b13-bac5-169fb03a9557' },
    enrollments: {
      universalIdentifier: '1a9da64f-a0df-4a01-b6ee-f265e01953b4',
    },
  },
  sequenceStep: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.sequenceStep,
    ),
    stepPosition: {
      universalIdentifier: 'ac66d6dc-8d74-4858-8bcc-df4ed4e59905',
    },
    delayValue: {
      universalIdentifier: '8b8834ab-1797-4f5f-ae33-8a03ec6b8183',
    },
    delayUnit: {
      universalIdentifier: '8e6a9be8-efce-41fc-9602-6cac4f078b3f',
    },
    channel: {
      universalIdentifier: 'f2757f2e-4b74-4ee7-bd8e-9bb4880f5d90',
    },
    subject: { universalIdentifier: 'ef5026da-7c49-459b-9bf8-5fd466f20388' },
    body: { universalIdentifier: '3fe05fc4-0b28-424e-8856-b2c4d72d26cc' },
    whatsappTemplateName: {
      universalIdentifier: 'a20e0bac-02a6-48ec-8edb-598eff7bee43',
    },
    whatsappTemplateParams: {
      universalIdentifier: '5db8e6a5-086c-4540-8826-c427cd95d211',
    },
    sequence: {
      universalIdentifier: '8f003133-efad-4334-9550-58dc23f15a17',
    },
  },
  sequenceEnrollment: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.sequenceEnrollment,
    ),
    sequence: {
      universalIdentifier: '8b422f7c-ca35-4f16-91b3-eb766da46cc7',
    },
    person: {
      universalIdentifier: 'd041d52d-8228-4629-a42a-e83983ed916b',
    },
    status: { universalIdentifier: 'a5d60176-9aea-4587-8316-11df6f874f63' },
    currentStepPosition: {
      universalIdentifier: '9c81d361-1d32-4727-a71b-ac41fecdbf6f',
    },
    nextSendAt: {
      universalIdentifier: 'b6a2937c-dd92-4e5d-bbc6-77a093d28aed',
    },
    lastSentAt: {
      universalIdentifier: '2d800d6f-52cb-41ca-b674-ad748979a5e1',
    },
    lastError: {
      universalIdentifier: '73eb1ca1-9e6f-4dd5-91d4-418f00a3665f',
    },
    threadExternalId: {
      universalIdentifier: '4f9b4151-9d74-4b2d-bae2-d8e47c6f53fe',
    },
    lastSentHeaderMessageId: {
      universalIdentifier: 'b2983b1f-57dc-45fc-8b0b-e6db8789ca4f',
    },
    messages: {
      universalIdentifier: '82c7d7c6-ee1b-4bff-b79d-c8394c6a9fdf',
    },
    channelMessages: {
      universalIdentifier: '417f8477-4424-4445-aaf9-e34ade45a115',
    },
  },
  channelMessage: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.channelMessage,
    ),
    channel: {
      universalIdentifier: '152a5da3-5c40-4b02-800f-455ce87876f9',
    },
    direction: {
      universalIdentifier: 'f9684c33-2fcd-46fe-aa8b-db2d2dd8425e',
    },
    fromNumber: {
      universalIdentifier: '36719aa3-1dd7-4724-965c-6cb24b839046',
    },
    toNumber: {
      universalIdentifier: '3d93bee2-ea2e-406b-a925-b851853eab35',
    },
    body: {
      universalIdentifier: 'd7ddb316-767b-4e3f-b040-b8378450bf27',
    },
    externalId: {
      universalIdentifier: '3067c857-2d24-41a3-be98-137a239faa93',
    },
    status: {
      universalIdentifier: 'b6c3de9e-9478-4f56-8e0d-e2c6d4bbcca4',
    },
    sentAt: {
      universalIdentifier: 'e29824e2-b09e-4ade-9cde-9ab1e255ab6f',
    },
    receivedAt: {
      universalIdentifier: 'b95649be-6d3c-42ae-a236-56232bbdf95f',
    },
    errorMessage: {
      universalIdentifier: '01bca018-5eb8-4824-99f1-bca61d951b05',
    },
    person: {
      universalIdentifier: 'e8f8459f-967f-48e9-8504-ab65cfbce64b',
    },
    sequenceEnrollment: {
      universalIdentifier: '2f5733db-856b-4036-8f86-8034f6296fa8',
    },
  },
  call: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.call,
    ),
    direction: {
      universalIdentifier: 'ab9df3fd-031a-4e9b-9c0e-1dc14aa478b0',
    },
    status: {
      universalIdentifier: 'f6082a7d-d752-4cd5-ad8b-53ad33741686',
    },
    fromNumber: {
      universalIdentifier: 'd17d0221-f35b-4428-8391-4bc6d6d1dd50',
    },
    toNumber: {
      universalIdentifier: 'cff8432d-69dd-4d47-b200-71eb84f02c0b',
    },
    durationSeconds: {
      universalIdentifier: '67cd8233-9cf3-4995-8ebf-d9b669168230',
    },
    startedAt: {
      universalIdentifier: '7501ad19-314c-4813-9093-4c9c77e0b131',
    },
    answeredAt: {
      universalIdentifier: 'cab3de85-9583-483f-ab1c-dcd0add3c04d',
    },
    endedAt: {
      universalIdentifier: 'a346bc79-72ce-4626-80ef-6628e7d1ba19',
    },
    externalId: {
      universalIdentifier: '3c9796ec-8bd7-44d5-80e9-119c84f981ab',
    },
    recordingSid: {
      universalIdentifier: 'a20d1433-2b45-4e6c-8e8e-208ef3ec3549',
    },
    errorMessage: {
      universalIdentifier: '13fe4327-e851-4f80-a367-a7b2167c2f73',
    },
    person: {
      universalIdentifier: '2c990c1b-c764-42d7-853b-d8ca75400d40',
    },
    company: {
      universalIdentifier: 'eda91468-ca3a-4330-bd9d-8c01408d3f0a',
    },
  },
  leadScoringRule: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.leadScoringRule,
    ),
    name: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c01' },
    ruleType: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c02' },
    property: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c03' },
    operator: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c04' },
    value: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c05' },
    eventType: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c06' },
    points: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c07' },
    isActive: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c08' },
    leadScoreEvents: {
      universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c09',
    },
  },
  leadScoreEvent: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.leadScoreEvent,
    ),
    person: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c10' },
    rule: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c11' },
    points: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c12' },
    reason: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c13' },
    eventKey: { universalIdentifier: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c14' },
  },
  priceBookItem: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.priceBookItem,
    ),
    name: { universalIdentifier: '7a7ae7df-6a82-4d48-8c69-14f690d53953' },
    description: {
      universalIdentifier: '666bc04d-ae6e-4e04-bfa3-a0b114f0a620',
    },
    sku: { universalIdentifier: 'cc867dc8-f0a0-4f80-b0b5-822cdf77148d' },
    unitPrice: {
      universalIdentifier: '2137b274-ddfb-41ca-9d3c-90aeb0f2d262',
    },
    bulkMinQuantity: {
      universalIdentifier: 'd6cbd07e-124c-4419-aaef-703f5f6e019a',
    },
    bulkUnitPrice: {
      universalIdentifier: '1a976d7d-914b-47fa-abce-90bfef070d7a',
    },
    isActive: { universalIdentifier: 'b22e4d26-850d-40d7-8e75-11adff7f0fc4' },
    quoteLineItems: {
      universalIdentifier: 'c1377257-470f-4a41-9326-edb3ab0b3bb3',
    },
  },
  quote: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.quote,
    ),
    quoteNumber: {
      universalIdentifier: '874ca5c7-c5a6-4e50-9d94-bb78abec42e4',
    },
    status: { universalIdentifier: 'abe819eb-470d-4ca8-b65d-4f4316a99b8f' },
    taxPercent: {
      universalIdentifier: '5272c6a9-242e-4fe1-9f03-4deda3d18764',
    },
    validUntil: {
      universalIdentifier: 'cdd0f90b-b5f3-4d83-85eb-03075f28e947',
    },
    subtotal: { universalIdentifier: '5d82a1f1-d5a4-48fd-95de-a5d2ef522a39' },
    taxAmount: { universalIdentifier: '89cf389f-a3f5-445a-9a5d-377e49f86280' },
    total: { universalIdentifier: '303eca39-0bd0-4989-8276-bfd5036119fe' },
    terms: { universalIdentifier: 'cb8c5009-684e-4d60-9e0c-8104c7a69bca' },
    company: { universalIdentifier: '6a4a53b0-326c-4568-9e9e-962824cdb661' },
    person: { universalIdentifier: 'e51db723-f167-4e83-b7ed-0bf1783ed24e' },
    opportunity: {
      universalIdentifier: '948b4aff-c752-4aad-8916-12dac899fba0',
    },
    lineItems: { universalIdentifier: 'df11f899-dcc1-49b3-994e-eb04d16400f7' },
  },
  quoteLineItem: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.quoteLineItem,
    ),
    label: { universalIdentifier: '53e9baf7-7537-406f-b54f-fcbb78df83a0' },
    description: {
      universalIdentifier: '4f268389-02e4-4968-8de2-d5b83bd5f05a',
    },
    quantity: { universalIdentifier: '4fabf8c0-cf70-4de5-bbdf-776475360191' },
    unitPrice: { universalIdentifier: '7bcd48ea-892b-45ad-b951-4cb6550cb44e' },
    discountPercent: {
      universalIdentifier: 'aa0709e2-e06d-43c9-9adb-7bf332c5e287',
    },
    lineTotal: { universalIdentifier: '2cff4648-e7dd-4b99-86ed-35091bac12f1' },
    quote: { universalIdentifier: 'd465888c-2c73-491e-9d0e-6e23046c3100' },
    priceBookItem: {
      universalIdentifier: 'fc4ed78a-79ea-43f5-a567-e9a8d80dfd59',
    },
  },
  message: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.message,
    ),
    headerMessageId: {
      universalIdentifier: '20202020-72b5-416d-aed8-b55609067d01',
    },
    messageThread: {
      universalIdentifier: '20202020-30f2-4ccd-9f5c-e41bb9d26214',
    },
    subject: { universalIdentifier: '20202020-52d1-4036-b9ae-84bd722bb37a' },
    text: { universalIdentifier: '20202020-d2ee-4e7e-89de-9a0a9044a143' },
    receivedAt: {
      universalIdentifier: '20202020-140a-4a2a-9f86-f13b6a979afc',
    },
    messageParticipants: {
      universalIdentifier: '20202020-7cff-4a74-b63c-73228448cbd9',
    },
    messageChannelMessageAssociations: {
      universalIdentifier: '20202020-3cef-43a3-82c6-50e7cfbc9ae4',
    },
    messageCampaign: {
      universalIdentifier: '77cff00b-a0ba-48d6-80de-0d5ccf14e45b',
    },
    sequenceEnrollment: {
      universalIdentifier: '774039c3-3e0b-480a-9a93-113d878de632',
    },
    deliveryStatus: {
      universalIdentifier: '209254fa-2b89-429d-a72a-c401c4bd5a78',
    },
    isDraft: {
      universalIdentifier: '20202020-4d3a-4b6e-9c1f-2a5e7b9d0c34',
    },
  },
  note: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note,
    ),
    title: { universalIdentifier: '20202020-faeb-4c76-8ba6-ccbb0b4a965f' },
    bodyV2: { universalIdentifier: '20202020-a7bb-4d94-be51-8f25181502c8' },
    noteTargets: {
      universalIdentifier: '20202020-1f25-43fe-8b00-af212fdde823',
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  noteTarget: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
    ),
    note: { universalIdentifier: '20202020-57f3-4f50-9599-fc0f671df003' },
    targetPerson: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
      }),
    },
    targetCompany: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
      }),
    },
    targetOpportunity: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
      }),
    },
  },
  opportunity: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
    ),
    name: { universalIdentifier: '20202020-8609-4f65-a2d9-44009eb422b5' },
    amount: { universalIdentifier: '20202020-583e-4642-8533-db761d5fa82f' },
    closeDate: {
      universalIdentifier: '20202020-527e-44d6-b1ac-c4158d307b97',
    },
    stage: { universalIdentifier: '20202020-6f76-477d-8551-28cd65b2b4b9' },
    pointOfContact: {
      universalIdentifier: '20202020-8dfb-42fc-92b6-01afb759ed16',
    },
    company: { universalIdentifier: '20202020-cbac-457e-b565-adece5fc815f' },
    owner: { universalIdentifier: '20202020-be7e-4d1e-8e19-3d5c7c4b9f2a' },
    taskTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
      }),
    },
    noteTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
      }),
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
    quotes: {
      universalIdentifier: '0e215138-d725-4b03-9a2f-36e28bf939d0',
    },
  },
  person: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
    ),
    name: { universalIdentifier: '20202020-3875-44d5-8c33-a6239011cab8' },
    emails: { universalIdentifier: '20202020-3c51-43fa-8b6e-af39e29368ab' },
    linkedinLink: {
      universalIdentifier: '20202020-f1af-48f7-893b-2007a73dd508',
    },
    jobTitle: { universalIdentifier: '20202020-b0d0-415a-bef9-640a26dacd9b' },
    phones: { universalIdentifier: '20202020-0638-448e-8825-439134618022' },
    avatarUrl: {
      universalIdentifier: '20202020-b8a6-40df-961c-373dc5d2ec21',
    },
    avatarFile: {
      universalIdentifier: '20202020-a7c9-4e3d-8f1b-2d5a6b7c8e9f',
    },
    company: { universalIdentifier: '20202020-e2f3-448e-b34c-2d625f0025fd' },
    pointOfContactForOpportunities: {
      universalIdentifier: '20202020-911b-4a7d-b67b-918aa9a5b33a',
    },
    taskTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
      }),
    },
    noteTargets: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.noteTarget,
      }),
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
    messageParticipants: {
      universalIdentifier: '20202020-498e-4c61-8158-fa04f0638334',
    },
    calendarEventParticipants: {
      universalIdentifier: '20202020-52ee-45e9-a702-b64b3753e3a9',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
    listMemberships: {
      universalIdentifier: '8b8d1be0-4c94-4413-a2c9-c7ede205a81d',
    },
    sequenceEnrollments: {
      universalIdentifier: '694bbee9-cadc-47bc-8484-331989fe6b03',
    },
    channelMessages: {
      universalIdentifier: 'b45269c6-96e2-4817-9bad-78029aeb1c31',
    },
    calls: {
      universalIdentifier: 'd0eb757d-e4c8-42e4-a21f-34088c480927',
    },
    leadScore: {
      universalIdentifier: 'c9f2e7a4-1b5d-4a8e-9c6f-3e7b2d4a1f86',
    },
    leadSource: {
      universalIdentifier: '45d92089-6816-45f9-bc86-da42201d0b01',
    },
    leadScoreBand: {
      universalIdentifier: '6219e364-e137-483c-80d9-7ef805fe6a0d',
    },
    leadStatus: {
      universalIdentifier: '30bc6d77-2ce1-425e-8bb9-8ec6b1e28690',
    },
    leadFormName: {
      universalIdentifier: 'f0dcb5eb-b662-4512-8eec-687ff16c6df8',
    },
    leadFormAnswers: {
      universalIdentifier: 'b311f5ff-78a3-45d1-acf3-f8b690867779',
    },
    leadCaptureUrl: {
      universalIdentifier: 'd6429551-8194-4ebb-b29e-61890b485069',
    },
    leadScoreEvents: {
      universalIdentifier: 'c9f2e7a4-1b5d-4a8e-9c6f-3e7b2d4a1f87',
    },
    quotes: {
      universalIdentifier: '14b7b82a-98d2-47c8-9a9c-fa683a134945',
    },
  },
  task: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task,
    ),
    title: { universalIdentifier: '20202020-b386-4cb7-aa5a-08d4a4d92680' },
    bodyV2: { universalIdentifier: '20202020-4aa0-4ae8-898d-7df0afd47ab1' },
    dueAt: { universalIdentifier: '20202020-fd99-40da-951b-4cb9a352fce3' },
    status: { universalIdentifier: '20202020-70bc-48f9-89c5-6aa730b151e0' },
    taskTargets: {
      universalIdentifier: '20202020-de9c-4d0e-a452-713d4a3e5fc7',
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
    assignee: { universalIdentifier: '20202020-065a-4f42-a906-e20422c1753f' },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  taskTarget: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
    ),
    task: { universalIdentifier: '20202020-e881-457a-8758-74aaef4ae78a' },
    targetPerson: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person,
      }),
    },
    targetCompany: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company,
      }),
    },
    targetOpportunity: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.taskTarget,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity,
      }),
    },
  },
  workflow: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflow,
    ),
    name: { universalIdentifier: '20202020-b3d3-478f-acc0-5d901e725b20' },
    lastPublishedVersionId: {
      universalIdentifier: '20202020-326a-4fba-8639-3456c0a169e8',
    },
    coreWorkflowId: {
      universalIdentifier: '20202020-058a-42ad-8eb8-0662a5552aad',
    },
    statuses: { universalIdentifier: '20202020-357c-4432-8c50-8c31b4a552d9' },
    versions: { universalIdentifier: '20202020-9432-416e-8f3c-27ee3153d099' },
    runs: { universalIdentifier: '20202020-759b-4340-b58b-e73595c4df4f' },
    automatedTriggers: {
      universalIdentifier: '20202020-3319-4234-a34c-117ecad2b8a9',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflow,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
    attachments: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflow,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.attachment,
      }),
    },
  },
  workflowAutomatedTrigger: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowAutomatedTrigger,
    ),
    type: {
      universalIdentifier: '20202020-3319-4234-a34c-3f92c1ab56e7',
    },
    settings: {
      universalIdentifier: '20202020-3319-4234-a34c-bac8f903de12',
    },
    workflow: {
      universalIdentifier: '20202020-3319-4234-a34c-8e1a4d2f7c03',
    },
  },
  workflowRun: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowRun,
    ),
    name: { universalIdentifier: '20202020-b840-4253-aef9-4e5013694587' },
    workflowVersion: {
      universalIdentifier: '20202020-2f52-4ba8-8dc4-d0d6adb9578d',
    },
    workflow: {
      universalIdentifier: '20202020-8c57-4e7f-84f5-f373f68e1b82',
    },
    enqueuedAt: {
      universalIdentifier: '20202020-f1e3-4de1-a461-b5c4fdbc861d',
    },
    startedAt: {
      universalIdentifier: '20202020-a234-4e2d-bd15-85bcea6bb183',
    },
    endedAt: { universalIdentifier: '20202020-e1c1-4b6b-bbbd-b2beaf2e159e' },
    status: { universalIdentifier: '20202020-6b3e-4f9c-8c2b-2e5b8e6d6f3b' },
    state: { universalIdentifier: '20202020-611f-45f3-9cde-d64927e8ec57' },
    stepLogs: {
      universalIdentifier: '20202020-7c4e-4e1a-8fc1-1e3a55d6c2a1',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowRun,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  workflowVersion: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowVersion,
    ),
    name: { universalIdentifier: '20202020-a12f-4cca-9937-a2e40cc65509' },
    workflow: {
      universalIdentifier: '20202020-afa3-46c3-91b0-0631ca6aa1c8',
    },
    trigger: {
      universalIdentifier: '20202020-4eae-43e7-86e0-212b41a30b48',
    },
    status: {
      universalIdentifier: '20202020-5a34-440e-8a25-39d8c3d1d4cf',
    },
    runs: { universalIdentifier: '20202020-1d08-46df-901a-85045f18099a' },
    steps: { universalIdentifier: '20202020-5988-4a64-b94a-1f9b7b989039' },
    coreWorkflowVersionId: {
      universalIdentifier: '20202020-58b4-46e8-b6d2-f1f3c74cf7f4',
    },
    timelineActivities: {
      universalIdentifier: getSystemRelationFieldUniversalIdentifier({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workflowVersion,
        relationTargetObjectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.timelineActivity,
      }),
    },
  },
  workspaceMember: {
    ...buildStandardObjectSystemFields(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember,
    ),
    name: { universalIdentifier: '20202020-e914-43a6-9c26-3603c59065f4' },
    colorScheme: {
      universalIdentifier: '20202020-66bc-47f2-adac-f2ef7c598b63',
    },
    uiScale: {
      universalIdentifier: '20202020-1581-4bfb-b87d-58fa9cd5b817',
    },
    openRecordIn: {
      universalIdentifier: '20202020-1b16-419d-9323-6f3ea850e5d9',
    },
    locale: {
      universalIdentifier: '20202020-402e-4695-b169-794fa015afbe',
    },
    avatarUrl: {
      universalIdentifier: '20202020-0ced-4c4f-a376-c98a966af3f6',
    },
    userEmail: {
      universalIdentifier: '20202020-4c5f-4e09-bebc-9e624e21ecf4',
    },
    jobTitle: {
      universalIdentifier: '20202020-4dd4-4619-826e-08f6c06b374d',
    },
    userId: {
      universalIdentifier: '20202020-75a9-4dfc-bf25-2e4b43e89820',
    },
    assignedTasks: {
      universalIdentifier: '20202020-61dc-4a1c-99e8-38ebf8d2bbeb',
    },
    ownedOpportunities: {
      universalIdentifier: '20202020-9e4d-4b3a-8c1f-6d7e8f9a0b1c',
    },
    accountOwnerForCompanies: {
      universalIdentifier: '20202020-dc29-4bd4-a3c1-29eafa324bee',
    },
    messageParticipants: {
      universalIdentifier: '20202020-8f99-48bc-a5eb-edd33dd54188',
    },
    blocklist: {
      universalIdentifier: '20202020-6cb2-4161-9f29-a4b7f1283859',
    },
    calendarEventParticipants: {
      universalIdentifier: '20202020-0dbc-4841-9ce1-3e793b5b3512',
    },
    timelineActivities: {
      universalIdentifier: '20202020-e15b-47b8-94fe-8200e3c66615',
    },
    timeZone: {
      universalIdentifier: '20202020-2d33-4c21-a86e-5943b050dd54',
    },
    dateFormat: {
      universalIdentifier: '20202020-af13-4e11-b1e7-b8cf5ea13dc0',
    },
    timeFormat: {
      universalIdentifier: '20202020-8acb-4cf8-a851-a6ed443c8d81',
    },
    calendarStartDay: {
      universalIdentifier: '20202020-1ecc-4562-84c9-ff3a2f6cce85',
    },
    numberFormat: {
      universalIdentifier: '20202020-7f40-4e7f-b126-11c0eda6b141',
    },
    sequences: {
      universalIdentifier: '0846b675-67c7-4e2f-b30b-25632679a811',
    },
  },
} satisfies Record<string, Record<string, { universalIdentifier: string }>>;
