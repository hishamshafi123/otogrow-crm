import {
  emptySetupTask,
  setupTaskInput,
  setupTaskIssues,
  setupTaskReady,
} from '@/delivery/onboarding/SetupFirstTaskFields';
import {
  clientSetupFixture,
  SETUP_EDITOR,
  SETUP_MANAGER,
} from '@/delivery/onboarding/__tests__/client-setup.fixtures';
const members = clientSetupFixture().members;
const prepared = () => ({
  ...emptySetupTask(),
  title: 'Product draft',
  assigneeId: SETUP_EDITOR,
  reviewerId: SETUP_MANAGER,
});
it('requires genuine project membership and a current manager, while allowing the same first-task manager in both roles', () => {
  expect(setupTaskReady(emptySetupTask(), members, [SETUP_EDITOR])).toBe(false);
  expect(setupTaskReady(prepared(), members, [SETUP_EDITOR])).toBe(true);
  expect(
    setupTaskReady(
      {
        ...prepared(),
        assigneeId: SETUP_MANAGER,
        reviewerId: SETUP_MANAGER,
      },
      members,
      [SETUP_MANAGER],
    ),
  ).toBe(true);
  expect(
    setupTaskIssues({ ...prepared(), reviewerId: SETUP_EDITOR }, members, [
      SETUP_EDITOR,
    ]),
  ).toContain('TASK_REVIEWER');
  expect(setupTaskIssues(prepared(), members, [])).toContain('TASK_ASSIGNEE');
});
it('accepts exactly thirty HTTP(S) references but preserves and blocks malformed, oversized and unsupported links', () => {
  const links = Array.from(
    { length: 30 },
    (_, index) => `https://example.test/source/${index}`,
  ).join('\n');
  expect(
    setupTaskReady({ ...prepared(), evidence: links }, members, [SETUP_EDITOR]),
  ).toBe(true);
  for (const evidence of [
    `${links}\nhttps://example.test/extra`,
    'not a URL',
    'file:///private/source',
    // oxlint-disable-next-line no-script-url -- Unsupported protocols must never become task references.
    'javascript:alert(1)',
    `https://example.test/${'a'.repeat(2000)}`,
  ]) {
    const values = { ...prepared(), evidence };
    expect(setupTaskIssues(values, members, [SETUP_EDITOR])).toContain(
      'TASK_REFERENCES',
    );
    expect(values.evidence).toBe(evidence);
  }
});
it('accepts a hundred two-hundred-character checklist items and rejects larger raw input without truncating it', () => {
  const checklist = Array.from({ length: 100 }, () => 'x'.repeat(200)).join(
    '\n',
  );
  expect(
    setupTaskReady({ ...prepared(), checklist }, members, [SETUP_EDITOR]),
  ).toBe(true);
  expect(setupTaskInput({ ...prepared(), checklist }).checklist).toHaveLength(
    100,
  );
  for (const value of [`${checklist}\nExtra`, 'x'.repeat(201)])
    expect(
      setupTaskIssues({ ...prepared(), checklist: value }, members, [
        SETUP_EDITOR,
      ]),
    ).toContain('TASK_CHECKLIST');
});
it('keeps optional dates empty and validates exact calendar/text/priority bounds before command preparation', () => {
  expect(setupTaskInput(prepared())).toMatchObject({
    dueAt: null,
    scheduledDate: null,
    evidence: [],
    checklist: [],
  });
  expect(
    setupTaskReady(
      { ...prepared(), title: 'x'.repeat(200), scheduledDate: '2028-02-29' },
      members,
      [SETUP_EDITOR],
    ),
  ).toBe(true);
  expect(
    setupTaskIssues({ ...prepared(), title: 'x'.repeat(201) }, members, [
      SETUP_EDITOR,
    ]),
  ).toContain('TASK_TITLE');
  expect(
    setupTaskIssues({ ...prepared(), dueDate: '2026-02-30' }, members, [
      SETUP_EDITOR,
    ]),
  ).toContain('TASK_DATE');
  expect(
    setupTaskIssues({ ...prepared(), priority: 'UNSUPPORTED' }, members, [
      SETUP_EDITOR,
    ]),
  ).toContain('TASK_PRIORITY');
});
