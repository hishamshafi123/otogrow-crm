import {
  advertisingPreparationRetainsNavigation,
  advertisingReviewRetainsNavigation,
} from '@/delivery/advertising/drafts/advertising-draft-retention';
import {
  ADVERTISING_REPORT_ID,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_REQUEST_ID,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import {
  DRAFT_AGENT_ID,
  DRAFT_REQUEST_ID,
  DRAFT_RUN_ID,
} from '@/delivery/advertising/drafts/__tests__/advertising-draft.fixtures';

const owner = {
  sourceKind: 'META',
  sourceId: ADVERTISING_REPORT_ID,
  reviewId: ADVERTISING_REVIEW_ID,
  requestId: ADVERTISING_REQUEST_ID,
};
const current = {
  pathname: '/delivery',
  search: `?view=ads&adSource=META&adReport=${owner.sourceId}&adMode=review&adReview=${owner.reviewId}&adRequest=${owner.requestId}`,
};
const withParameters = (
  changes: Record<string, string | null>,
  location = current,
) => {
  const search = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(changes))
    value === null ? search.delete(name) : search.set(name, value);
  return { ...location, search: `?${search}` };
};

it('retains the owned manual review only for declared AI-selection changes inside the same source and save intent', () => {
  const retains = advertisingReviewRetainsNavigation(owner);
  expect(retains(current, withParameters({ adDraftView: 'assistants' }))).toBe(
    true,
  );
  expect(
    retains(
      current,
      withParameters({
        adDraftView: 'history',
        adDraftRun: DRAFT_RUN_ID,
        adDraftAfter: 'next-page',
      }),
    ),
  ).toBe(true);
  const reordered = {
    ...current,
    search: `?${[...new URLSearchParams(current.search)]
      .reverse()
      .map(([name, value]) => `${name}=${value}`)
      .join('&')}`,
  };
  expect(retains(current, reordered)).toBe(true);
});

it.each([
  ['adReport', DRAFT_RUN_ID],
  ['adReview', DRAFT_RUN_ID],
  ['adRequest', DRAFT_RUN_ID],
  ['adMode', 'assign'],
  ['view', 'planner'],
  ['adSearch', 'different report search'],
  ['unknownParameter', 'changed'],
  ['adDraftRun', 'invalid'],
])('does not retain an editor across a change to %s', (name, value) => {
  expect(
    advertisingReviewRetainsNavigation(owner)(
      current,
      withParameters({ [name]: value }),
    ),
  ).toBe(false);
});

it('rejects another route, another owner and incomplete preparation links', () => {
  const retains = advertisingReviewRetainsNavigation(owner);
  expect(retains(current, { ...current, pathname: '/other' })).toBe(false);
  expect(
    advertisingReviewRetainsNavigation({
      ...owner,
      requestId: DRAFT_REQUEST_ID,
    })(current, withParameters({ adDraftView: 'history' })),
  ).toBe(false);
  expect(
    retains(
      current,
      withParameters({
        adDraftView: 'prepare',
        adDraftRequest: DRAFT_REQUEST_ID,
      }),
    ),
  ).toBe(false);
});

it('retains private AI inputs only within their original request/run/assistant lifetime', () => {
  const preparation = withParameters({
    adDraftView: 'prepare',
    adDraftRequest: DRAFT_REQUEST_ID,
    adDraftRun: DRAFT_RUN_ID,
    adDraftAssistant: DRAFT_AGENT_ID,
  });
  const retains = advertisingPreparationRetainsNavigation(
    owner,
    DRAFT_REQUEST_ID,
    DRAFT_RUN_ID,
  );
  expect(
    retains(preparation, withParameters({ adDraftAfter: 'page' }, preparation)),
  ).toBe(true);
  expect(
    retains(
      preparation,
      withParameters({ adDraftView: 'history' }, preparation),
    ),
  ).toBe(false);
  expect(
    retains(
      preparation,
      withParameters({ adDraftRun: ADVERTISING_REQUEST_ID }, preparation),
    ),
  ).toBe(false);
  expect(
    retains(
      preparation,
      withParameters({ adDraftAssistant: ADVERTISING_REQUEST_ID }, preparation),
    ),
  ).toBe(false);
});
