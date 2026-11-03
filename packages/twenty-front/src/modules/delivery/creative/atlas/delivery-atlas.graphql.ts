import { gql } from '@apollo/client';
const PROFILE = gql`
  fragment DeliveryAtlasProfileFields on DeliveryAtlasProfile {
    id
    familyId
    label
    kind
    operation
    schemaRevision
    enabled
    available
    blockedReasons
    minimumReferences
    maximumReferences
    parameters {
      name
      label
      type
      required
      choices
      minimum
      maximum
      defaultValue
    }
  }
`;
const FAMILY = gql`
  fragment DeliveryAtlasFamilyFields on DeliveryAtlasFamily {
    id
    label
    textToImageProfileId
    imageEditProfileId
  }
`;
const SETTINGS = gql`
  fragment DeliveryAtlasSettingsFields on DeliveryAtlasSettings {
    workspaceId
    memberId
    userWorkspaceId
    revision
    enabled
    keyConfigured
    verificationStatus
    verifiedAt
    defaultImageFamilyId
    defaultClipProfileId
    enabledProfileIds
    reservationLimits {
      profileId
      maximumCostUsd
      source
      verifiedAt
    }
    families {
      ...DeliveryAtlasFamilyFields
    }
    profiles {
      ...DeliveryAtlasProfileFields
    }
  }
  ${FAMILY}
  ${PROFILE}
`;
const PRODUCTION = gql`
  fragment DeliveryAtlasProductionFields on DeliveryAtlasProduction {
    workspaceId
    memberId
    userWorkspaceId
    taskId
    taskRevision
    briefVersion
    settingsVersion
    configurationRevision
    outputKind
    briefApproved
    canManageAccess
    enabled
    roles
    allowedProfileIds
    dailyRunLimit
    defaultImageFamilyId
    defaultClipProfileId
    profiles {
      ...DeliveryAtlasProfileFields
    }
    families {
      ...DeliveryAtlasFamilyFields
    }
    assets {
      id
      name
      mimeType
      size
    }
    shots {
      id
      version
      title
      imagePrompt
      animationPrompt
      imageId
    }
    blockedReasons
  }
  ${FAMILY}
  ${PROFILE}
`;
const RUN = gql`
  fragment DeliveryAtlasRunFields on DeliveryAtlasRun {
    workspaceId
    memberId
    userWorkspaceId
    taskId
    id
    requestId
    profileId
    familyId
    modelLabel
    kind
    operation
    schemaRevision
    configurationRevision
    taskRevision
    briefVersion
    settingsVersion
    shotVersion
    prompt
    referenceAssetIds
    parameters {
      resolution
      size
      aspectRatio
      duration
      generateAudio
      quality
      seed
    }
    target
    shotId
    status
    publicationCancelled
    providerPredictionId
    providerStatus
    assetId
    maximumCostUsd
    quotedCostUsd
    actualCostUsd
    costState
    error
    createdAt
    updatedAt
    canResume
    canCancel
  }
`;
export const GET_ATLAS_SETTINGS = gql`
  query DeliveryAtlasSettings {
    deliveryAtlasSettings {
      ...DeliveryAtlasSettingsFields
    }
  }
  ${SETTINGS}
`;
export const SAVE_ATLAS_SETTINGS = gql`
  mutation SaveDeliveryAtlasSettings($input: DeliveryAtlasSettingsInput!) {
    saveDeliveryAtlasSettings(input: $input) {
      ...DeliveryAtlasSettingsFields
    }
  }
  ${SETTINGS}
`;
export const VERIFY_ATLAS_CONNECTION = gql`
  mutation VerifyDeliveryAtlasConnection($input: DeliveryAtlasRevisionInput!) {
    verifyDeliveryAtlasConnection(input: $input) {
      ...DeliveryAtlasSettingsFields
    }
  }
  ${SETTINGS}
`;
export const REMOVE_ATLAS_CONNECTION = gql`
  mutation RemoveDeliveryAtlasConnection($input: DeliveryAtlasRevisionInput!) {
    removeDeliveryAtlasConnection(input: $input) {
      ...DeliveryAtlasSettingsFields
    }
  }
  ${SETTINGS}
`;
export const GET_ATLAS_PRODUCTION = gql`
  query DeliveryAtlasProduction($input: DeliveryAtlasProductionInput!) {
    deliveryAtlasProduction(input: $input) {
      ...DeliveryAtlasProductionFields
    }
  }
  ${PRODUCTION}
`;
export const CONFIGURE_ATLAS_PRODUCTION = gql`
  mutation ConfigureDeliveryAtlasProductionAccess(
    $input: DeliveryAtlasProductionAccessInput!
  ) {
    configureDeliveryAtlasProductionAccess(input: $input) {
      ...DeliveryAtlasProductionFields
    }
  }
  ${PRODUCTION}
`;
export const QUOTE_ATLAS_GENERATION = gql`
  mutation QuoteDeliveryAtlasGeneration($input: DeliveryAtlasQuoteInput!) {
    quoteDeliveryAtlasGeneration(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      runId
      requestId
      profileId
      quoteToken
      quotedCostUsd
      maximumCostUsd
      expiresAt
      budgetReady
      blockedReason
    }
  }
`;
export const START_ATLAS_GENERATION = gql`
  mutation StartDeliveryAtlasGeneration($input: DeliveryAtlasStartInput!) {
    startDeliveryAtlasGeneration(input: $input) {
      ...DeliveryAtlasRunFields
    }
  }
  ${RUN}
`;
export const GET_ATLAS_RUN = gql`
  query DeliveryAtlasRun($input: DeliveryAtlasRunInput!) {
    deliveryAtlasRun(input: $input) {
      ...DeliveryAtlasRunFields
    }
  }
  ${RUN}
`;
export const GET_ATLAS_RUNS = gql`
  query DeliveryAtlasRuns($input: DeliveryAtlasRunsInput!) {
    deliveryAtlasRuns(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      items {
        ...DeliveryAtlasRunFields
      }
      nextBeforeId
    }
  }
  ${RUN}
`;
export const CANCEL_ATLAS_GENERATION = gql`
  mutation CancelDeliveryAtlasGeneration($input: DeliveryAtlasRunInput!) {
    cancelDeliveryAtlasGeneration(input: $input) {
      ...DeliveryAtlasRunFields
    }
  }
  ${RUN}
`;
export const RESUME_ATLAS_GENERATION = gql`
  mutation ResumeDeliveryAtlasGeneration($input: DeliveryAtlasRunInput!) {
    resumeDeliveryAtlasGeneration(input: $input) {
      ...DeliveryAtlasRunFields
    }
  }
  ${RUN}
`;
