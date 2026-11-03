import {
  type DeliveryReleaseProjectsQuery,
  type DeliveryReleaseDetailQuery,
  type DeliveryReleaseChoicesQuery,
  type DeliveryReleaseBodyInput,
  type DeliveryReleaseSaveInput,
  type DeliveryReleaseDecisionInput,
  type SaveDeliveryReleaseMutation,
} from '~/generated-metadata/graphql';

export type ReleaseIdentity = Pick<
  DeliveryReleaseProjectsQuery['deliveryReleaseProjects'],
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'scope' | 'isManager'
>;
export type ReleaseDetail = DeliveryReleaseDetailQuery['deliveryReleaseDetail'];
export type ReleaseBody = DeliveryReleaseBodyInput;
export type ReleaseTask =
  DeliveryReleaseChoicesQuery['deliveryReleaseChoices']['tasks'][number];
export type ReleaseReceipt = SaveDeliveryReleaseMutation['saveDeliveryRelease'];
export type ReleaseCommand = (
  | { kind: 'SAVE'; input: DeliveryReleaseSaveInput }
  | { kind: 'DECIDE'; input: DeliveryReleaseDecisionInput }
) & { hash: string };
export type ReleaseIntent = {
  releaseId: string;
  requestId: string;
  projectId: string;
  projectRevision: number;
  expectedCompanyId: string | null;
  revision: number;
  mode: string;
  sourceFingerprint: string;
  body: ReleaseBody;
  tasks: ReleaseTask[];
  decision?: { note: string; evidenceUrl: string; environment: string };
};
