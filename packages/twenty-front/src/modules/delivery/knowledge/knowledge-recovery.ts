import {
  type DeliveryKnowledgeSaveInput,
  type DeliveryKnowledgeDetailQuery,
} from '~/generated-metadata/graphql';

type KnowledgeDetail = NonNullable<
  DeliveryKnowledgeDetailQuery['deliveryKnowledgeDetail']['detail']
>;
export const knowledgeDraftFromDetail = (
  projectId: string,
  detail: KnowledgeDetail,
): DeliveryKnowledgeSaveInput => ({
  id: detail.id,
  projectId,
  revision: detail.revision,
  title: detail.title,
  category: detail.category,
  meetingDate: detail.meetingDate,
  sourceUrl: detail.sourceUrl,
  transcript: detail.transcript ?? '',
  knowledge: detail.knowledge,
});

export const knowledgeMatchesSubmitted = (
  detail: KnowledgeDetail,
  input: DeliveryKnowledgeSaveInput,
) =>
  detail.canEdit &&
  detail.id === input.id &&
  detail.revision === input.revision + 1 &&
  detail.title === input.title.trim() &&
  detail.category === (input.category ?? 'MEETING') &&
  detail.meetingDate === input.meetingDate &&
  detail.sourceUrl === input.sourceUrl.trim() &&
  detail.transcript === input.transcript.trim() &&
  detail.knowledge === input.knowledge.trim() &&
  (!input.fathomImportHash ||
    detail.fathomProvenance?.proofHash === input.fathomImportHash);
