import { gql } from '@apollo/client';
import {
  ADVERTISING_ACTOR_FIELDS,
  ADVERTISING_SOURCE_FIELDS,
  ADVERTISING_TASK_FIELDS,
} from '@/delivery/advertising/workbench/delivery-advertising.graphql';

const NAMED_ROUTING_FIELDS = gql`
  fragment AdvertisingNamedRoutingFields on DeliveryAdvertisingNamedRouting {
    projectId
    projectName
    companyId
    engagementId
    managerId
    managerName
    marketerId
    marketerName
  }
`;
export const GET_ADVERTISING_SOURCES = gql`
  query DeliveryAdvertisingSources($input: DeliveryAdvertisingSourcesInput!) {
    deliveryAdvertisingSources(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      scope
      totalCount
      nextCursor
      actor {
        ...AdvertisingActorFields
      }
      items {
        kind
        id
        title
        projectId
        projectName
        accountId
        channel
        currency
        fromDate
        throughDate
        recordedAt
        hasNewerVersion
        archived
        sourceStatus
        legacyTaskId
        currentDraftId
        latestAssignedId
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
`;
export const GET_ADVERTISING_SOURCE_STATE = gql`
  query DeliveryAdvertisingSourceState(
    $input: DeliveryAdvertisingSourceInput!
  ) {
    deliveryAdvertisingSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      fingerprint
      evidenceFingerprint
      evidenceLoaded
      actor {
        ...AdvertisingActorFields
      }
      source {
        ...AdvertisingSourceFields
      }
      canManageDraft
      canReview
      requiresSourceApproval
      reasonCodes
      legacyTaskId
      currentDraftId
      latestAssignedId
      recordedAt
      lastCheckedAt
      hasNewerVersion
      originalRouting {
        ...AdvertisingNamedRoutingFields
      }
      currentRouting {
        ...AdvertisingNamedRoutingFields
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_SOURCE_FIELDS}
  ${NAMED_ROUTING_FIELDS}
`;
export const GET_ADVERTISING_SOURCE = gql`
  query DeliveryAdvertisingSource($input: DeliveryAdvertisingSourceInput!) {
    deliveryAdvertisingSource(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      fingerprint
      evidenceFingerprint
      evidenceLoaded
      actor {
        ...AdvertisingActorFields
      }
      source {
        ...AdvertisingSourceFields
      }
      canManageDraft
      canReview
      requiresSourceApproval
      reasonCodes
      legacyTaskId
      legacyReviewNote
      currentDraftId
      latestAssignedId
      recordedAt
      lastCheckedAt
      hasNewerVersion
      originalRouting {
        ...AdvertisingNamedRoutingFields
      }
      currentRouting {
        ...AdvertisingNamedRoutingFields
      }
      metrics {
        key
        label
        unit
        goalKinds
        value
        provenance
        reason
      }
      sourceUrl
      metricAdId
      adTotalCount
      adOffset
      nextAdOffset
      reportedGoalKind
      reportedTargetCostMicros
      legacyAdoptedReviewId
      legacyTask {
        ...AdvertisingTaskFields
      }
      ads {
        id
        name
        campaignId
        campaignName
        adsetId
        adsetName
        spendMicros
        impressions
        clicks
      }
    }
  }
  ${ADVERTISING_ACTOR_FIELDS}
  ${ADVERTISING_SOURCE_FIELDS}
  ${NAMED_ROUTING_FIELDS}
  ${ADVERTISING_TASK_FIELDS}
`;
