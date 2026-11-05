import {
  type ContentProjectFragment,
  type ContentAccountFragment,
  type ContentPlanFragment,
  type ContentSummaryFragment,
  type ContentSavedBodyFragment,
  type ContentAssetSnapshotFragment,
  type ContentReceiptFragment,
  type DeliveryContentProjectChoicesQuery,
  type DeliveryContentDetailQuery,
  type DeliveryContentAccountSaveInput,
  type DeliveryContentPlanSaveInput,
  type DeliveryContentSaveInput,
  type DeliveryContentDecisionInput,
  type DeliveryContentBodyInput,
} from '~/generated-metadata/graphql';

export type ContentChoices =
  DeliveryContentProjectChoicesQuery['deliveryContentProjectChoices'];
export type ContentIdentity = Pick<
  ContentChoices,
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'scope' | 'isManager'
>;
export type ContentProject = ContentProjectFragment;
export type ContentAccount = ContentAccountFragment;
export type ContentPlan = ContentPlanFragment;
export type ContentSummary = ContentSummaryFragment;
export type ContentSavedBody = ContentSavedBodyFragment;
export type ContentAsset = ContentAssetSnapshotFragment;
export type ContentReceipt = ContentReceiptFragment;
export type ContentBody = DeliveryContentBodyInput;
export type ContentDetail = DeliveryContentDetailQuery['deliveryContentDetail'];
export type ContentCommand = (
  | { kind: 'ACCOUNT'; input: DeliveryContentAccountSaveInput }
  | { kind: 'PLAN'; input: DeliveryContentPlanSaveInput }
  | { kind: 'VARIANT'; input: DeliveryContentSaveInput }
  | { kind: 'DECISION'; input: DeliveryContentDecisionInput }
) & { hash: string };
export type ContentIntent = {
  requestId: string;
  targetId: string;
  mode: string;
  sourceScope: string;
  project: ContentProject;
  account?: ContentAccount;
  plan?: ContentPlan;
  detail?: ContentDetail;
  preparation?: {
    account: DeliveryContentAccountSaveInput | null;
    plan: DeliveryContentPlanSaveInput | null;
    body: ContentBody | null;
    note: string;
    evidenceUrl: string;
    actualLocal: string;
    actualTimezone: string;
    correctsEventId: string;
  };
};
