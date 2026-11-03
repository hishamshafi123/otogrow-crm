import { areCreativeLessonMeasuresComparable } from '@/delivery/creative/learning/creative-lesson-evidence';
import { creativeLessonSelectionFixture } from '@/delivery/creative/learning/__tests__/creative-learning.fixtures';
it('permits known zero and different ad hashes for the same raw event/account/timezone without combining windows', () => {
  const first = creativeLessonSelectionFixture(),
    second = creativeLessonSelectionFixture();
  second.body.goalSnapshot.metricKey = `ad:${'c'.repeat(24)}:actions:${'b'.repeat(32)}`;
  second.body.source.fromDate = '2026-10-31';
  second.body.source.throughDate = '2026-10-31';
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(true);
  expect(first.body.goalSnapshot.value).toBe('0');
  expect(second.body.source.fromDate).toBe('2026-10-31');
});
it('does not equate different provider event identities or actions with action values', () => {
  const first = creativeLessonSelectionFixture(),
    second = creativeLessonSelectionFixture();
  second.body.goalSnapshot.metricKey = `ad:${'a'.repeat(24)}:actions:${'f'.repeat(32)}`;
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
  second.body.goalSnapshot.metricKey = `ad:${'a'.repeat(24)}:action_values:${'b'.repeat(32)}`;
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
});
it('requires inconclusive interpretation for human/unknown measurements and different attribution scopes', () => {
  const first = creativeLessonSelectionFixture(),
    second = creativeLessonSelectionFixture();
  second.body.goalSnapshot.provenance = 'HUMAN';
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
  second.body.goalSnapshot.provenance = 'REPORT';
  second.body.goalSnapshot.value = null;
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
  second.body.goalSnapshot.value = '0';
  second.body.source.accountId = 'different-account';
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
  second.body.source.accountId = first.body.source.accountId;
  second.body.source.timezone = null;
  expect(areCreativeLessonMeasuresComparable([first, second])).toBe(false);
});
