import {
  newCreativeDocument,
  type CreativeAsset,
} from 'src/modules/delivery/creative/delivery-creative.types';
import {
  assertCreativeSubmission,
  invalidateCreativeAssembly,
  isCreativeAssetCurrent,
} from 'src/modules/delivery/creative/delivery-creative.policy';

const asset = (kind: CreativeAsset['kind']): CreativeAsset => ({
  id: kind,
  name: kind,
  kind,
  mimeType: kind === 'IMAGE' ? 'image/png' : 'video/mp4',
  size: 100,
  createdAt: '',
  uploadedBy: 'editor',
  briefVersion: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  shotId: kind === 'FINAL' ? null : 'shot',
  shotVersion: 1,
  parentAssetId: kind === 'CLIP' ? 'IMAGE' : null,
  reviews: [{ memberId: 'editor', at: '', decision: 'APPROVED', notes: '' }],
  storageState: 'READY',
});
const production = () => {
  const document = newCreativeDocument();
  document.approvedBriefVersion = 1;
  document.shots = [
    {
      id: 'shot',
      version: 1,
      title: 'Product',
      imagePrompt: '',
      animationPrompt: '',
      subject: '',
      product: '',
      location: '',
      duration: 5,
      referenceId: null,
      notes: '',
      history: [],
      imageId: 'IMAGE',
      clipId: 'CLIP',
    },
  ];
  document.assets = [asset('IMAGE'), asset('CLIP'), asset('FINAL')];
  document.finalAssetId = 'FINAL';
  return document;
};
describe('creative final submission', () => {
  it('allows current approved intermediate work with a final candidate', () => {
    expect(() => assertCreativeSubmission(production())).not.toThrow();
  });
  it('rejects an interrupted upload', () => {
    const document = production();
    document.assets[2].storageState = 'PENDING';
    expect(() => assertCreativeSubmission(document)).toThrow('current final');
  });
  it('rejects a clip tied to a replaced source image', () => {
    const document = production();
    document.shots[0].imageId = 'replacement';
    expect(isCreativeAssetCurrent(document, document.assets[1])).toBe(false);
  });
  it('rejects an outdated shot approval', () => {
    const document = production();
    document.shots[0].version++;
    expect(() => assertCreativeSubmission(document)).toThrow('current images');
  });
  it('rejects an escalated image even if previously approved', () => {
    const document = production();
    document.assets[0].reviews.push({
      memberId: 'editor',
      at: '',
      decision: 'ESCALATED',
      notes: '',
    });
    expect(() => assertCreativeSubmission(document)).toThrow();
  });
  it('invalidates final renders without deleting their provenance', () => {
    const document = production();
    const previous = structuredClone(document.assets[2]);
    invalidateCreativeAssembly(document);
    expect(document.finalAssetId).toBeNull();
    expect(isCreativeAssetCurrent(document, document.assets[2])).toBe(false);
    expect(document.assets[2]).toEqual(previous);
  });
  it('rejects a final edit made for an old assembly plan', () => {
    const document = production();
    document.assemblyVersion++;
    expect(() => assertCreativeSubmission(document)).toThrow('current final');
  });
});
