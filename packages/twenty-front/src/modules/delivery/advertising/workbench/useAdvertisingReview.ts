import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import {
  GET_ADVERTISING_REVIEW,
  GET_ADVERTISING_REVIEW_STATE,
} from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import {
  type DeliveryAdvertisingReviewQuery,
  type DeliveryAdvertisingReviewStateQuery,
} from '~/generated-metadata/graphql';

export const useAdvertisingReview = ({
  state,
  selection,
  reviewId,
  sourceScope,
  available,
  withDetail = true,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  reviewId: string;
  sourceScope: string;
  available: boolean;
  withDetail?: boolean;
}) => {
  const source = `${state.source}:${sourceScope}:${reviewId}`;
  const detailSource = `${state.source}:${selection.kind}:${selection.id}:${reviewId}`;
  const query = useQuery<DeliveryAdvertisingReviewStateQuery>(
    GET_ADVERTISING_REVIEW_STATE,
    {
      variables: { input: { id: reviewId }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !available,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingReviewState,
    source,
    enabled: available,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor) &&
      value.review !== undefined &&
      (value.review === null ||
        (value.review.id === reviewId &&
          value.review.sourceKind === selection.kind &&
          value.review.sourceId === selection.id)),
  });
  const detailQuery = useQuery<DeliveryAdvertisingReviewQuery>(
    GET_ADVERTISING_REVIEW,
    {
      variables: { input: { id: reviewId }, identity: detailSource },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip:
        !withDetail ||
        !available ||
        reading.data === null ||
        !reading.data.review,
    },
  );
  const detail = useAssistantRead({
    value: detailQuery.data?.deliveryAdvertisingReview,
    source: detailSource,
    enabled:
      withDetail &&
      available &&
      reading.data !== null &&
      Boolean(reading.data.review),
    loading: detailQuery.loading,
    error: detailQuery.error,
    networkStatus: detailQuery.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor) &&
      value.review !== undefined &&
      (value.review === null ||
        (value.review.id === reviewId &&
          value.review.source.kind === selection.kind &&
          value.review.source.id === selection.id)),
  });
  return {
    ...reading,
    query,
    detail: detail.data,
    detailQuery,
    denied:
      isOtogrowAccessDenied(query.error) ||
      isOtogrowAccessDenied(detailQuery.error),
    changed:
      reading.data?.review !== null &&
      reading.data?.review !== undefined &&
      detail.data?.review !== null &&
      detail.data?.review !== undefined &&
      reading.data.review.revision !== detail.data.review.revision,
  };
};
