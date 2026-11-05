import { fastDeepEqual } from 'twenty-shared/utils';
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
  attachments: detail.attachments.map(({ id, sha256 }) => ({ id, sha256 })),
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
  fastDeepEqual(
    detail.attachments
      .map(({ id, sha256 }) => ({ id, sha256 }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [...(input.attachments ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  ) &&
  (!input.fathomImportHash ||
    detail.fathomProvenance?.proofHash === input.fathomImportHash);
