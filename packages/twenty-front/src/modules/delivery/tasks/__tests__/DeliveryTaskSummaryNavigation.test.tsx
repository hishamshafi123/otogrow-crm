import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryTaskSummaryList } from '@/delivery/tasks/DeliveryTaskSummaryList';
import {
  taskListFixture,
  OFF_PAGE_TASK_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryBadge: 'span',
  StyledDeliveryBoard: 'div',
}));
const opened = jest.fn();
const TaskDraft = () => {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: editing && note !== '', saving: false });
  return (
    <>
      <button onClick={() => setEditing(true)}>Edit round</button>
      {editing && (
        <>
          <label>
            Unsent revision note
            <input
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </label>
          <button onClick={() => requestAction(() => setEditing(false))}>
            Cancel revision
          </button>
        </>
      )}
      <button
        onClick={() => {
          cancelPendingNavigation();
          setNote('');
          setEditing(false);
        }}
      >
        Clear revoked preparation
      </button>
    </>
  );
};
const Page = () => {
  const [params, setParams] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const [lastOpened, setLastOpened] = useState('');
  const snapshot = taskListFixture();
  snapshot.items.push({
    ...snapshot.items[0],
    id: OFF_PAGE_TASK_ID,
    title: 'Approved readable task',
    state: 'APPROVED',
    workGroup: 'approved',
    review: { ...snapshot.items[0].review, canReview: false },
  });
  return (
    <>
      <DeliveryTaskSummaryList
        snapshot={snapshot}
        onOpenTask={(task) => {
          opened(task);
          setLastOpened(task.title);
        }}
      />
      <output aria-label="Last opened task">{lastOpened}</output>
      {params.has('task') && (
        <>
          <TaskDraft key={params.get('task')} />
          <button
            onClick={() =>
              requestAction(() => {
                const next = new URLSearchParams(params);
                next.delete('task');
                setParams(next);
              })
            }
          >
            Close task
          </button>
        </>
      )}
    </>
  );
};
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Page />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery?view=home'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return { router, user: userEvent.setup() };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  opened.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
it('opens an approved readable task with primary mouse clicks, including after clean revision cancel and drawer close', async () => {
  const { router, user } = setup();
  await user.click(
    screen.getByRole('link', { name: 'Approved readable task' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('task')).toBe(
    OFF_PAGE_TASK_ID,
  );
  expect(opened).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Edit round' }));
  await user.click(screen.getByRole('button', { name: 'Cancel revision' }));
  await user.click(screen.getByRole('button', { name: 'Close task' }));
  expect(router.state.location.search).toBe('?view=home');
  await user.click(
    screen.getByRole('link', { name: 'Approved readable task' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('task')).toBe(
    OFF_PAGE_TASK_ID,
  );
  expect(opened).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('protects a real dirty draft and permits a fresh primary click after preparation is cleared', async () => {
  const { router, user } = setup();
  await user.click(screen.getByRole('link', { name: 'Current product edit' }));
  await user.click(screen.getByRole('button', { name: 'Edit round' }));
  await user.type(
    screen.getByLabelText('Unsent revision note'),
    'Private preparation',
  );
  await user.click(
    screen.getByRole('link', { name: 'Approved readable task' }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Unsent revision note')).toHaveValue(
    'Private preparation',
  );
  await user.click(
    screen.getByRole('button', { name: 'Clear revoked preparation' }),
  );
  await user.click(screen.getByRole('button', { name: 'Close task' }));
  await user.click(
    screen.getByRole('link', { name: 'Approved readable task' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('task')).toBe(
    OFF_PAGE_TASK_ID,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
