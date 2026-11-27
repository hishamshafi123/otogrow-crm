import { gql } from '@apollo/client';

export const GET_DELIVERY_STUDIO_WORKSPACE = gql`
  query DeliveryStudioWorkspace($companyId: String, $projectId: String) {
    deliveryStudioWorkspace(companyId: $companyId, projectId: $projectId)
  }
`;

export const GET_DELIVERY_STUDIO_HOOK_PROJECT = gql`
  query DeliveryStudioHookProject($assetId: String!) {
    deliveryStudioHookProject(assetId: $assetId)
  }
`;

export const GET_DELIVERY_STUDIO_AGENT_CAPABILITIES = gql`
  query DeliveryStudioAgentCapabilities {
    deliveryStudioAgentCapabilities
  }
`;

export const SAVE_DELIVERY_STUDIO_PROVIDER_CONFIG = gql`
  mutation SaveDeliveryStudioProviderConfig($input: JSON!) {
    saveDeliveryStudioProviderConfig(input: $input)
  }
`;

export const TEST_DELIVERY_STUDIO_PROVIDER_KEY = gql`
  mutation TestDeliveryStudioProviderKey($provider: String!, $apiKey: String) {
    testDeliveryStudioProviderKey(provider: $provider, apiKey: $apiKey)
  }
`;

export const UPSERT_DELIVERY_STUDIO_PRESET = gql`
  mutation UpsertDeliveryStudioPreset($input: JSON!) {
    upsertDeliveryStudioPreset(input: $input)
  }
`;

export const ARCHIVE_DELIVERY_STUDIO_PRESET = gql`
  mutation ArchiveDeliveryStudioPreset($id: String!) {
    archiveDeliveryStudioPreset(id: $id)
  }
`;

export const ARCHIVE_DELIVERY_STUDIO_REFERENCE_VIDEO = gql`
  mutation ArchiveDeliveryStudioReferenceVideo($id: String!) {
    archiveDeliveryStudioReferenceVideo(id: $id)
  }
`;

export const UPSERT_DELIVERY_STUDIO_PRODUCT_KIT = gql`
  mutation UpsertDeliveryStudioProductKit($input: JSON!) {
    upsertDeliveryStudioProductKit(input: $input)
  }
`;

export const REMOVE_DELIVERY_STUDIO_PRODUCT_KIT_ASSET = gql`
  mutation RemoveDeliveryStudioProductKitAsset(
    $productKitId: String!
    $assetId: String!
  ) {
    removeDeliveryStudioProductKitAsset(
      productKitId: $productKitId
      assetId: $assetId
    )
  }
`;

export const ARCHIVE_DELIVERY_STUDIO_PRODUCT_KIT = gql`
  mutation ArchiveDeliveryStudioProductKit($id: String!) {
    archiveDeliveryStudioProductKit(id: $id)
  }
`;

export const GENERATE_DELIVERY_STUDIO_CHARACTER_SHEET = gql`
  mutation GenerateDeliveryStudioCharacterSheet($input: JSON!) {
    generateDeliveryStudioCharacterSheet(input: $input)
  }
`;

export const GENERATE_DELIVERY_STUDIO_VIDEO = gql`
  mutation GenerateDeliveryStudioVideo($input: JSON!) {
    generateDeliveryStudioVideo(input: $input)
  }
`;

export const BATCH_GENERATE_DELIVERY_STUDIO_VIDEOS = gql`
  mutation BatchGenerateDeliveryStudioVideos($input: JSON!) {
    batchGenerateDeliveryStudioVideos(input: $input)
  }
`;

export const RETRY_DELIVERY_STUDIO_JOB = gql`
  mutation RetryDeliveryStudioJob($jobId: String!, $routingMode: String) {
    retryDeliveryStudioJob(jobId: $jobId, routingMode: $routingMode)
  }
`;

export const CANCEL_DELIVERY_STUDIO_JOB = gql`
  mutation CancelDeliveryStudioJob($jobId: String!) {
    cancelDeliveryStudioJob(jobId: $jobId)
  }
`;

export const SET_DELIVERY_STUDIO_ASSET_APPROVED = gql`
  mutation SetDeliveryStudioAssetApproved(
    $assetId: String!
    $approved: Boolean!
  ) {
    setDeliveryStudioAssetApproved(assetId: $assetId, approved: $approved)
  }
`;

export const ARCHIVE_DELIVERY_STUDIO_ASSET = gql`
  mutation ArchiveDeliveryStudioAsset($assetId: String!) {
    archiveDeliveryStudioAsset(assetId: $assetId)
  }
`;

export const SUGGEST_DELIVERY_STUDIO_VIDEO_HOOKS = gql`
  mutation SuggestDeliveryStudioVideoHooks($input: JSON!) {
    suggestDeliveryStudioVideoHooks(input: $input)
  }
`;

export const RENDER_DELIVERY_STUDIO_VIDEO_HOOKS = gql`
  mutation RenderDeliveryStudioVideoHooks($input: JSON!) {
    renderDeliveryStudioVideoHooks(input: $input)
  }
`;

export const GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS = gql`
  query DeliveryStudioClientDriveFolders($companyId: String!) {
    deliveryStudioClientDriveFolders(companyId: $companyId)
  }
`;

export const IMPORT_DELIVERY_STUDIO_PRODUCT_FROM_URL = gql`
  mutation ImportDeliveryStudioProductFromUrl($input: JSON!) {
    importDeliveryStudioProductFromUrl(input: $input)
  }
`;

export const UPDATE_DELIVERY_STUDIO_PRODUCT_ASSETS = gql`
  mutation UpdateDeliveryStudioProductAssets($input: JSON!) {
    updateDeliveryStudioProductAssets(input: $input)
  }
`;

export const SAVE_DELIVERY_STUDIO_VIDEO_TO_DRIVE = gql`
  mutation SaveDeliveryStudioVideoToDrive($input: JSON!) {
    saveDeliveryStudioVideoToDrive(input: $input)
  }
`;

export const SAVE_DELIVERY_STUDIO_HOOK_DEFAULT = gql`
  mutation SaveDeliveryStudioHookDefault($input: JSON!) {
    saveDeliveryStudioHookDefault(input: $input)
  }
`;

export const ANALYZE_DELIVERY_STUDIO_VIDEO_PROMPT = gql`
  mutation AnalyzeDeliveryStudioVideoPrompt($input: JSON!) {
    analyzeDeliveryStudioVideoPrompt(input: $input)
  }
`;
