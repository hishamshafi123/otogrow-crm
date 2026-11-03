import { gql } from '@apollo/client';
import {
  ADVERTISING_ACTOR_FIELDS,
  ADVERTISING_SOURCE_FIELDS,
} from '@/delivery/advertising/workbench/delivery-advertising.graphql';
const LEARNING_SUMMARY = gql`
  fragment CreativeLearningSummary on DeliveryCreativeAdLinkSummary {
    id
    projectId
    sourceId
    adId
    taskId
    assetId
    revision
    currentVersion
    state
    createdByName
    createdAt
    reviewedVersion
    reviewedByName
    correctsId
    correctedById
    fingerprint
    adName
    taskTitle
    accountId
    fromDate
    throughDate
    concept
    goalLabel
  }
`;
const LEARNING_BODY = gql`
  ${ADVERTISING_SOURCE_FIELDS}
  fragment CreativeLearningBody on DeliveryCreativeAdLinkBody {
    projectId
    sourceId
    adId
    taskId
    submissionVersion
    assetId
    declaredComponents {
      role
      assetId
    }
    declaredCopy
    associationEvidence
    evidenceUrl
    note
    correctsId
    adName
    adSpendMicros
    assetSha256
    assetHashCapturedAt
    submittedBy
    submittedByName
    approvedBy
    approvedByName
    approvedAt
    copyText
    copyProvenance
    warnings
    previewFingerprint
    goalSnapshot {
      kind
      metricKey
      metricAdId
      provenance
      value
      evidence
      targetCostMicros
      metricLabel
      metricProvenance
      metricReason
      metricUnit
      currency
      fromDate
      throughDate
      timezone
      sourceFingerprint
    }
    source {
      ...AdvertisingSourceFields
    }
    creativeTarget {
      targetKind
      submissionVersion
      creativeVersion
      assetId
      availability
      targetToken
      warnings
      asset {
        id
        name
        kind
        mimeType
        size
        createdAt
        briefVersion
        productionVersion
        assemblyVersion
        shotId
        shotVersion
        parentAssetId
        storageState
        current
      }
    }
    submittedLearning {
      projectId
      companyId
      version
      creativeVersion
      finalAssetId
      briefVersion
      concept
      angle
      plannedHook
      plannedCta
      copyText
      assemblyRunId
      components {
        name
        role
        assetId
        briefVersion
        productionVersion
        assemblyVersion
        shotId
        shotVersion
      }
    }
    components {
      name
      role
      assetId
      briefVersion
      productionVersion
      assemblyVersion
      shotId
      shotVersion
      provenance
    }
  }
`;
const LEARNING_EVENT = gql`
  fragment CreativeLearningEvent on DeliveryCreativeLearningEvent {
    requestId
    linkId
    lessonId
    action
    revision
    version
    state
    actorName
    note
    createdAt
  }
`;
const LEARNING_RECEIPT = gql`
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_EVENT}
  fragment CreativeLearningReceipt on DeliveryCreativeLearningReceipt {
    workspaceId
    memberId
    userWorkspaceId
    observedAt
    actor {
      ...AdvertisingActorFields
    }
    inputHash
    receipt {
      ...CreativeLearningEvent
    }
  }
`;
export const GET_LEARNING_PREVIEW = gql`
  query DeliveryCreativeAdLinkPreview(
    $input: DeliveryCreativeAdLinkPreviewInput!
  ) {
    deliveryCreativeAdLinkPreview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      body {
        ...CreativeLearningBody
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_BODY}
`;
export const GET_LEARNING_CHOICES = gql`
  query DeliveryCreativeAdLinkChoices(
    $input: DeliveryCreativeAdLinkChoicesInput!
  ) {
    deliveryCreativeAdLinkChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      items {
        taskId
        title
        submissionVersion
        assetId
        assetName
        creativeVersion
      }
      totalCount
      nextCursor
      selectionWarnings
      selected {
        taskId
        submissionVersion
        assetId
        hasSubmittedCopy
        components {
          name
          role
          assetId
          briefVersion
          productionVersion
          assemblyVersion
          shotId
          shotVersion
        }
        provenComponents {
          name
          role
          assetId
          briefVersion
          productionVersion
          assemblyVersion
          shotId
          shotVersion
          provenance
        }
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_LEARNING_LINKS = gql`
  query DeliveryCreativeAdLinks($input: DeliveryCreativeAdLinksInput!) {
    deliveryCreativeAdLinks(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      items {
        ...CreativeLearningSummary
      }
      totalCount
      nextCursor
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_SUMMARY}
`;
export const GET_LEARNING_LINK = gql`
  query DeliveryCreativeAdLink($input: DeliveryCreativeAdLinkSelectionInput!) {
    deliveryCreativeAdLink(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      link {
        ...CreativeLearningSummary
      }
      canEdit
      canSubmit
      canReview
      canRequestChanges
      canRetract
      sourceCurrent
      warnings
      selectedVersion
      body {
        ...CreativeLearningBody
      }
      events {
        ...CreativeLearningEvent
      }
      nextEventCursor
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_SUMMARY}
  ${LEARNING_BODY}
  ${LEARNING_EVENT}
`;
export const GET_LEARNING_STATE = gql`
  query DeliveryCreativeAdLinkState($input: DeliveryCreativeAdLinkStateInput!) {
    deliveryCreativeAdLinkState(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      link {
        ...CreativeLearningSummary
      }
      canEdit
      canSubmit
      canReview
      canRequestChanges
      canRetract
      sourceCurrent
      warnings
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_SUMMARY}
`;
export const GET_LEARNING_RECEIPT = gql`
  query DeliveryCreativeLearningReceipt(
    $input: DeliveryCreativeLearningReceiptInput!
  ) {
    deliveryCreativeLearningReceipt(input: $input) {
      ...CreativeLearningReceipt
    }
  }
  ${LEARNING_RECEIPT}
`;
export const SAVE_LEARNING_LINK = gql`
  mutation SaveDeliveryCreativeAdLink(
    $input: DeliveryCreativeAdLinkSaveInput!
  ) {
    saveDeliveryCreativeAdLink(input: $input) {
      ...CreativeLearningReceipt
    }
  }
  ${LEARNING_RECEIPT}
`;
export const DECIDE_LEARNING_LINK = gql`
  mutation DecideDeliveryCreativeAdLink(
    $input: DeliveryCreativeAdLinkDecisionInput!
  ) {
    decideDeliveryCreativeAdLink(input: $input) {
      ...CreativeLearningReceipt
    }
  }
  ${LEARNING_RECEIPT}
`;
export const SAVE_CREATIVE_LESSON = gql`
  mutation RecordDeliveryCreativeLesson(
    $input: DeliveryCreativeLessonSaveInput!
  ) {
    recordDeliveryCreativeLesson(input: $input) {
      ...CreativeLearningReceipt
    }
  }
  ${LEARNING_RECEIPT}
`;
export const GET_CREATIVE_LESSONS = gql`
  query DeliveryCreativeLessons($input: DeliveryCreativeLessonsInput!) {
    deliveryCreativeLessons(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      actor {
        ...AdvertisingActorFields
      }
      items {
        id
        title
        assessment
        createdByName
        createdAt
        correctedById
      }
      totalCount
      nextCursor
      selected {
        id
        projectId
        title
        assessment
        lesson
        limitations
        nextTest
        correctsId
        correctedById
        createdByName
        createdAt
        warnings
        evidence {
          linkId
          version
          fingerprint
          body {
            ...CreativeLearningBody
          }
        }
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${LEARNING_BODY}
`;
