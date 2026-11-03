import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import {
  newCreativeDocument,
  type CreativeAsset,
} from 'src/modules/delivery/creative/delivery-creative.types';

export const REVIEW_WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
export const REVIEW_TASK_ID = '748e2175-f020-4b10-b242-0cd1cecb8414';
export const REVIEW_PROJECT_ID = '0a588cbd-9e50-4093-a3a0-07796c2496ed';
export const REVIEW_MEMBER_ID = '5bf0cf27-a867-4302-adbb-74a87606c0b8';
export const REVIEW_ASSIGNEE_ID = '8de89106-fc21-43a9-9597-5d02571b765e';
export const REVIEW_MEMBERSHIP_ID = 'ff3773cb-4dd2-4f45-b28a-a489daf676b2';
export const REVIEW_ASSET_ID = '7949d0b5-8687-4d1b-b4f8-e8e6197eb684';
export const REVIEW_CORRECTION_ID = 'aecebfda-f1a0-4811-b7a3-080575265559';
export const REVIEW_COMMAND_ID = '270cbb8f-6e07-41bf-b2e4-cc68b9893c60';
export const REVIEW_CHANGE_ID = 'e1a6c3ef-c249-41ce-8d21-81ea25117bc3';
export const reviewAsset = (
  id = REVIEW_ASSET_ID,
  fields: Partial<CreativeAsset> = {},
): CreativeAsset => ({
  id,
  name: 'Exact image.png',
  mimeType: 'image/png',
  size: 1234,
  createdAt: '2026-10-29T01:00:00.000Z',
  uploadedBy: REVIEW_ASSIGNEE_ID,
  briefVersion: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  shotId: null,
  shotVersion: null,
  kind: 'FINAL',
  parentAssetId: null,
  reviews: [],
  storageState: 'READY',
  ...fields,
});
export const reviewDetails = (): DeliveryDetails => {
  const document = newCreativeDocument();
  document.brief.outputKind = 'IMAGE';
  document.approvedBriefVersion = 1;
  document.assets = [reviewAsset(), reviewAsset(REVIEW_CORRECTION_ID)];
  document.finalAssetId = REVIEW_ASSET_ID;
  return {
    brief: 'Review this exact still image.',
    service: 'Design',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: REVIEW_MEMBER_ID,
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [
      {
        version: 1,
        creativeVersion: 1,
        finalAssetId: REVIEW_ASSET_ID,
        description: 'First submitted still',
        evidence: [],
        submittedBy: REVIEW_ASSIGNEE_ID,
        submittedAt: '2026-10-29T02:00:00.000Z',
      },
    ],
    events: [],
    creative: document,
  };
};
