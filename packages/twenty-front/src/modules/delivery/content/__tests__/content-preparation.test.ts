import { canonicalContentBody } from '@/delivery/content/content-body';
import { mergeContentChoices } from '@/delivery/content/content-choices';
import {
  contentReviewerExcludedIds,
  contentVariantReady,
} from '@/delivery/content/ContentVariantFields';
import {
  contentBody,
  contentChoices,
  CONTENT_OWNER_ID,
  CONTENT_REVIEWER_ID,
} from '@/delivery/content/__tests__/content.fixtures';

it('keeps a parent planner eligible when she did not prepare the exact posting package', () => {
  expect(
    contentReviewerExcludedIds(
      contentBody,
      contentBody,
      CONTENT_REVIEWER_ID,
    ).has(CONTENT_REVIEWER_ID),
  ).toBe(false);
  expect(
    contentVariantReady(
      contentBody,
      contentChoices,
      contentBody,
      CONTENT_REVIEWER_ID,
    ),
  ).toBe(true);
});
it('excludes a reviewer after she edits the caption but not merely production notes', () => {
  expect(
    contentVariantReady(
      { ...contentBody, caption: 'My rewritten post' },
      contentChoices,
      contentBody,
      CONTENT_REVIEWER_ID,
    ),
  ).toBe(false);
  expect(
    contentVariantReady(
      { ...contentBody, notes: 'Review context only' },
      contentChoices,
      contentBody,
      CONTENT_REVIEWER_ID,
    ),
  ).toBe(true);
  expect(
    contentReviewerExcludedIds(
      contentBody,
      contentBody,
      CONTENT_REVIEWER_ID,
    ).has(CONTENT_OWNER_ID),
  ).toBe(true);
});
it('keeps exact selected people and accounts usable beyond a paged directory', () => {
  const merged = mergeContentChoices({
    ...contentChoices,
    accounts: [],
    members: [],
    selectedAccounts: contentChoices.accounts,
    selectedMembers: contentChoices.members,
  });
  expect(
    contentVariantReady(contentBody, merged, contentBody, CONTENT_OWNER_ID),
  ).toBe(true);
});
it('blocks stale account identity, invalid format and ambiguous planned time', () => {
  expect(
    contentVariantReady(
      { ...contentBody, accountRevision: 2 },
      contentChoices,
      contentBody,
      CONTENT_OWNER_ID,
    ),
  ).toBe(false);
  expect(
    contentVariantReady(
      { ...contentBody, format: 'UNSUPPORTED' },
      contentChoices,
      contentBody,
      CONTENT_OWNER_ID,
    ),
  ).toBe(false);
  expect(
    contentVariantReady(
      {
        ...contentBody,
        plannedLocal: '2026-11-01T01:30',
        timezone: 'America/New_York',
      },
      contentChoices,
      contentBody,
      CONTENT_OWNER_ID,
    ),
  ).toBe(false);
});
it('canonicalizes the payload without copying read-only snapshots into mutations', () => {
  const input = canonicalContentBody({
    ...contentBody,
    caption: '  Reviewed copy  ',
  });
  expect(input.caption).toBe('Reviewed copy');
  expect(input.plannedAt).toBe('2026-11-05T03:00:00Z');
  expect(input).not.toHaveProperty('contributorIds');
  expect(input).not.toHaveProperty('account');
  expect(input).not.toHaveProperty('sourceFingerprint');
});
