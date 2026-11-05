import { useState } from 'react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Request } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryWorkflowCatalog } from '@/delivery/workflows/DeliveryWorkflowCatalog';
import {
  WorkflowPinField,
  workflowPinFromForm,
} from '@/delivery/workflows/WorkflowPinField';
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import {
  type WorkflowCatalog,
  type TaskWorkflow,
  type WorkflowDefinition,
} from '@/delivery/workflows/workflow.types';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
  StyledDeliveryCelebration: 'div',
}));
jest.mock('@/delivery/workflows/workflowStyles', () => ({
  StyledWorkflowActions: 'div',
  StyledWorkflowFields: 'fieldset',
  StyledWorkflowList: 'ul',
}));
let mockCatalog: WorkflowCatalog;
let mockSnapshot: TaskWorkflow;
let mockTask: DeliveryTask;
let mockMember: string;
let mockWorkspace: string;
let mockManager: boolean;
let mockReadError: Error | undefined;
let mockPermissionError: Error | undefined;
let mockLoading: boolean;
const mockQueries = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
const mockRun = jest.fn();
jest.mock('@/delivery/reviews/DeliveryTaskReview', () => ({
  DeliveryTaskReview: () => null,
}));
jest.mock('@/delivery/reviews/useTaskReview', () => ({
  useTaskReview: () => ({
    data:
      mockPermissionError || mockReadError || mockLoading
        ? null
        : {
            canReviewSubmission:
              mockManager &&
              mockTask.details.reviewerId === mockMember &&
              mockTask.assigneeId !== mockMember,
            canApprove: true,
            pending: {
              submissionVersion: mockTask.details.submissions.at(-1)?.version,
            },
            assignment: null,
          },
  }),
}));
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({ identity: `${mockWorkspace}:${mockMember}` }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: {
      workspaceId: mockWorkspace,
      memberId: mockMember,
      userWorkspaceId: 'membership',
      capabilities: mockManager ? ['delivery.manage'] : [],
    },
    scopeKey:
      mockPermissionError || mockLoading
        ? null
        : `${mockWorkspace}:${mockMember}:membership`,
    loading: mockLoading,
    error: mockPermissionError,
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: { variables?: unknown; skip?: boolean },
  ) => {
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    );
    mockQueries(
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '',
      options,
    );
    return {
      data: {
        deliveryWorkflowCatalog: mockCatalog,
        deliveryTaskWorkflow: mockSnapshot,
      },
      loading: false,
      error: mockReadError,
      refetch: mockRefetch,
    };
  },
  useMutation: (document: DocumentNode) => {
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    );
    return [
      (options: unknown) =>
        mockMutate(
          operation?.kind === 'OperationDefinition'
            ? operation.name?.value
            : '',
          options,
        ),
      { loading: false },
    ];
  },
}));
const definition = (): WorkflowDefinition => ({
  name: 'SEO weekly evidence',
  service: 'SEO',
  description: 'Brand search delivery',
  definitionOfDone: 'Verify every submitted backlink.',
  checklist: [{ id: 'check', label: 'Inspect the backlinks', required: true }],
  evidence: [
    {
      id: 'proof',
      label: 'Verification URL',
      instructions: 'Link to the supporting page.',
      kind: 'LINK',
      required: true,
    },
  ],
  reviewChecks: [
    { id: 'quality', label: 'Confirm backlink quality', required: true },
  ],
});
const fixtures = () => {
  mockWorkspace = 'workspace';
  mockMember = 'editor';
  mockManager = true;
  mockReadError = undefined;
  mockPermissionError = undefined;
  mockLoading = false;
  mockCatalog = {
    workspaceId: 'workspace',
    memberId: 'editor',
    userWorkspaceId: 'membership',
    templates: [
      {
        id: 'template',
        revision: 2,
        archived: false,
        stateReason: '',
        current: {
          templateId: 'template',
          version: 2,
          definition: definition(),
          publishedAt: '2026-10-01T00:00:00Z',
          publishedByName: 'Amna',
          reason: 'Current standard',
        },
      },
    ],
    versions: [],
    starters: [{ key: 'SEO', definition: definition() }],
  };
  mockCatalog.versions = [mockCatalog.templates[0].current];
  mockSnapshot = {
    workspaceId: 'workspace',
    memberId: 'editor',
    userWorkspaceId: 'membership',
    taskId: 'task',
    taskRevision: 4,
    canManage: true,
    canEdit: true,
    locked: false,
    workflow: {
      templateId: 'template',
      version: 1,
      revision: 3,
      definition: definition(),
      checkedIds: [],
      evidence: [],
      appliedAt: '2026-10-01T00:00:00Z',
      appliedByName: 'Amna',
    },
    previousApplications: [],
    missingRequirements: ['Inspect the backlinks', 'Verification URL'],
    nextHistoryCursor: null,
  };
  mockTask = {
    id: 'task',
    title: 'Check client backlinks',
    assigneeId: 'editor',
    projectId: 'project',
    revision: 4,
    dueAt: null,
    details: {
      state: 'IN_PROGRESS',
      reviewerId: 'manager',
      brief: 'Preserve this custom note',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      blocker: '',
      checklist: [],
      evidence: ['https://example.com/deliverable'],
      submissions: [],
      events: [],
    },
  };
};
const Harness = ({ catalog }: { catalog: boolean }) => {
  const [, refresh] = useState(0);
  const workspace: DeliveryWorkspace = {
    actor: { memberId: mockMember, isManager: mockManager, isAdmin: false },
    projects: [],
    companies: [],
    tasks: [mockTask],
    members: [
      { id: 'editor', name: 'SEO specialist', access: 'MEMBER', roleLabel: '' },
      { id: 'manager', name: 'Amna', access: 'MANAGER', roleLabel: '' },
    ],
  };
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test state
      </button>
      {catalog ? (
        <DeliveryWorkflowCatalog />
      ) : (
        <DeliveryTaskDetail
          key={`${mockWorkspace}:${mockMember}`}
          task={mockTask}
          workspace={workspace}
          run={mockRun}
          busy={false}
          stateLabel={(state) => state}
          celebrateApproval={false}
          onChanged={mockChanged}
        />
      )}
    </>
  );
};
const setup = (catalog = true) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness catalog={catalog} />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other destination</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeAll(() => {
  global.Request = Request as typeof global.Request;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    value() {
      this.removeAttribute('open');
    },
  });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
