import { fastDeepEqual, isValidUuid } from 'twenty-shared/utils';
import { type DeliveryDraftNavigationRetention } from '@/delivery/drafts/DeliveryDraftGuard';
import { readAdvertisingNavigation } from '@/delivery/advertising/workbench/advertising-navigation';
import { advertisingDraftClose } from '@/delivery/advertising/drafts/advertising-draft-navigation';

type AdvertisingDraftOwner = {
  sourceKind: string;
  sourceId: string;
  reviewId: string;
  requestId: string;
};
const remainingParameters = (search: string) =>
  [...new URLSearchParams(search)]
    .filter(([name]) => !Object.hasOwn(advertisingDraftClose, name))
    .sort(
      ([firstName, firstValue], [secondName, secondValue]) =>
        firstName.localeCompare(secondName) ||
        firstValue.localeCompare(secondValue),
    );

export const advertisingReviewRetainsNavigation =
  (owner: AdvertisingDraftOwner): DeliveryDraftNavigationRetention =>
  (current, next) => {
    if (
      current.pathname !== '/delivery' ||
      next.pathname !== current.pathname ||
      !readAdvertisingNavigation(new URLSearchParams(next.search)).success
    )
      return false;
    const currentParameters = new URLSearchParams(current.search);
    if (
      currentParameters.get('view') !== 'ads' ||
      currentParameters.get('adMode') !== 'review' ||
      currentParameters.get('adSource') !== owner.sourceKind ||
      currentParameters.get('adReport') !== owner.sourceId ||
      currentParameters.get('adReview') !== owner.reviewId ||
      currentParameters.get('adRequest') !== owner.requestId ||
      ![owner.sourceId, owner.reviewId, owner.requestId].every(isValidUuid)
    )
      return false;
    return fastDeepEqual(
      remainingParameters(current.search),
      remainingParameters(next.search),
    );
  };

export const advertisingPreparationRetainsNavigation = (
  owner: AdvertisingDraftOwner,
  requestId: string,
  runId: string,
): DeliveryDraftNavigationRetention => {
  const retainsReview = advertisingReviewRetainsNavigation(owner);
  return (current, next) => {
    if (!retainsReview(current, next)) return false;
    const first = new URLSearchParams(current.search);
    const second = new URLSearchParams(next.search);
    return (
      first.get('adDraftRequest') === requestId &&
      first.get('adDraftRun') === runId &&
      ['adDraftRequest', 'adDraftRun', 'adDraftAssistant', 'adDraftView'].every(
        (name) => first.get(name) === second.get(name),
      )
    );
  };
};
