import { gql } from '@apollo/client';

export const CREATIVE_IDENTITY = gql`
  fragment CreativeReadIdentity on DeliveryCreativeContext {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    scope
    actor {
      memberId
      isAdmin
      isManager
      roleIds
      capabilities
    }
  }
`;
const ACTOR = gql`
  fragment CreativeReadActor on DeliveryCreativeActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;
const TASK = gql`
  fragment CreativeProductionTask on DeliveryCreativeTaskSummary {
    id
    title
    projectId
    projectName
    projectRevision
    revision
    assigneeId
    assigneeName
    assignmentKey
    dueAt
    state
    service
    hasProduction
    canEdit
  }
`;
const BRIEF = gql`
  fragment CreativeProductionBrief on DeliveryCreativeBrief {
    outputKind
    objective
    audience
    painPoint
    angle
    concept
    productFacts
    mandatoryClaims
    visualDirection
    format
    duration
    hook
    cta
    music
    brandAssets
  }
`;
const SHOT = gql`
  fragment CreativeProductionShotVersion on DeliveryCreativeShotVersion {
    title
    imagePrompt
    animationPrompt
    duration
    subject
    product
    location
    notes
    referenceId
    version
  }
`;
export const GET_CREATIVE_CONTEXT = gql`
  query DeliveryCreativeContext {
    deliveryCreativeContext {
      ...CreativeReadIdentity
    }
  }
  ${CREATIVE_IDENTITY}
`;
export const GET_CREATIVE_PROJECTS = gql`
  query DeliveryCreativeProjects($input: DeliveryCreativeProjectsInput!) {
    deliveryCreativeProjects(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...CreativeReadActor
      }
      items {
        id
        name
        revision
      }
      totalCount
      nextCursor
    }
  }
  ${ACTOR}
`;
export const GET_CREATIVE_TASKS = gql`
  query DeliveryCreativeTasks($input: DeliveryCreativeTasksInput!) {
    deliveryCreativeTasks(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...CreativeReadActor
      }
      items {
        ...CreativeProductionTask
      }
      totalCount
      nextCursor
      selectedProject {
        id
        name
        revision
      }
    }
  }
  ${ACTOR}
  ${TASK}
`;
export const GET_CREATIVE_STATE = gql`
  query DeliveryCreativeState($input: DeliveryCreativeSelectionInput!) {
    deliveryCreativeState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...CreativeReadActor
      }
      task {
        ...CreativeProductionTask
      }
    }
  }
  ${ACTOR}
  ${TASK}
`;
export const GET_CREATIVE_DETAIL = gql`
  query DeliveryCreativeDetail($input: DeliveryCreativeSelectionInput!) {
    deliveryCreativeDetail(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...CreativeReadActor
      }
      task {
        ...CreativeProductionTask
      }
      document {
        version
        productionVersion
        assemblyVersion
        briefVersion
        approvedBriefVersion
        revisionCharge
        finalAssetId
        brief {
          ...CreativeProductionBrief
        }
        briefHistory {
          version
          approved
          brief {
            ...CreativeProductionBrief
          }
        }
        references {
          id
          version
          title
          url
          assetId
          summary
          angle
          tags
          sourceReferenceId
          reviews {
            memberId
            at
            decision
            notes
          }
        }
        shots {
          id
          title
          imagePrompt
          animationPrompt
          duration
          subject
          product
          location
          notes
          referenceId
          version
          imageId
          clipId
          history {
            ...CreativeProductionShotVersion
          }
        }
        assets {
          id
          name
          mimeType
          size
          createdAt
          uploadedBy
          briefVersion
          productionVersion
          assemblyVersion
          shotId
          shotVersion
          kind
          parentAssetId
          storageState
          reviews {
            memberId
            at
            decision
            notes
          }
        }
        assembly {
          assetIds
          overlayText
          audioId
          notes
        }
        variants {
          id
          baseId
          hookId
          ctaId
          selected
        }
        mediaSettings {
          version
          enabled
          modelIds
          roles
          dailyRunLimit
          allowUnknownCost
        }
        mediaRuns {
          id
          requestId
          modelId
          kind
          shotId
          shotVersion
          briefVersion
          settingsVersion
          prompt
          referenceAssetIds
          initiatorId
          userWorkspaceId
          status
          createdAt
          updatedAt
          error
          providerJobId
          assetId
          cost
          inspection {
            summary
            findings {
              assetId
              evidence
              correction
            }
            limitations
          }
        }
      }
    }
  }
  ${ACTOR}
  ${TASK}
  ${BRIEF}
  ${SHOT}
`;
export const GET_CREATIVE_REFERENCES = gql`
  query DeliveryCreativeReferences($input: DeliveryCreativeReferencesInput!) {
    deliveryCreativeReferences(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      actor {
        ...CreativeReadActor
      }
      taskId
      projectId
      projectRevision
      totalCount
      nextCursor
      items {
        id
        version
        title
        url
        summaryPreview
        summaryTruncated
        sourceTaskId
        sourceTaskTitle
        sourceTaskRevision
        approvedAt
      }
    }
  }
  ${ACTOR}
`;
