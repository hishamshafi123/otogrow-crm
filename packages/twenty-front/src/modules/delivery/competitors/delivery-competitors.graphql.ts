import { gql } from '@apollo/client';

const COMPETITOR_PROJECT = gql`
  fragment CompetitorProject on DeliveryCompetitorProject {
    id
    name
    revision
    companyId
  }
`;
const COMPETITOR_SUMMARY = gql`
  fragment CompetitorSummary on DeliveryCompetitorSourceSummary {
    id
    projectId
    companyId
    label
    platform
    canonicalReference
    ownerId
    ownerName
    reviewerId
    reviewerName
    revision
    currentVersion
    status
    cadenceHours
    lookbackDays
  }
`;
const COMPETITOR_BODY = gql`
  fragment CompetitorBody on DeliveryCompetitorSourceSavedBody {
    projectId
    label
    platform
    accountReference
    canonicalReference
    canonicalKey
    ownerId
    ownerName
    reviewerId
    reviewerName
    cadenceHours
    lookbackDays
    purpose
  }
`;
const COMPETITOR_RECEIPT = gql`
  fragment CompetitorReceipt on DeliveryCompetitorSourceReceipt {
    workspaceId
    actorId
    userWorkspaceId
    requestId
    sourceId
    inputHash
    action
    revision
    version
    status
    note
    actorName
    createdAt
  }
`;
export const GET_COMPETITOR_PROJECTS = gql`
  ${COMPETITOR_PROJECT}
  query DeliveryCompetitorProjects($input: DeliveryCompetitorProjectsInput!) {
    deliveryCompetitorProjects(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      items {
        ...CompetitorProject
      }
      totalCount
      nextCursor
    }
  }
`;
export const GET_COMPETITOR_SOURCES = gql`
  ${COMPETITOR_PROJECT}
  ${COMPETITOR_SUMMARY}
  query DeliveryCompetitorSources($input: DeliveryCompetitorSourcesInput!) {
    deliveryCompetitorSources(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...CompetitorProject
      }
      items {
        ...CompetitorSummary
      }
      totalCount
      nextCursor
    }
  }
`;
export const GET_COMPETITOR_CHOICES = gql`
  ${COMPETITOR_PROJECT}
  query DeliveryCompetitorSourceChoices(
    $input: DeliveryCompetitorSourceChoicesInput!
  ) {
    deliveryCompetitorSourceChoices(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...CompetitorProject
      }
      owners {
        id
        name
      }
      reviewers {
        id
        name
      }
    }
  }
`;
export const GET_COMPETITOR_SOURCE = gql`
  ${COMPETITOR_PROJECT}
  ${COMPETITOR_SUMMARY}
  ${COMPETITOR_BODY}
  ${COMPETITOR_RECEIPT}
  query DeliveryCompetitorSource(
    $input: DeliveryCompetitorSourceSelectionInput!
  ) {
    deliveryCompetitorSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...CompetitorProject
      }
      source {
        ...CompetitorSummary
      }
      selectedVersion
      body {
        ...CompetitorBody
      }
      history {
        ...CompetitorReceipt
      }
      nextCursor
      canEdit
      canPause
      canArchive
      canRestore
      collectionEnabled
      collectionState
    }
  }
`;
export const PREVIEW_COMPETITOR_SOURCE = gql`
  ${COMPETITOR_PROJECT}
  ${COMPETITOR_BODY}
  query PreviewDeliveryCompetitorSource(
    $input: DeliveryCompetitorSourceSaveInput!
  ) {
    previewDeliveryCompetitorSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      project {
        ...CompetitorProject
      }
      sourceId
      requestId
      inputHash
      body {
        ...CompetitorBody
      }
      collectionEnabled
      collectionState
    }
  }
`;
export const GET_COMPETITOR_RECEIPT = gql`
  ${COMPETITOR_RECEIPT}
  query DeliveryCompetitorSourceReceipt(
    $input: DeliveryCompetitorSourceReceiptInput!
  ) {
    deliveryCompetitorSourceReceipt(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      isManager
      receipt {
        ...CompetitorReceipt
      }
    }
  }
`;
export const SAVE_COMPETITOR_SOURCE = gql`
  ${COMPETITOR_RECEIPT}
  mutation SaveDeliveryCompetitorSource(
    $input: DeliveryCompetitorSourceSaveInput!
  ) {
    saveDeliveryCompetitorSource(input: $input) {
      ...CompetitorReceipt
    }
  }
`;
export const CHANGE_COMPETITOR_SOURCE = gql`
  ${COMPETITOR_RECEIPT}
  mutation ChangeDeliveryCompetitorSourceState(
    $input: DeliveryCompetitorSourceChangeInput!
  ) {
    changeDeliveryCompetitorSourceState(input: $input) {
      ...CompetitorReceipt
    }
  }
`;
