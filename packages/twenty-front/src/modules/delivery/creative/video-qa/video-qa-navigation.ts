import { isValidUuid } from 'twenty-shared/utils';
import { creativeProductionDestination } from '@/delivery/creative/production/creative-production-navigation';
import { type DeliveryDraftNavigationRetention } from '@/delivery/drafts/DeliveryDraftGuard';
export const VIDEO_QA_CLOSE = {
  creativeQaRequest: null,
  creativeQaRun: null,
  creativeQaCancel: null,
  creativeQaAfter: null,
};
export const videoQaDestination = creativeProductionDestination;
export const videoQaSelectionValid = (params: URLSearchParams) =>
  [
    'creativeQaRequest',
    'creativeQaRun',
    'creativeQaCancel',
    'creativeQaAfter',
  ].every(
    (key) => params.get(key) === null || isValidUuid(params.get(key) ?? ''),
  ) &&
  (!params.has('creativeQaCancel') || params.has('creativeQaRun'));
export const retainsVideoQaReader = (
  current: Parameters<DeliveryDraftNavigationRetention>[0],
  next: Parameters<DeliveryDraftNavigationRetention>[1],
) => {
  if (current.pathname !== next.pathname) return false;
  const previous = new URLSearchParams(current.search),
    target = new URLSearchParams(next.search);
  for (const key of ['creativeQaRun', 'creativeQaAfter', 'creativeQaCancel']) {
    previous.delete(key);
    target.delete(key);
  }
  previous.sort();
  target.sort();
  return previous.toString() === target.toString();
};
export const retainsVideoQaCancellation = (
  current: Parameters<DeliveryDraftNavigationRetention>[0],
  next: Parameters<DeliveryDraftNavigationRetention>[1],
) => {
  if (current.pathname !== next.pathname) return false;
  const previous = new URLSearchParams(current.search),
    target = new URLSearchParams(next.search);
  for (const key of ['creativeQaRequest', 'creativeQaAfter']) {
    previous.delete(key);
    target.delete(key);
  }
  previous.sort();
  target.sort();
  return previous.toString() === target.toString();
};