beforeEach(() => {
  fixtures();
  jest.clearAllMocks();
  mockRefetch.mockImplementation(async () => ({
    data: {
      deliveryWorkflowCatalog: mockCatalog,
      deliveryTaskWorkflow: mockSnapshot,
    },
  }));
  mockRun.mockResolvedValue(true);
  mockChanged.mockResolvedValue(undefined);
});

it('keeps the explicitly pinned recurrence version when a newer workflow is published', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <form aria-label="Recurring work">
        <WorkflowPinField initial={{ templateId: 'template', version: 1 }} />
      </form>
    </I18nProvider>,
  );
  const field = screen.getByRole('combobox', {
    name: 'Service requirements for new occurrences',
  });
  expect(field).toHaveValue('template|1');
  const form = screen.getByRole('form', {
    name: 'Recurring work',
  }) as HTMLFormElement;
  expect(workflowPinFromForm(new FormData(form))).toEqual({
    templateId: 'template',
    version: 1,
  });
  await userEvent.selectOptions(field, 'template|2');
  expect(workflowPinFromForm(new FormData(form))).toEqual({
    templateId: 'template',
    version: 2,
  });
  await userEvent.selectOptions(field, '');
  expect(workflowPinFromForm(new FormData(form))).toBeNull();
});

it('retains a changed recurrence pin if its catalog later becomes unavailable', async () => {
  const view = render(
    <I18nProvider i18n={i18n}>
      <form aria-label="Recurring work">
        <WorkflowPinField initial={{ templateId: 'template', version: 1 }} />
      </form>
    </I18nProvider>,
  );
  await userEvent.selectOptions(screen.getByRole('combobox'), 'template|2');
  mockReadError = new Error('Offline');
  view.rerender(
    <I18nProvider i18n={i18n}>
      <form aria-label="Recurring work">
        <WorkflowPinField initial={{ templateId: 'template', version: 1 }} />
      </form>
    </I18nProvider>,
  );
  expect(screen.getByRole('combobox')).toBeDisabled();
  const form = screen.getByRole('form', {
    name: 'Recurring work',
  }) as HTMLFormElement;
  expect(workflowPinFromForm(new FormData(form))).toEqual({
    templateId: 'template',
    version: 2,
  });
});

