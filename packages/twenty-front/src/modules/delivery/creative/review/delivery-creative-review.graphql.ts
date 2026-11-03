import { gql } from '@apollo/client';

const TARGET = gql`
  fragment CreativeReviewTargetFields on DeliveryCreativeReviewTarget {
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
`;
const FEEDBACK = gql`
  fragment CreativeFeedbackFields on DeliveryCreativeFeedback {
    id
    revision
    targetKind
    submissionVersion
    assetId
    body
    anchorKind
    startMs
    endMs
    status
    createdAt
    createdByName
    updatedAt
    target {
      ...CreativeReviewTargetFields
    }
    correction {
      ...CreativeReviewTargetFields
    }
  }
  ${TARGET}
`;
export const GET_CREATIVE_REVIEW = gql`
  query DeliveryCreativeReview($input: DeliveryCreativeReviewInput!) {
    deliveryCreativeReview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      taskRevision
      state
      currentSubmissionVersion
      reviewerName
      assigneeName
      canComment
      canAddress
      canResolve
      canReviewFinal
      selected {
        ...CreativeReviewTargetFields
      }
      comparison {
        ...CreativeReviewTargetFields
      }
      submissions {
        version
        creativeVersion
        finalAssetId
        submittedAt
        submittedByName
        decision
      }
      nextBeforeSubmissionVersion
      assets {
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
      feedback {
        ...CreativeFeedbackFields
      }
      feedbackCount
      unresolvedCount
      earlierUnresolvedCount
      nextFeedbackId
      selectedFeedback {
        ...CreativeFeedbackFields
      }
    }
  }
  ${FEEDBACK}
`;
export const GET_CREATIVE_FEEDBACK_HISTORY = gql`
  query DeliveryCreativeFeedbackHistory(
    $input: DeliveryCreativeFeedbackHistoryInput!
  ) {
    deliveryCreativeFeedbackHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      taskId
      feedbackId
      nextBeforeId
      events {
        id
        action
        revision
        body
        actorName
        createdAt
        beforeStatus
        afterStatus
        correction {
          ...CreativeReviewTargetFields
        }
      }
    }
  }
  ${TARGET}
`;
export const CREATE_CREATIVE_FEEDBACK = gql`
  mutation CreateDeliveryCreativeFeedback(
    $input: DeliveryCreativeFeedbackCreateInput!
  ) {
    createDeliveryCreativeFeedback(input: $input) {
      feedback {
        ...CreativeFeedbackFields
      }
      replayed
    }
  }
  ${FEEDBACK}
`;
export const CHANGE_CREATIVE_FEEDBACK = gql`
  mutation ChangeDeliveryCreativeFeedback(
    $input: DeliveryCreativeFeedbackChangeInput!
  ) {
    changeDeliveryCreativeFeedback(input: $input) {
      feedback {
        ...CreativeFeedbackFields
      }
      replayed
    }
  }
  ${FEEDBACK}
`;
