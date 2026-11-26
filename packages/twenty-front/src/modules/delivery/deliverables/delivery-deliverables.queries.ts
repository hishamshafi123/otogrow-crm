import { gql } from '@apollo/client';

export const GET_DELIVERY_DELIVERABLES = gql`
  query DeliveryDeliverables($filter: JSON) {
    deliveryDeliverables(filter: $filter)
  }
`;

export const GET_DELIVERY_DELIVERABLE = gql`
  query DeliveryDeliverable($id: String!) {
    deliveryDeliverable(id: $id)
  }
`;

export const CREATE_DELIVERY_LINK_DELIVERABLE = gql`
  mutation CreateDeliveryLinkDeliverable($input: JSON!) {
    createDeliveryLinkDeliverable(input: $input)
  }
`;

export const UPDATE_DELIVERY_DELIVERABLE = gql`
  mutation UpdateDeliveryDeliverable($input: JSON!) {
    updateDeliveryDeliverable(input: $input)
  }
`;

export const REVIEW_DELIVERY_DELIVERABLE = gql`
  mutation ReviewDeliveryDeliverable($input: JSON!) {
    reviewDeliveryDeliverable(input: $input)
  }
`;

export const GET_DELIVERY_CLIENT_PORTAL_ACCESS = gql`
  query DeliveryClientPortalAccess($companyId: String!) {
    deliveryClientPortalAccess(companyId: $companyId)
  }
`;

export const GET_DELIVERY_CLIENT_PORTAL_ACCESS_LIST = gql`
  query DeliveryClientPortalAccessList {
    deliveryClientPortalAccessList
  }
`;

export const MANAGE_DELIVERY_CLIENT_PORTAL_ACCESS = gql`
  mutation ManageDeliveryClientPortalAccess($input: JSON!) {
    manageDeliveryClientPortalAccess(input: $input)
  }
`;

export const GET_DELIVERY_DRIVE_CONFIG = gql`
  query DeliveryDriveConfig {
    deliveryDriveConfig
  }
`;

export const GET_DELIVERY_DRIVE_FOLDERS = gql`
  query DeliveryDriveFolders($parentId: String, $search: String) {
    deliveryDriveFolders(parentId: $parentId, search: $search)
  }
`;

export const START_DELIVERY_DRIVE_OAUTH = gql`
  mutation StartDeliveryDriveOAuth($returnTo: String) {
    startDeliveryDriveOAuth(returnTo: $returnTo)
  }
`;

export const UPDATE_DELIVERY_DRIVE_SETTINGS = gql`
  mutation UpdateDeliveryDriveSettings($input: JSON!) {
    updateDeliveryDriveSettings(input: $input)
  }
`;

export const DISCONNECT_DELIVERY_DRIVE = gql`
  mutation DisconnectDeliveryDrive {
    disconnectDeliveryDrive
  }
`;

export const CREATE_DELIVERY_DRIVE_FOLDER = gql`
  mutation CreateDeliveryDriveFolder($name: String!, $parentId: String) {
    createDeliveryDriveFolder(name: $name, parentId: $parentId)
  }
`;

export const BIND_DELIVERY_CLIENT_DRIVE_FOLDER = gql`
  mutation BindDeliveryClientDriveFolder($input: JSON!) {
    bindDeliveryClientDriveFolder(input: $input)
  }
`;

export const SYNC_DELIVERY_DELIVERABLE_TO_DRIVE = gql`
  mutation SyncDeliveryDeliverableToDrive($deliverableId: String!) {
    syncDeliveryDeliverableToDrive(deliverableId: $deliverableId)
  }
`;

export const RUN_DELIVERY_VPS_CLEANUP = gql`
  mutation RunDeliveryVpsCleanup($dryRun: Boolean) {
    runDeliveryVpsCleanup(dryRun: $dryRun)
  }
`;

export const GET_DELIVERY_HOOK_PROJECT = gql`
  query DeliveryHookProject($deliverableId: String!) {
    deliveryHookProject(deliverableId: $deliverableId)
  }
`;

export const ANALYZE_DELIVERY_HOOK_CONTEXT = gql`
  mutation AnalyzeDeliveryHookContext($input: JSON!) {
    analyzeDeliveryHookContext(input: $input)
  }
`;

export const GENERATE_DELIVERY_HOOK_SUGGESTIONS = gql`
  mutation GenerateDeliveryHookSuggestions($input: JSON!) {
    generateDeliveryHookSuggestions(input: $input)
  }
`;

export const SAVE_DELIVERY_HOOK_PROJECT = gql`
  mutation SaveDeliveryHookProject($input: JSON!) {
    saveDeliveryHookProject(input: $input)
  }
`;

export const QUEUE_DELIVERY_HOOK_RENDER = gql`
  mutation QueueDeliveryHookRender($input: JSON!) {
    queueDeliveryHookRender(input: $input)
  }
`;

export const PUBLISH_DELIVERY_HOOK_VARIATIONS = gql`
  mutation PublishDeliveryHookVariations($input: JSON!) {
    publishDeliveryHookVariations(input: $input)
  }
`;

export const GET_DELIVERY_CONTENT_METRIC_SNAPSHOTS = gql`
  query DeliveryContentMetricSnapshots($filter: JSON) {
    deliveryContentMetricSnapshots(filter: $filter)
  }
`;

export const UPSERT_DELIVERY_CONTENT_METRIC_SNAPSHOT = gql`
  mutation UpsertDeliveryContentMetricSnapshot($input: JSON!) {
    upsertDeliveryContentMetricSnapshot(input: $input)
  }
`;

export const DELETE_DELIVERY_CONTENT_METRIC_SNAPSHOT = gql`
  mutation DeleteDeliveryContentMetricSnapshot($id: String!) {
    deleteDeliveryContentMetricSnapshot(id: $id)
  }
`;
