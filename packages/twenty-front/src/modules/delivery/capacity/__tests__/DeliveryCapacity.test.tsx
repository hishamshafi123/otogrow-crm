import { useState, type ReactNode } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  AvailabilityEditor,
  DeliveryCapacity,
} from '@/delivery/capacity/DeliveryCapacity';
import {
  DeliveryTaskPlan,
  TaskPlanEditor,
} from '@/delivery/capacity/DeliveryTaskPlan';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import { EMPTY_TASK_PLAN } from '@/delivery/capacity/capacity.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryBadge: 'span',
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
}));
let manager = true;
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    manager,
    ready: true,
    scope: 'scope',
    matches: () => true,
  }),
}));
const refetch = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    refetch,
    data: {
      deliveryCapacity: {
        workspaceId: 'workspace',
        memberId: 'manager',
        userWorkspaceId: 'user',
        startDate: '2026-11-01',
        availability: [
          { memberId: 'editor', date: '2026-11-01', minutes: 100, revision: 1 },
        ],
      },
    },
  }),
  useMutation: () => [jest.fn()],
}));
const task: DeliveryTask = {
  id: 'video',
  title: 'Unique video',
  assigneeId: 'editor',
  projectId: 'brand',
  revision: 3,
  dueAt: null,
  details: {
    brief: 'Accurate product',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: '2026-11-01',
    reviewerId: 'manager',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
    plan: {
      ...EMPTY_TASK_PLAN,
      workMinutes: 120,
      revisionMinutes: 30,
      waitMinutes: 90,
      reviewMinutes: 20,
      reviewDate: '2026-11-01',
    },
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  companies: [],
  projects: [],
  tasks: [task],
  members: [
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
    { id: 'manager', name: 'Amna', access: 'MANAGER', roleLabel: '' },
  ],
};
const show = (content: ReactNode) =>
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/',
              element: (
                <DeliveryDraftGuardProvider>
                  {content}
                </DeliveryDraftGuardProvider>
              ),
            },
          ],
          { initialEntries: ['/?capacityFrom=2026-11-01'] },
        )}
      />
    </I18nProvider>,
  );
beforeEach(() => {
  manager = true;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
const opened = {
  memberId: 'editor',
  date: '2026-11-01',
  minutes: 300,
  revision: 1,
};
it('shows overload and incomplete capacity with separate generation waits and task links', async () => {
  const open = jest.fn();
  show(<DeliveryCapacity workspace={workspace} onOpenTask={open} />);
  await userEvent.click(screen.getByText('Editor'));
  const day = within(
    screen.getByRole('region', { name: 'Editor · 2026-11-01' }),
  );
  expect(day.getByText('150 / 100 min')).toBeVisible();
  expect(day.getByText('Over capacity by at least 50 min.')).toBeVisible();
  expect(day.getByText(/Generation waiting 90 min/)).toBeVisible();
  await userEvent.click(
    day.getByRole('button', { name: 'Unique video · Production' }),
  );
  expect(open).toHaveBeenCalledWith('video');
  await userEvent.click(screen.getByText('Amna'));
  expect(
    screen.getByText('20 estimated min · availability unknown'),
  ).toBeVisible();
});
it('does not expose team availability to non-managers', () => {
  manager = false;
  show(<DeliveryCapacity workspace={workspace} onOpenTask={jest.fn()} />);
  expect(screen.queryByText('Team capacity')).not.toBeInTheDocument();
});
it('preserves failed availability changes and distinguishes an unavailable day from unknown', async () => {
  const save = jest.fn().mockResolvedValue(false);
  show(
    <AvailabilityEditor
      opened={opened}
      latest={opened}
      memberName="Editor"
      onSave={save}
      onClose={jest.fn()}
    />,
  );
  const input = screen.getByLabelText('Available working minutes');
  await userEvent.clear(input);
  await userEvent.type(input, '0');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save availability' }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith({ ...opened, minutes: 0 }),
  );
  expect(input).toHaveValue(0);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your draft is preserved',
  );
  await userEvent.clear(input);
  await userEvent.click(
    screen.getByRole('button', { name: 'Save availability' }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith({ ...opened, minutes: null }),
  );
});
it('reloads newer availability only after explicit discard, preserving Keep editing', async () => {
  const Harness = () => {
    const [latest, setLatest] = useState(opened);
    return (
      <>
        <button
          onClick={() => setLatest({ ...opened, revision: 2, minutes: 180 })}
        >
          Another manager saved
        </button>
        <AvailabilityEditor
          opened={opened}
          latest={latest}
          memberName="Editor"
          onSave={jest.fn()}
          onClose={jest.fn()}
        />
      </>
    );
  };
  show(<Harness />);
  const input = screen.getByLabelText('Available working minutes');
  await userEvent.clear(input);
  await userEvent.type(input, '420');
  await userEvent.click(screen.getByText('Another manager saved'));
  expect(
    screen.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest availability' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveValue(420);
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest availability' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(input).toHaveValue(180);
  expect(
    screen.getByRole('button', { name: 'Save availability' }),
  ).toBeEnabled();
});
it('saves only remaining effort with the opened task version and preserves failed input', async () => {
  const run = jest.fn().mockResolvedValue(false);
  show(
    <TaskPlanEditor task={task} run={run} busy={false} onClose={jest.fn()} />,
  );
  const input = screen.getByLabelText('Remaining production minutes');
  await userEvent.clear(input);
  await userEvent.type(input, '240');
  await userEvent.click(screen.getByRole('button', { name: 'Save estimate' }));
  await waitFor(() =>
    expect(run).toHaveBeenCalledWith({
      action: 'plan',
      taskId: task.id,
      revision: 3,
      plan: { ...task.details.plan, workMinutes: 240 },
    }),
  );
  expect(input).toHaveValue(240);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your draft is preserved',
  );
});
it('keeps approved work read-only and displays unknown effort honestly', () => {
  show(
    <DeliveryTaskPlan
      task={{
        ...task,
        details: { ...task.details, state: 'APPROVED', plan: undefined },
      }}
      canManage
      run={jest.fn()}
      busy={false}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Plan remaining effort' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Production: Not estimated/)).toBeVisible();
  expect(screen.getByText('Complexity: Not assessed')).toBeVisible();
});
