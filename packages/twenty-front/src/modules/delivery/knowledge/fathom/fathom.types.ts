import {
  type DeliveryKnowledgeContextQuery,
  type PreviewDeliveryFathomTranscriptMutation,
} from '~/generated-metadata/graphql';

export type FathomContext = Pick<
  DeliveryKnowledgeContextQuery['deliveryKnowledgeContext'],
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
> & { projectRevision: number };
export type FathomPreview =
  PreviewDeliveryFathomTranscriptMutation['previewDeliveryFathomTranscript'];
export type FathomImportTarget = { sourceIdentity: string; transcript: string };
