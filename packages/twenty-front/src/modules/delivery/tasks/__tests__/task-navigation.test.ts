import {
  taskListInput,
  taskPageDestination,
  getPlannerView,
} from '@/delivery/tasks/task-navigation';
import {
  PROJECT_ID,
  ASSIGNEE_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';
it.each([
  ['', 'tasks'],
  ['plannerView=capacity', 'capacity'],
  ['capacityFrom=2026-10-29', 'capacity'],
  ['capacityBucket=NEEDS_PLANNING', 'capacity'],
  ['plannerView=tasks&capacityFrom=2026-10-29', 'tasks'],
  ['plannerView=unknown&capacityFrom=2026-10-29', 'tasks'],
])('restores the intended Planner view from %s', (query, expected) => {
  expect(getPlannerView(new URLSearchParams(query))).toBe(expected);
});
it('preserves explicit calendar and server filters without using an assignee override for My tasks', () => {
  const input = taskListInput(
    new URLSearchParams({
      view: 'mine',
      taskTimezone: 'Asia/Qatar',
      project: PROJECT_ID,
      member: ASSIGNEE_ID,
      from: '2026-10-29',
      through: '2026-11-03',
      attention: 'today',
      status: 'BLOCKED',
      search: 'Logo',
    }),
  );
  expect(input).toMatchObject({
    view: 'MINE',
    timezone: 'Asia/Qatar',
    projectId: PROJECT_ID,
    assigneeId: null,
    scheduledFrom: '2026-10-29',
    scheduledThrough: '2026-11-03',
    attention: 'TODAY',
    state: 'BLOCKED',
    search: 'Logo',
    limit: 25,
  });
});
it.each([
  'taskTimezone=Missing%2FZone',
  'from=2026-02-30',
  'through=2026-10-29',
  'from=2026-10-30&through=2026-10-29',
  'project=unknown',
  'attention=guess',
  'status=UNKNOWN',
])(
  'rejects invalid task filters rather than broadening the selection: %s',
  (query) => {
    expect(taskListInput(new URLSearchParams(`view=home&${query}`))).toBeNull();
  },
);
it('keeps native URL task context and filters while advancing a bounded cursor', () => {
  const destination = taskPageDestination(
    new URLSearchParams(
      'view=mine&search=logo&task=exact&creativeSubmission=3',
    ),
    { tasksAfter: 'opaque-cursor' },
  );
  const params = new URL(destination, 'http://localhost').searchParams;
  expect(params.get('search')).toBe('logo');
  expect(params.get('task')).toBe('exact');
  expect(params.get('creativeSubmission')).toBe('3');
  expect(params.get('tasksAfter')).toBe('opaque-cursor');
});
