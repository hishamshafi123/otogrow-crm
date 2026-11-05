import {
  type KnowledgeAssetFieldsFragment,
  type KnowledgeUploadFieldsFragment,
  type KnowledgeUploadResultFragment,
} from '~/generated-metadata/graphql';

export type KnowledgeAsset = KnowledgeAssetFieldsFragment;
export type KnowledgeUploadReceipt = KnowledgeUploadFieldsFragment;
export type KnowledgeAssetContext = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  projectId: string;
  projectRevision: number;
  companyId: string | null;
  sourceId: string;
  sourceRevision: number;
  scope: string;
};
export type KnowledgeUploadRequest = {
  requestId: string;
  projectId: string;
  sourceId: string;
  sourceRevision: number;
  expectedCompanyId: string | null;
  name: string;
  size: number;
  sha256: string;
};
export type KnowledgeAssetSelection = {
  asset: KnowledgeAsset;
  version: number | null;
};
export const knowledgeAssetMetadata = (
  asset: KnowledgeUploadReceipt,
): KnowledgeAsset => ({
  id: asset.id,
  name: asset.name,
  mimeType: asset.mimeType,
  size: asset.size,
  sha256: asset.sha256,
  uploadedBy: asset.uploadedBy,
  createdAt: asset.createdAt,
});
export const knowledgeUploadMatchesContext = (
  receipt: KnowledgeUploadReceipt,
  context: KnowledgeAssetContext,
) =>
  receipt.workspaceId === context.workspaceId &&
  receipt.projectId === context.projectId &&
  receipt.sourceId === context.sourceId &&
  receipt.companyId === context.companyId &&
  receipt.uploadedBy === context.memberId &&
  receipt.uploaderUserWorkspaceId === context.userWorkspaceId;
export const knowledgeUploadResultMatches = (
  result: KnowledgeUploadResultFragment,
  context: KnowledgeAssetContext,
) =>
  result.workspaceId === context.workspaceId &&
  result.memberId === context.memberId &&
  result.userWorkspaceId === context.userWorkspaceId &&
  result.projectId === context.projectId &&
  result.sourceId === context.sourceId;
