import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';

jest.mock('@/delivery/workflows/useTaskWorkflow', () => ({
  useTaskWorkflow: () => ({ readyToSubmit: true, data: {}, reset: jest.fn() }),
}));
jest.mock('@/delivery/workflows/DeliveryTaskWorkflow', () => ({
  DeliveryTaskWorkflow: () => null,
}));

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
  StyledDeliveryCelebration: 'div',
}));
const task: DeliveryTask = {
  id: 'task',
  title: 'Brand video',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 3,
  details: {
    brief: 'Keep the logo accurate',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state: 'PLANNED',
    blocker: '',
    evidence: [],
    checklist: [],
    events: [],
    submissions: [],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [task],
  companies: [],
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  members: [
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
    { id: 'manager', name: 'Amna', access: 'ADMIN', roleLabel: '' },
  ],
};
const run = jest.fn<Promise<boolean>, [Record<string, unknown>]>();

const Harness = ({
  mode,
}: {
  mode: 'edit' | 'create' | 'detail' | 'detailEdit';
}) => {
  const [currentTask, setCurrentTask] = useState(task);
  const [closed, setClosed] = useState(false);
  const { requestAction } = useDeliveryDraftGuard();
  const location = useLocation();
  const [, setParams] = useSearchParams();
  return (
    <>
      <Link to="/other">Other view</Link>
      <Link to="/delivery?panel=creative">Creative tab</Link>
      <output aria-label="Location">
        {location.pathname}
        {location.search}
      </output>
      <button
        onClick={() =>
          requestAction(() => {
            setClosed(true);
            setParams({ closed: 'yes' });
          })
        }
      >
        Close task
      </button>
      <button
        onClick={() =>
          setCurrentTask({ ...task, revision: 4, title: 'Updated by Amna' })
        }
      >
        Refresh task
      </button>
      {!closed &&
        location.pathname === '/delivery' &&
        !location.search &&
        (mode === 'detail' || mode === 'detailEdit' ? (
          <DeliveryTaskDetail
            task={{
              ...currentTask,
              details: {
                ...currentTask.details,
                state: mode === 'detail' ? 'IN_REVIEW' : 'PLANNED',
              },
            }}
            workspace={workspace}
            run={run}
            busy={false}
            celebrateApproval={false}
            stateLabel={(state) => state}
          />
        ) : (
          <DeliveryTaskForm
            task={mode === 'edit' ? currentTask : undefined}
            workspace={workspace}
            run={run}
            busy={false}
            onSaved={() => setClosed(true)}
          />
        ))}
      {closed && <p>Task closed</p>}
    </>
  );
};
const setup = (mode: 'edit' | 'create' | 'detail' | 'detailEdit' = 'edit') => {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness mode={mode} />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return { user: userEvent.setup(), router };
};
const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
beforeAll(() => {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  run.mockReset().mockResolvedValue(true);
});

describe('task draft protection', () => {
  it('lets untouched forms leave without a confirmation', async () => {
    const { user } = setup();
    await waitFor(() => expect(unload()).toBe(false));
    await user.click(screen.getByRole('link', { name: 'Other view' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent('/other');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves edits when a tab change is cancelled and discards only after confirmation', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), ' draft');
    expect(unload()).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Creative tab' }));
    expect(
      screen.getByRole('dialog', { name: 'Keep your changes?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Brand video draft');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/delivery');
    await user.click(screen.getByRole('link', { name: 'Other view' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.getByLabelText('Location')).toHaveTextContent('/other');
    await waitFor(() => expect(unload()).toBe(false));
  });

  it('protects local close and treats Escape in the confirmation as keep editing', async () => {
    const { user } = setup('create');
    await user.type(screen.getByLabelText('Title'), 'New client video');
    await user.click(screen.getByRole('button', { name: 'Close task' }));
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close task' })).toHaveFocus();
    expect(screen.getByLabelText('Title')).toHaveValue('New client video');
    await user.click(screen.getByRole('button', { name: 'Close task' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.getByText('Task closed')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(unload()).toBe(false));
  });

  it('requires a title and eligible project assignee before creating work', async () => {
    const { user } = setup('create');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    await user.type(screen.getByLabelText('Title'), 'New client video');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Assignee'), 'editor');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Reviewer'), '');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    expect(run).not.toHaveBeenCalled();
  });

  it('retains a failed save, then clears the guard after a successful retry', async () => {
    run.mockResolvedValueOnce(false);
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), ' revised');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your edits are still here',
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Brand video revised');
    expect(unload()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'edit', revision: 3 }),
    );
    expect(screen.getByText('Task closed')).toBeInTheDocument();
    await waitFor(() => expect(unload()).toBe(false));
    await user.click(screen.getByRole('link', { name: 'Other view' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks departure and editing while a save is pending', async () => {
    let complete: (saved: boolean) => void = () => undefined;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), ' new');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByLabelText('Title')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Close task' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'A save is in progress',
    );
    expect(
      screen.getByRole('button', { name: 'Discard and continue' }),
    ).toBeDisabled();
    await act(async () => complete(false));
    expect(
      screen.getByRole('button', { name: 'Discard and continue' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Brand video new');
  });

  it('continues the pending navigation once a save succeeds without another discard prompt', async () => {
    let complete: (saved: boolean) => void = () => undefined;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), ' saved');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('link', { name: 'Other view' }));
    expect(
      screen.getByRole('button', { name: 'Discard and continue' }),
    ).toBeDisabled();
    await act(async () => complete(true));
    await waitFor(() =>
      expect(screen.getByLabelText('Location')).toHaveTextContent('/other'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(unload()).toBe(false);
  });

  it('does not overwrite refreshed task changes with an old draft', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), ' personal draft');
    await user.click(screen.getByRole('button', { name: 'Refresh task' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your draft is preserved',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Brand video personal draft',
    );
    await user.click(
      screen.getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Brand video personal draft',
    );
    await user.click(
      screen.getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Updated by Amna');
    await waitFor(() => expect(unload()).toBe(false));
    await user.type(screen.getByLabelText('Title'), ' ready');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ revision: 4 }));
  });

  it('protects the actual assignment editor when Cancel editing is clicked', async () => {
    const { user } = setup('detailEdit');
    await user.click(screen.getByRole('button', { name: 'Edit assignment' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Changed assignment');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(
      screen.getByRole('dialog', { name: 'Keep your changes?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Changed assignment');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Brand video' }),
    ).toBeInTheDocument();
  });

  it('saving a discussion note does not discard separate unsaved review feedback', async () => {
    const { user } = setup('detail');
    await user.type(
      screen.getByLabelText('Feedback'),
      'Change the opening shot',
    );
    await user.type(
      screen.getByLabelText('Add a note'),
      'Please check reference two',
    );
    await user.click(screen.getByRole('button', { name: 'Post note' }));
    expect(screen.getByLabelText('Add a note')).toHaveValue('');
    expect(unload()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close task' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Feedback')).toHaveValue(
      'Change the opening shot',
    );
    await user.click(screen.getByRole('button', { name: 'Request changes' }));
    await waitFor(() => expect(unload()).toBe(false));
  });
});

it('preserves collapsed task supporting details through saving without treating disclosure toggles as edits', async () => {
  const { user } = setup();
  const supportingDetails = screen.getByText(/Checklist and references/);
  await user.click(supportingDetails);
  await user.click(supportingDetails);
  expect(unload()).toBe(false);
  await user.click(supportingDetails);
  await user.type(
    screen.getByLabelText('Checklist — one item per line'),
    'Check product details',
  );
  await user.type(
    screen.getByLabelText('References and file links — one URL per line'),
    'https://example.com/reference',
  );
  await user.click(supportingDetails);
  expect(supportingDetails).toHaveTextContent('Items: 1 · Links: 1');
  expect(
    screen.getByLabelText('Checklist — one item per line'),
  ).not.toBeVisible();
  await user.click(supportingDetails);
  expect(screen.getByLabelText('Checklist — one item per line')).toHaveValue(
    'Check product details',
  );
  await user.click(supportingDetails);
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'edit',
      fields: expect.objectContaining({
        checklist: [
          {
            id: expect.any(String),
            text: 'Check product details',
            done: false,
          },
        ],
        evidence: ['https://example.com/reference'],
      }),
    }),
  );
  expect(screen.getByText('Task closed')).toBeVisible();
  await waitFor(() => expect(unload()).toBe(false));
});
