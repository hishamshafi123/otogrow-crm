import { assertDeliveryCreativeReview } from 'src/modules/delivery/creative/assert-delivery-creative-review';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type DeliveryCommand } from 'src/modules/delivery/delivery-validation';

const FINAL_ASSET_ID = 'b5256359-0e0f-4d7c-925b-67a652a53d9b';
const REVIEW: Extract<DeliveryCommand, { action: 'review' }> = {
  action: 'review',
  taskId: '04dc8c99-72c8-4b56-b3eb-917f0e277f17',
  revision: 4,
  decision: 'APPROVED',
  feedback: 'Reviewed the submitted still image.',
  selectedSubmissionVersion: 1,
  creativeVersion: 1,
  finalAssetId: FINAL_ASSET_ID,
};
const details = (): DeliveryDetails & {
  creative: ReturnType<typeof newCreativeDocument>;
} => {
  const creative = newCreativeDocument();
  creative.brief.outputKind = 'IMAGE';
  creative.approvedBriefVersion = creative.briefVersion;
  creative.finalAssetId = FINAL_ASSET_ID;
  creative.assets = [
    {
      id: FINAL_ASSET_ID,
      name: 'Still ad',
      kind: 'FINAL',
      mimeType: 'image/png',
      size: 500,
      createdAt: '2026-10-29T00:00:00Z',
      uploadedBy: 'editor',
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
      parentAssetId: null,
      reviews: [],
      storageState: 'READY',
    },
  ];
  return {
    creative,
    brief: 'Image brief',
    service: 'Static ads',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'reviewer',
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [
      {
        version: 1,
        creativeVersion: 1,
        finalAssetId: FINAL_ASSET_ID,
        description: 'First still ad',
        evidence: [],
        submittedBy: 'editor',
        submittedAt: '2026-10-29T00:00:00Z',
      },
    ],
  };
};

describe('exact creative submission decisions', () => {
  it('accepts an explicitly selected current still image without changing its source', () => {
    const source = details();
    const before = structuredClone(source);
    expect(() => assertDeliveryCreativeReview(source, REVIEW)).not.toThrow();
    expect(source).toEqual(before);
  });
  it.each(['APPROVED', 'CHANGES_REQUESTED'] as const)(
    'rejects an old selection for %s even if current task metadata was refreshed',
    (decision) => {
      const source = details();
      source.submissions.push({ ...source.submissions[0], version: 2 });
      expect(() =>
        assertDeliveryCreativeReview(source, { ...REVIEW, decision }),
      ).toThrow('latest submitted version');
    },
  );
  it.each([
    { finalAssetId: '56be71ba-4966-4565-86ac-b6f1ee698024' },
    { creativeVersion: 2 },
    { finalAssetId: undefined },
  ])('rejects mismatched or absent frozen file identity %j', (fields) => {
    expect(() =>
      assertDeliveryCreativeReview(details(), { ...REVIEW, ...fields }),
    ).toThrow('exact submitted creative file');
  });
  it('rejects a late production edit instead of approving its replacement file', () => {
    const source = details();
    source.creative.version++;
    expect(() => assertDeliveryCreativeReview(source, REVIEW)).toThrow(
      'changed after submission',
    );
  });
  it('requires the recorded final asset to remain ready', () => {
    const source = details();
    source.creative.assets[0].storageState = 'PENDING';
    expect(() => assertDeliveryCreativeReview(source, REVIEW)).toThrow(
      'current final',
    );
  });
  it('requires current brief approval at the final decision', () => {
    const source = details();
    source.creative.approvedBriefVersion = null;
    expect(() => assertDeliveryCreativeReview(source, REVIEW)).toThrow(
      'current creative brief',
    );
  });
  it('allows a legacy missing-file submission to request correction but never approval', () => {
    const source = details();
    delete source.submissions[0].finalAssetId;
    delete source.submissions[0].creativeVersion;
    const command = {
      ...REVIEW,
      finalAssetId: undefined,
      creativeVersion: undefined,
    };
    expect(() =>
      assertDeliveryCreativeReview(source, {
        ...command,
        decision: 'CHANGES_REQUESTED',
      }),
    ).not.toThrow();
    expect(() => assertDeliveryCreativeReview(source, command)).toThrow(
      'cannot be confirmed',
    );
  });
  it('keeps noncreative review compatible while rejecting fabricated creative metadata', () => {
    const source: DeliveryDetails = details();
    delete source.creative;
    delete source.submissions[0].finalAssetId;
    delete source.submissions[0].creativeVersion;
    expect(() =>
      assertDeliveryCreativeReview(source, {
        ...REVIEW,
        finalAssetId: undefined,
        creativeVersion: undefined,
        selectedSubmissionVersion: undefined,
      }),
    ).not.toThrow();
    expect(() => assertDeliveryCreativeReview(source, REVIEW)).toThrow(
      'no recorded creative identity',
    );
  });
});
