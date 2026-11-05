import {
  contentDestination,
  contentSelectionValid,
  CONTENT_CLOSE_POST,
} from '@/delivery/content/content-navigation';
import {
  CONTENT_PLAN_ID,
  CONTENT_POST_ID,
  CONTENT_PROJECT_ID,
  CONTENT_REQUEST_ID,
} from '@/delivery/content/__tests__/content.fixtures';

it('opens a canonical content page while preserving filters and unrelated workspace state', () => {
  const next = new URL(
    contentDestination(
      new URLSearchParams(
        'view=content&contentView=legacy&contentStatus=REVIEW&other=kept',
      ),
      { contentProject: CONTENT_PROJECT_ID, contentPostId: CONTENT_POST_ID },
    ),
    'https://example.test',
  );
  expect(next.searchParams.get('contentView')).toBeNull();
  expect(next.searchParams.get('contentStatus')).toBe('REVIEW');
  expect(next.searchParams.get('other')).toBe('kept');
  expect(contentSelectionValid(next.searchParams)).toBe(true);
});
it('closes a post without losing its plan, owner or current list page', () => {
  const params = new URLSearchParams({
    contentProject: CONTENT_PROJECT_ID,
    contentPlanId: CONTENT_PLAN_ID,
    contentPostId: CONTENT_POST_ID,
    contentAfter: CONTENT_REQUEST_ID,
    contentMode: 'APPROVE',
    contentRequest: CONTENT_REQUEST_ID,
  });
  const next = new URL(
    contentDestination(params, CONTENT_CLOSE_POST),
    'https://example.test',
  ).searchParams;
  expect(next.has('contentPostId')).toBe(false);
  expect(next.has('contentRequest')).toBe(false);
  expect(next.get('contentPlanId')).toBe(CONTENT_PLAN_ID);
  expect(next.get('contentAfter')).toBe(CONTENT_REQUEST_ID);
});
it.each([
  `contentPostId=${CONTENT_POST_ID}`,
  `contentProject=${CONTENT_PROJECT_ID}&contentMode=APPROVE&contentPostId=${CONTENT_POST_ID}`,
  `contentProject=${CONTENT_PROJECT_ID}&contentMode=UNKNOWN&contentPostId=${CONTENT_POST_ID}&contentRequest=${CONTENT_REQUEST_ID}`,
  `contentProject=${CONTENT_PROJECT_ID}&contentPostId=${CONTENT_POST_ID}&contentVersion=-1`,
  'contentTimezone=Invalid/Zone',
  'contentDay=2026-02-30',
  'contentMonth=2026-13',
])('rejects an incomplete or impossible selection: %s', (value) => {
  expect(contentSelectionValid(new URLSearchParams(value))).toBe(false);
});
it('accepts exact cancellation receipt links and historical package versions', () => {
  expect(
    contentSelectionValid(
      new URLSearchParams({
        contentProject: CONTENT_PROJECT_ID,
        contentPostId: CONTENT_POST_ID,
        contentMode: 'CANCEL',
        contentRequest: CONTENT_REQUEST_ID,
      }),
    ),
  ).toBe(true);
  expect(
    contentSelectionValid(
      new URLSearchParams({
        contentProject: CONTENT_PROJECT_ID,
        contentPostId: CONTENT_POST_ID,
        contentVersion: '3',
        contentStatus: 'CANCELLED',
      }),
    ),
  ).toBe(true);
});
