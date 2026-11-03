import {
  type DeliveryVideoQaPreviewQuery,
  type DeliveryVideoQaRunQuery,
  type DeliveryVideoQaStateQuery,
  type DeliveryVideoQaReceiptQuery,
  type DeliveryVideoQaPreviewInput,
  type DeliveryVideoQaStartInput,
  type DeliveryVideoQaCancelInput,
} from '~/generated-metadata/graphql';
export const VIDEO_QA_MODEL = 'google/gemini-3.5-flash-lite';
export type VideoQaPreview =
  DeliveryVideoQaPreviewQuery['deliveryVideoQaPreview'];
export type VideoQaRun = DeliveryVideoQaRunQuery['deliveryVideoQaRun'];
export type VideoQaState = DeliveryVideoQaStateQuery['deliveryVideoQaState'];
export type VideoQaReceipt =
  DeliveryVideoQaReceiptQuery['deliveryVideoQaReceipt'];
export type VideoQaIdentity = Pick<
  VideoQaState,
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
>;
export type VideoQaIntent =
  | { requestId: string; taskId: string; kind: 'START' }
  | { requestId: string; taskId: string; kind: 'CANCEL'; runId: string };
export type VideoQaCommand =
  | { kind: 'START'; input: DeliveryVideoQaStartInput }
  | { kind: 'CANCEL'; input: DeliveryVideoQaCancelInput };
export type VideoQaPreparedRequest = {
  input: DeliveryVideoQaPreviewInput;
  preview: VideoQaPreview;
};