it('keeps starter workflows unsaved until explicitly published and guards a new draft', async () => {
  mockCatalog.templates = [];
  mockCatalog.versions = [];
  const user = setup();
  expect(screen.getByText(/No workflows published yet/)).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
  await user.click(screen.getByText(/Start from a service example/));
  await user.click(screen.getByRole('button', { name: 'SEO weekly evidence' }));
  expect(screen.getByRole('textbox', { name: 'Workflow name' })).toHaveValue(
    'SEO weekly evidence',
  );
  expect(
    screen.getByRole('button', { name: 'Publish version' }),
  ).toBeDisabled();
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for publishing' }),
    'Approved weekly standard',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('textbox', { name: 'Reason for publishing' }),
  ).toHaveValue('Approved weekly standard');
});
it('keeps a stable new workflow id and draft after failure, then distinguishes a saved refresh failure', async () => {
  mockCatalog.templates = [];
  mockMutate.mockRejectedValueOnce(new Error('Workflow name already exists.'));
  const user = setup();
  await user.click(screen.getByText(/Start from a service example/));
  await user.click(screen.getByRole('button', { name: 'SEO weekly evidence' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for publishing' }),
    'Team standard',
  );
  await user.click(screen.getByRole('button', { name: 'Publish version' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Workflow name already exists.',
  );
  const first = mockMutate.mock.calls[0][1].variables.input;
  mockMutate.mockResolvedValue({ data: { saveDeliveryWorkflow: mockCatalog } });
  mockRefetch.mockRejectedValue(new Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Publish version' }));
  expect(mockMutate.mock.calls[1][1].variables.input).toEqual(first);
  expect(first).toMatchObject({
    revision: 0,
    reason: 'Team standard',
    definition: definition(),
  });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Saved, but the list could not refresh',
  );
  expect(
    screen.queryByRole('button', { name: 'Publish version' }),
  ).not.toBeInTheDocument();
});
it('requires an explicit reload when a published template changed behind an edit', async () => {
  const user = setup();
  await user.click(
    within(screen.getByRole('list', { name: 'Published workflows' })).getByRole(
      'button',
      { name: 'SEO weekly evidence' },
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Edit next version' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Workflow name' }),
    ' draft',
  );
  mockCatalog = {
    ...mockCatalog,
    templates: [
      {
        ...mockCatalog.templates[0],
        revision: 3,
        current: {
          ...mockCatalog.templates[0].current,
          version: 3,
          definition: { ...definition(), name: 'Changed standard' },
        },
      },
    ],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.getByRole('button', { name: 'Publish version' }),
  ).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Workflow name' })).toHaveValue(
    'SEO weekly evidence draft',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest workflow' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Workflow name' }),
  ).toHaveValue('Changed standard');
});
it('archives with a reason and captured revision without editing the published definition', async () => {
  mockMutate.mockResolvedValue({
    data: { archiveDeliveryWorkflow: mockCatalog },
  });
  const user = setup();
  await user.click(
    within(screen.getByRole('list', { name: 'Published workflows' })).getByRole(
      'button',
      { name: 'SEO weekly evidence' },
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Archive workflow' }));
  expect(
    screen.getByRole('button', { name: 'Confirm archive' }),
  ).toBeDisabled();
  await user.type(
    screen.getByRole('textbox', { name: 'Reason' }),
    'Retired process',
  );
  await user.click(screen.getByRole('button', { name: 'Confirm archive' }));
  expect(mockMutate).toHaveBeenCalledWith('ArchiveDeliveryWorkflow', {
    variables: {
      input: {
        id: 'template',
        revision: 2,
        archived: true,
        reason: 'Retired process',
      },
    },
  });
});
it('hides the catalog from staff and fails closed on scope or permission errors', async () => {
  mockManager = false;
  const user = setup();
  expect(
    screen.queryByRole('button', { name: 'SEO weekly evidence' }),
  ).not.toBeInTheDocument();
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryWorkflowCatalog',
    expect.objectContaining({ skip: true }),
  );
  mockManager = true;
  mockCatalog.workspaceId = 'other';
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.queryByRole('button', { name: 'New workflow' }),
  ).not.toBeInTheDocument();
  mockCatalog.workspaceId = 'workspace';
  mockPermissionError = new Error('Revoked');
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.queryByRole('button', { name: 'New workflow' }),
  ).not.toBeInTheDocument();
});
it('blocks submission until required answers are saved, and keeps internal proof out of deliverable links', async () => {
  mockManager = false;
  mockSnapshot.canManage = false;
  mockMutate.mockImplementation(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      taskRevision: 5,
      missingRequirements: [],
      workflow: {
        ...mockSnapshot.workflow!,
        revision: 4,
        checkedIds: ['check'],
        evidence: [
          { requirementId: 'proof', value: 'https://example.com/proof' },
        ],
      },
    };
    mockTask = { ...mockTask, revision: 5 };
    return { data: { saveDeliveryWorkflowProgress: mockSnapshot } };
  });
  const user = setup(false);
  await user.type(
    screen.getByRole('textbox', { name: 'What did you complete?' }),
    'Reviewed backlinks',
  );
  expect(
    screen.getByRole('button', { name: 'Submit to reviewer' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', { name: /Inspect the backlinks/ }),
  );
  await user.type(
    screen.getByRole('textbox', { name: /Verification URL/ }),
    'https://example.com/proof',
  );
  expect(
    screen.getByRole('button', { name: 'Submit to reviewer' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Save requirement progress' }),
  );
  expect(mockMutate).toHaveBeenCalledWith('SaveDeliveryWorkflowProgress', {
    variables: {
      input: {
        taskId: 'task',
        taskRevision: 4,
        workflowRevision: 3,
        checkedIds: ['check'],
        evidence: [
          { requirementId: 'proof', value: 'https://example.com/proof' },
        ],
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  await user.click(screen.getByRole('button', { name: 'Submit to reviewer' }));
  expect(mockRun).toHaveBeenCalledWith({
    action: 'submit',
    taskId: 'task',
    revision: 5,
    description: 'Reviewed backlinks',
    evidence: ['https://example.com/deliverable'],
  });
  expect(
    screen.queryByRole('button', { name: 'Change or reopen workflow' }),
  ).not.toBeInTheDocument();
});
it('keeps answers after a failed save and prevents reuse against a newer task revision', async () => {
  mockMutate.mockRejectedValue(
    new Error('Task changed. Reload the latest version.'),
  );
  const user = setup(false);
  await user.type(
    screen.getByRole('textbox', { name: /Verification URL/ }),
    'https://example.com/proof',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save requirement progress' }),
  );
  expect(screen.getByRole('textbox', { name: /Verification URL/ })).toHaveValue(
    'https://example.com/proof',
  );
  mockSnapshot = { ...mockSnapshot, taskRevision: 5 };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.getByRole('button', { name: 'Save requirement progress' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload current requirements' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByRole('textbox', { name: /Verification URL/ })).toHaveValue(
    '',
  );
});
it.each(['read', 'permission', 'loading'])(
  'hides task details on %s failure while preserving the draft for recovery',
  async (kind) => {
    const user = setup(false);
    await user.type(
      screen.getByRole('textbox', { name: /Verification URL/ }),
      'https://example.com/draft',
    );
    if (kind === 'read') mockReadError = new Error('Offline');
    if (kind === 'permission')
      mockPermissionError = new Error('Access check failed');
    if (kind === 'loading') mockLoading = true;
    await user.click(
      screen.getByRole('button', { name: 'Refresh test state' }),
    );
    expect(
      screen.queryByRole('textbox', { name: /Verification URL/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit to reviewer' }),
    ).toBeDisabled();
    mockReadError = undefined;
    mockPermissionError = undefined;
    mockLoading = false;
    await user.click(
      screen.getByRole('button', { name: 'Refresh test state' }),
    );
    expect(
      screen.getByRole('textbox', { name: /Verification URL/ }),
    ).toHaveValue('https://example.com/draft');
  },
);
it('uses the submitted workflow checks for independent approval', async () => {
  mockMember = 'manager';
  mockCatalog.memberId = 'manager';
  mockSnapshot.memberId = 'manager';
  mockSnapshot.canEdit = false;
  mockSnapshot.locked = true;
  mockTask.details.state = 'IN_REVIEW';
  mockTask.details.submissions = [
    {
      version: 1,
      description: 'Ready',
      evidence: [],
      submittedAt: '2026-10-01T00:00:00Z',
      submittedBy: 'editor',
      workflow: mockSnapshot.workflow!,
    },
  ];
  mockSnapshot.workflow = {
    ...mockSnapshot.workflow!,
    definition: {
      ...definition(),
      reviewChecks: [
        { id: 'other', label: 'Different later rule', required: true },
      ],
    },
  };
  const user = setup(false);
  expect(
    screen.getByRole('button', { name: 'Approve submission' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', { name: /Confirm backlink quality/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Approve submission' }));
  expect(mockRun).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'review',
      decision: 'APPROVED',
      workflowReview: { checkedIds: ['quality'] },
      revision: 4,
    }),
  );
});
it('requires an explicit reason and reopen choice to reset a locked workflow', async () => {
  mockSnapshot.canEdit = false;
  mockSnapshot.locked = true;
  mockSnapshot.workflow!.version = 2;
  mockTask.details.state = 'APPROVED';
  mockMutate.mockImplementation(async () => ({
    data: {
      applyDeliveryWorkflow: {
        ...mockSnapshot,
        taskRevision: 5,
        locked: false,
        canEdit: true,
      },
    },
  }));
  const user = setup(false);
  await user.click(
    screen.getByRole('button', { name: 'Change or reopen workflow' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Published workflow' }),
    'template',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
    'Client requested a fresh review',
  );
  expect(
    screen.getByRole('button', { name: 'Reopen and apply workflow' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /Reopen production/ }));
  await user.click(
    screen.getByRole('button', { name: 'Reopen and apply workflow' }),
  );
  expect(mockMutate).toHaveBeenCalledWith('ApplyDeliveryWorkflow', {
    variables: {
      input: {
        taskId: 'task',
        taskRevision: 4,
        templateId: 'template',
        templateRevision: 2,
        version: 2,
        reopen: true,
        reason: 'Client requested a fresh review',
      },
    },
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Reopen and apply workflow' }),
  ).not.toBeInTheDocument();
});
it('retains an application preview and blocks it when the template changes', async () => {
  const user = setup(false);
  await user.click(
    screen.getByRole('button', { name: 'Change or reopen workflow' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Published workflow' }),
    'template',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
    'Updated evidence standard',
  );
  mockCatalog = {
    ...mockCatalog,
    templates: [{ ...mockCatalog.templates[0], revision: 3 }],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(screen.getByRole('button', { name: 'Apply workflow' })).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
  ).toHaveValue('Updated evidence standard');
  await user.click(
    screen.getByRole('button', { name: 'Cancel workflow selection' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
  ).toHaveValue('Updated evidence standard');
});
it('pages previous applications independently and does not count them as current answers', async () => {
  mockSnapshot.previousApplications = [
    { ...mockSnapshot.workflow!, revision: 1, checkedIds: ['check'] },
  ];
  mockSnapshot.nextHistoryCursor = 'older';
  const user = setup(false);
  await user.click(screen.getByText('Previous workflow applications'));
  await user.click(screen.getByRole('button', { name: 'Older applications' }));
  expect(
    mockQueries.mock.calls
      .filter(([operation]) => operation === 'DeliveryTaskWorkflow')
      .at(-1),
  ).toEqual([
    'DeliveryTaskWorkflow',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: { taskId: 'task', historyCursor: 'older' },
      }),
    }),
  ]);
  expect(
    screen.getByRole('checkbox', { name: /Inspect the backlinks/ }),
  ).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Latest applications' }));
  expect(
    mockQueries.mock.calls
      .filter(([operation]) => operation === 'DeliveryTaskWorkflow')
      .at(-1),
  ).toEqual([
    'DeliveryTaskWorkflow',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: { taskId: 'task', historyCursor: null },
      }),
    }),
  ]);
});

it('keeps locked requirements readable and explains unavailable reopening without offering the action', () => {
  mockSnapshot.canEdit = false;
  mockSnapshot.canManage = false;
  mockSnapshot.locked = true;
  mockTask.details.state = 'APPROVED';
  setup(false);
  expect(screen.getByText(/Saved requirements are visible/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Change or reopen workflow' }),
  ).not.toBeInTheDocument();
});
it('retains an open workflow selection but disables its action after current management eligibility is lost', async () => {
  const user = setup(false);
  await user.click(
    screen.getByRole('button', { name: 'Change or reopen workflow' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Published workflow' }),
    'template',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
    'Updated evidence standard',
  );
  mockSnapshot = { ...mockSnapshot, canManage: false };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(screen.getByRole('button', { name: 'Apply workflow' })).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
  ).toHaveValue('Updated evidence standard');
  expect(
    screen.getByText(
      /Your current access does not allow changing these requirements/,
    ),
  ).toBeVisible();
});

it('offers first-page recovery from a policy-bound history conflict while protecting unsaved answers', async () => {
  mockSnapshot.previousApplications = [
    { ...mockSnapshot.workflow!, revision: 1 },
  ];
  mockSnapshot.nextHistoryCursor = 'older-policy';
  const user = setup(false);
  await user.click(screen.getByText('Previous workflow applications'));
  await user.click(screen.getByRole('button', { name: 'Older applications' }));
  await user.type(
    screen.getByRole('textbox', { name: /Verification URL/ }),
    'https://example.com/unsent',
  );
  mockReadError = new CombinedGraphQLErrors({
    errors: [{ message: 'Policy changed', extensions: { code: 'CONFLICT' } }],
  });
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  await user.click(
    screen.getByRole('button', { name: 'Check latest requirements' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('button', { name: 'Check latest requirements' }),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Check latest requirements' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryTaskWorkflow',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: { taskId: 'task', historyCursor: null },
      }),
    }),
  );
});

it('disposes an open workflow selection only after confirming first-page recovery', async () => {
  mockSnapshot.previousApplications = [
    { ...mockSnapshot.workflow!, revision: 1 },
  ];
  mockSnapshot.nextHistoryCursor = 'older-policy';
  const user = setup(false);
  await user.click(screen.getByText('Previous workflow applications'));
  await user.click(screen.getByRole('button', { name: 'Older applications' }));
  await user.click(
    screen.getByRole('button', { name: 'Change or reopen workflow' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Published workflow' }),
    'template',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for applying this version' }),
    'Unsent workflow change',
  );
  mockReadError = new CombinedGraphQLErrors({
    errors: [{ message: 'Policy changed', extensions: { code: 'CONFLICT' } }],
  });
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  await user.click(
    screen.getByRole('button', { name: 'Check latest requirements' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Reason for applying this version')).toHaveValue(
    'Unsent workflow change',
  );
  await user.click(
    screen.getByRole('button', { name: 'Check latest requirements' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    screen.queryByLabelText('Reason for applying this version'),
  ).not.toBeInTheDocument();
  mockReadError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.getByRole('button', { name: 'Change or reopen workflow' }),
  ).toBeVisible();
});
