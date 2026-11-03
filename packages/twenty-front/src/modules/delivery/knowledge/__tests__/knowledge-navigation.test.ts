import {
  knowledgeDestination,
  knowledgeSelectionValid,
} from '@/delivery/knowledge/knowledge-navigation';

const PROJECT = '20000000-0000-4000-8000-000000000001';
const SOURCE = '20000000-0000-4000-8000-000000000002';
it('preserves project filters and paging while closing exact source selection', () => {
  const current = new URLSearchParams(
    `view=knowledge&project=${PROJECT}&source=${SOURCE}&knowledgeAfter=page&knowledgeSearch=launch`,
  );
  const target = new URL(
    knowledgeDestination(current, { source: null, knowledgeEdit: null }),
    'http://local',
  );
  expect(target.searchParams.get('project')).toBe(PROJECT);
  expect(target.searchParams.get('knowledgeAfter')).toBe('page');
  expect(target.searchParams.get('knowledgeSearch')).toBe('launch');
  expect(target.searchParams.has('source')).toBe(false);
});
it.each([
  `source=${SOURCE}`,
  `project=${PROJECT}&source=${SOURCE}&knowledgeCreate=${SOURCE}`,
  `project=${PROJECT}&source=${SOURCE}&knowledgeVersion=NaN`,
  `project=${PROJECT}&source=${SOURCE}&knowledgeVersion=1&knowledgeEdit=1`,
  'project=invalid',
])('rejects incomplete or ambiguous source identity: %s', (selection) => {
  expect(knowledgeSelectionValid(new URLSearchParams(selection))).toBe(false);
});
it('allows a stable create ID under its explicit project', () => {
  expect(
    knowledgeSelectionValid(
      new URLSearchParams(`project=${PROJECT}&knowledgeCreate=${SOURCE}`),
    ),
  ).toBe(true);
});
