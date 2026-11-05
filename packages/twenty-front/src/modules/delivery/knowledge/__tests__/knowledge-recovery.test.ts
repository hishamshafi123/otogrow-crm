import {
  knowledgeDraftFromDetail,
  knowledgeMatchesSubmitted,
} from '@/delivery/knowledge/knowledge-recovery';
import { type DeliveryKnowledgeDetailQuery } from '~/generated-metadata/graphql';

type Detail = NonNullable<
  DeliveryKnowledgeDetailQuery['deliveryKnowledgeDetail']['detail']
>;
const asset = {
  id: 'file',
  name: 'Brand.png',
  mimeType: 'image/png',
  size: 4,
  sha256: 'a'.repeat(64),
  uploadedBy: 'member',
  createdAt: '2026-11-05T00:00:00Z',
};
const detail: Detail = {
  id: 'source',
  revision: 2,
  title: 'Brand assets',
  category: 'ASSET_REFERENCE',
  meetingDate: '2026-11-05',
  version: 2,
  currentVersion: 2,
  publishedVersion: 1,
  publishedAt: '2026-11-05T00:00:00Z',
  createdBy: 'member',
  canEdit: true,
  sourceUrl: 'https://example.com/brand',
  transcript: 'Original logo',
  knowledge: 'Use the approved logo.',
  attachments: [asset],
  fathomProvenance: null,
};

it('retains exact file identities when opening a saved version for editing', () => {
  expect(knowledgeDraftFromDetail('project', detail).attachments).toEqual([
    { id: 'file', sha256: asset.sha256 },
  ]);
});
it('does not mark a lost save as recovered when notes match but attached bytes differ or were omitted', () => {
  const submitted = {
    ...knowledgeDraftFromDetail('project', detail),
    revision: 1,
  };
  expect(knowledgeMatchesSubmitted(detail, submitted)).toBe(true);
  expect(
    knowledgeMatchesSubmitted(detail, { ...submitted, attachments: [] }),
  ).toBe(false);
  expect(
    knowledgeMatchesSubmitted(detail, {
      ...submitted,
      attachments: [{ id: 'file', sha256: 'b'.repeat(64) }],
    }),
  ).toBe(false);
});
