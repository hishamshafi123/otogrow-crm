import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeliveryMyWorkQueue } from '@/delivery/DeliveryMyWorkQueue';
import { DeliveryMyWorkTask } from '@/delivery/DeliveryMyWorkTask';
import {
  type DeliveryState,
  type DeliveryTask,
} from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryBadge: 'span',
  StyledDeliveryCard: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));

const task = (
  title: string,
  state: DeliveryState = 'PLANNED',
  overrides: Partial<DeliveryTask> = {},
): DeliveryTask => ({
  id: title,
  title,
  assigneeId: 'editor',
  projectId: 'project',
  revision: 1,
  dueAt: null,
  details: {
    brief: '',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state,
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
  ...overrides,
});
const show = (tasks: DeliveryTask[], approvedOnly = false) =>
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryMyWorkQueue
        tasks={tasks}
        approvedOnly={approvedOnly}
        renderTask={(item) => <button key={item.id}>{item.title}</button>}
      />
    </I18nProvider>,
  );

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 25, 12));
});
afterEach(() => jest.useRealTimers());

it('separates required action from reviews even when their deadlines have passed', () => {
  const past = new Date(2026, 9, 24, 12).toISOString();
  show([
    task('Revise the hook', 'CHANGES_REQUESTED', { dueAt: past }),
    task('Need product photos', 'BLOCKED', { dueAt: past }),
    task('Late edit', 'IN_PROGRESS', { dueAt: past }),
    task('Review submitted edit', 'IN_REVIEW', { dueAt: past }),
  ]);
  expect(
    within(screen.getByRole('region', { name: 'Changes to make' })).getByRole(
      'button',
      { name: 'Revise the hook' },
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Blocked' })).getByRole(
      'button',
      { name: 'Need product photos' },
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Overdue' })).getByRole(
      'button',
      { name: 'Late edit' },
    ),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole('region', { name: 'Waiting for approval' }),
    ).getByRole('button', { name: 'Review submitted edit' }),
  ).toBeVisible();
  expect(screen.getAllByRole('button')).toHaveLength(4);
});

it('puts high priority current work first while retaining future and undated assignments', () => {
  const normal = task('Normal edit', 'IN_PROGRESS');
  const urgent = task('Priority edit', 'IN_PROGRESS');
  urgent.details.priority = 'HIGH';
  const future = task('Next week');
  future.details.scheduledDate = '2026-10-29';
  const tasks = [normal, future, task('Confirm timing'), urgent];
  const before = JSON.stringify(tasks);
  show(tasks);
  expect(
    within(screen.getByRole('region', { name: 'Work on next' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Priority edit', 'Normal edit']);
  expect(
    within(screen.getByRole('region', { name: 'Upcoming' })).getByRole(
      'button',
      { name: 'Next week' },
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Needs a schedule' })).getByRole(
      'button',
      { name: 'Confirm timing' },
    ),
  ).toBeVisible();
  expect(JSON.stringify(tasks)).toBe(before);
});

it('keeps today’s deadline and an earlier planned date actionable without calling them overdue', () => {
  const scheduled = task('Planned yesterday');
  scheduled.details.scheduledDate = '2026-10-24';
  show([
    scheduled,
    task('Due tonight', 'PLANNED', {
      dueAt: new Date(2026, 9, 25, 23).toISOString(),
    }),
  ]);
  expect(
    within(screen.getByRole('region', { name: 'Work on next' })).getAllByRole(
      'button',
    ),
  ).toHaveLength(2);
  expect(
    screen.queryByRole('region', { name: 'Overdue' }),
  ).not.toBeInTheDocument();
});

it('keeps approved work reachable without treating approval as client fulfilment', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  show([task('Approved cinematic', 'APPROVED')]);
  expect(
    screen.getByRole('button', { name: 'Approved cinematic' }),
  ).not.toBeVisible();
  await user.click(screen.getByText('Approved work (1)'));
  expect(
    screen.getByRole('button', { name: 'Approved cinematic' }),
  ).toBeVisible();
  expect(
    screen.getByText(/Client delivery and fulfilment are tracked separately/),
  ).toBeVisible();
});

it('opens approved work directly when the status filter requests it', () => {
  show([task('Finished edit', 'APPROVED')], true);
  expect(screen.getByRole('button', { name: 'Finished edit' })).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('explains when remaining assignments are waiting for review', () => {
  show([task('Submitted creative', 'IN_REVIEW')]);
  expect(screen.getByRole('status')).toHaveTextContent(
    'No production work needs your action in this view',
  );
  expect(
    screen.getByRole('button', { name: 'Submitted creative' }),
  ).toBeVisible();
});

it('shows the scheduled day independently from the deadline and opens the assignment', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const assignment = task('Prepare product shots', 'PLANNED', {
    dueAt: new Date(2026, 9, 30, 12).toISOString(),
  });
  assignment.details.scheduledDate = '2026-10-28';
  const onOpen = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryMyWorkTask
        task={assignment}
        projectName="Clothing launch"
        statusLabel="Planned"
        onOpen={onOpen}
      />
    </I18nProvider>,
  );
  expect(
    screen.getByText(
      `Scheduled ${new Date(2026, 9, 28, 12).toLocaleDateString()}`,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(`Due ${new Date(2026, 9, 30, 12).toLocaleDateString()}`),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: /Prepare product shots/ }),
  );
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('shows the blocker and real checklist completion without inventing a deadline', () => {
  const assignment = task('Product edit', 'BLOCKED');
  assignment.details.blocker = 'Waiting for approved product photos.';
  assignment.details.checklist = [
    { id: 'images', text: 'Images ready', done: true },
    { id: 'edit', text: 'Final edit ready', done: false },
  ];
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryMyWorkTask
        task={assignment}
        projectName="Launch"
        statusLabel="Blocked"
        onOpen={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getByText('Timing not set')).toBeVisible();
  expect(screen.getByText(assignment.details.blocker)).toBeVisible();
  expect(
    screen.getByRole('progressbar', { name: 'Custom checklist progress' }),
  ).toHaveAttribute('value', '1');
  expect(screen.getByText('1/2 custom checklist items')).toBeVisible();
});
