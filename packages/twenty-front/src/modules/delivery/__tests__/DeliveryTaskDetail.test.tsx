import { i18n } from '@lingui/core';
import { useCallback, useState, type useLayoutEffect } from 'react';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { Request } from 'cross-fetch';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type TaskReviewController } from '@/delivery/reviews/useTaskReview';
import { claimTaskApprovalCelebration } from '@/delivery/tasks/task-approval-celebration';
let mockReviewAllowed = true;
let mockReviewVersion = 1;
let mockAssignmentRevision = 0;
let mockReviewReadError = false;
const mockReviewRefresh = jest.fn();
jest.mock('@/delivery/reviews/useTaskReview', () => ({
  useTaskReview: () => ({
    data: mockReviewReadError
      ? null
      : {
          observedAt: '2026-10-29T09:00:00Z',
          canReviewSubmission: mockReviewAllowed,
          canApprove: mockReviewAllowed,
          pending: { submissionVersion: mockReviewVersion },
          assignment: { revision: mockAssignmentRevision },
        },
    refresh: mockReviewRefresh,
  }),
}));
jest.mock('@/delivery/reviews/DeliveryTaskReview', () => ({
  DeliveryTaskReview: ({ controller }: { controller: TaskReviewController }) =>
    controller.data ? null : (
      <button onClick={() => void controller.refresh()}>
        Retry submission review access
      </button>
    ),
}));
jest.mock('@/delivery/creative/review/DeliveryCreativeReview', () => ({
  DeliveryCreativeReview: ({
    onFinalReviewReady,
  }: {
    onFinalReviewReady?: (ready: boolean) => void;
  }) => {
    jest
      .requireActual<{ useLayoutEffect: typeof useLayoutEffect }>('react')
      .useLayoutEffect(() => onFinalReviewReady?.(true), [onFinalReviewReady]);
    return <p>Exact creative review</p>;
  },
}));
jest.mock('@/delivery/revisions/DeliveryRevisions', () => ({
  DeliveryRevisions: () => null,
}));
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

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
  title: 'Product launch video',
  assigneeId: 'editor',
  dueAt: null,
  projectId: 'project',
  revision: 2,
  details: {
    brief: 'Accurate logo; calm music',
    service: 'Video',
    priority: 'HIGH',
    scheduledDate: null,
    reviewerId: 'reviewer',
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: ['https://example.com/v1'],
    events: [],
    submissions: [
      {
        version: 1,
        description: 'First cut',
        evidence: ['https://example.com/v1'],
        submittedBy: 'editor',
        submittedAt: '2026-10-24T00:00:00Z',
      },
    ],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'reviewer', isAdmin: true, isManager: true },
  tasks: [task],
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand launch',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  companies: [],
  members: [
    { id: 'reviewer', name: 'Project manager', access: 'ADMIN', roleLabel: '' },
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
  ],
};
const renderDetail = (
  taskOverride = task,
  workspaceOverride = workspace,
  search = '',
) => {
  mockReviewVersion = taskOverride.details.submissions.at(-1)?.version ?? 1;
  const run = jest.fn().mockResolvedValue(true);
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/delivery${search}`]}>
        <DeliveryTaskDetail
          task={taskOverride}
          workspace={workspaceOverride}
          run={run}
          busy={false}
          stateLabel={(state) => state}
          celebrateApproval={false}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  return run;
};

describe('delivery task review', () => {
  beforeEach(() => {
    mockReviewAllowed = true;
    mockReviewVersion = 1;
    mockAssignmentRevision = 0;
    mockReviewReadError = false;
    mockReviewRefresh.mockReset().mockResolvedValue(true);
  });
  it('celebrates an explicitly opened own approved version once after dismiss/reopen, with a fresh claim for another version or identity', async () => {
    localStorage.clear();
    const Harness = ({
      memberId,
      version,
    }: {
      memberId: string;
      version: number;
    }) => {
      const [open, setOpen] = useState(false);
      const [celebrate, setCelebrate] = useState(false);
      const shown = useCallback(() => setCelebrate(false), []);
      const approvedTask: DeliveryTask = {
        ...task,
        assigneeId: memberId,
        details: {
          ...task.details,
          state: 'APPROVED',
          reviewerId: 'independent-reviewer',
          submissions: [
            {
              ...task.details.submissions[0],
              version,
              decision: 'APPROVED',
              reviewedBy: 'independent-reviewer',
            },
          ],
        },
      };
      const currentWorkspace: DeliveryWorkspace = {
        ...workspace,
        actor: { memberId, isManager: false, isAdmin: false },
        members: [
          ...workspace.members,
          { id: memberId, name: 'Producer', access: 'MEMBER', roleLabel: '' },
        ],
      };
      return (
        <>
          <button
            onClick={() => {
              setCelebrate(
                claimTaskApprovalCelebration({
                  memberId,
                  taskId: task.id,
                  assigneeId: memberId,
                  state: 'APPROVED',
                  submissionVersion: version,
                }),
              );
              setOpen(true);
            }}
          >
            Open approved task
          </button>
          {open && (
            <>
              <DeliveryTaskDetail
                task={approvedTask}
                workspace={currentWorkspace}
                run={async () => true}
                busy={false}
                stateLabel={(state) => state}
                celebrateApproval={celebrate}
                onCelebrationShown={shown}
              />
              <button onClick={() => setOpen(false)}>
                Close approved task
              </button>
            </>
          )}
        </>
      );
    };
    const content = (memberId: string, version: number) => (
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <Harness memberId={memberId} version={version} />
        </MemoryRouter>
      </I18nProvider>
    );
    const view = render(content('producer-a', 1));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Open approved task' }),
    );
    expect(screen.getByText('Great work — approved!')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.click(
      screen.getByRole('button', { name: 'Close approved task' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Open approved task' }),
    );
    expect(
      screen.queryByText('Great work — approved!'),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Close approved task' }),
    );
    view.rerender(content('producer-a', 2));
    await user.click(
      screen.getByRole('button', { name: 'Open approved task' }),
    );
    expect(screen.getByText('Great work — approved!')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Close approved task' }),
    );
    view.rerender(content('producer-b', 2));
    await user.click(
      screen.getByRole('button', { name: 'Open approved task' }),
    );
    expect(screen.getByText('Great work — approved!')).toBeVisible();
  });
  it('identifies the canonical delivery manager without claiming an undecided submission was reviewed', () => {
    renderDetail();
    expect(
      screen.getByText('Primary manager for client delivery'),
    ).toBeVisible();
    expect(
      screen.getByText('Project manager', { selector: 'dd' }),
    ).toBeVisible();
    expect(screen.queryByText(/Reviewed by/)).not.toBeInTheDocument();
  });
  it.each([
    ['recorded-reviewer', 'Previous reviewer'],
    [undefined, 'Recorded reviewer unavailable'],
  ] as const)(
    'attributes a recorded decision to its exact stored reviewer %s',
    (reviewedBy, expected) => {
      renderDetail(
        {
          ...task,
          details: {
            ...task.details,
            state: 'APPROVED',
            submissions: [
              {
                ...task.details.submissions[0],
                decision: 'APPROVED',
                reviewedBy,
              },
            ],
          },
        },
        {
          ...workspace,
          members: [
            ...workspace.members,
            {
              id: 'recorded-reviewer',
              name: 'Previous reviewer',
              access: 'MEMBER',
              roleLabel: '',
            },
          ],
        },
      );
      expect(
        within(
          screen.getByRole('region', { name: 'Submission history' }),
        ).getByText(/Reviewed by/),
      ).toHaveTextContent(`Reviewed by ${expected}`);
    },
  );
  it('hides cached submitted descriptions and evidence on review source failure while retaining separate feedback for verified recovery', async () => {
    const run = jest.fn().mockResolvedValue(true);
    const content = () => (
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <DeliveryTaskDetail
            task={task}
            workspace={workspace}
            run={run}
            busy={false}
            stateLabel={(state) => state}
            celebrateApproval={false}
          />
        </MemoryRouter>
      </I18nProvider>
    );
    const view = render(content());
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Feedback'),
      'Retain this unfinished review',
    );
    mockReviewReadError = true;
    view.rerender(content());
    expect(
      screen.queryByRole('region', { name: 'Exact submitted work' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Submission history' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('First cut')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'https://example.com/v1' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Retry submission review access' }),
    );
    expect(mockReviewRefresh).toHaveBeenCalledTimes(1);
    mockReviewReadError = false;
    await act(async () => view.rerender(content()));
    expect(screen.getByLabelText('Feedback')).toHaveValue(
      'Retain this unfinished review',
    );
    expect(
      screen.getByRole('region', { name: 'Exact submitted work' }),
    ).toHaveTextContent('First cut');
    expect(run).not.toHaveBeenCalled();
  });
  const creativeTask = (): DeliveryTask => ({
    ...task,
    details: {
      ...task.details,
      submissions: [
        {
          ...task.details.submissions[0],
          creativeVersion: 1,
          finalAssetId: 'd3829431-a1bb-4355-8000-e2c937e86eac',
        },
      ],
      creative: {
        version: 1,
        productionVersion: 1,
        assemblyVersion: 1,
        briefVersion: 1,
        approvedBriefVersion: 1,
        briefHistory: [],
        references: [],
        shots: [],
        finalAssetId: 'd3829431-a1bb-4355-8000-e2c937e86eac',
        variants: [],
        assembly: { assetIds: [], overlayText: '', audioId: null, notes: '' },
        revisionCharge: 0,
        brief: {
          outputKind: 'IMAGE',
          objective: 'ADS',
          audience: '',
          painPoint: '',
          angle: '',
          concept: 'Product ad',
          productFacts: '',
          mandatoryClaims: '',
          visualDirection: '',
          format: '1:1',
          duration: 0,
          hook: '',
          cta: '',
          music: '',
          brandAssets: [],
        },
        assets: [
          {
            id: 'd3829431-a1bb-4355-8000-e2c937e86eac',
            name: 'Final image.png',
            mimeType: 'image/png',
            size: 4,
            createdAt: '2026-10-29T00:00:00Z',
            uploadedBy: 'editor',
            briefVersion: 1,
            productionVersion: 1,
            assemblyVersion: 1,
            shotId: null,
            shotVersion: null,
            kind: 'FINAL',
            parentAssetId: null,
            reviews: [],
            storageState: 'READY',
          },
        ],
      },
    },
  });
  it('puts an unsubmitted creative brief before optional tools without an empty submitted-media review', () => {
    const candidate = creativeTask();
    renderDetail({
      ...candidate,
      details: { ...candidate.details, state: 'PLANNED', submissions: [] },
    });
    expect(screen.getByText('Accurate logo; calm music')).toBeVisible();
    expect(screen.queryByText('Exact creative review')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Brief and notes').closest('details'),
    ).toHaveAttribute('open');
    expect(
      screen
        .getByText('Capacity planning', { selector: 'summary' })
        .closest('details'),
    ).not.toHaveAttribute('open');
  });
  it('retains explicit creative review recovery when the selected submission is missing', () => {
    const candidate = creativeTask();
    renderDetail(
      {
        ...candidate,
        details: { ...candidate.details, state: 'PLANNED', submissions: [] },
      },
      workspace,
      '?creativeSubmission=9',
    );
    expect(screen.getByText('Exact creative review')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Review latest submission' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
  });
  it('keeps exact submitted creative work prominent while the production brief remains available on demand', async () => {
    renderDetail(creativeTask());
    expect(screen.getByText('Exact creative review')).toBeVisible();
    expect(screen.getByText('Accurate logo; calm music')).not.toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByText('Brief and notes'));
    expect(screen.getByText('Accurate logo; calm music')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Approve submission' }),
    ).toBeVisible();
  });
  it('preserves a capacity draft when its disclosure is closed and reopened', async () => {
    const run = renderDetail({
      ...task,
      details: { ...task.details, state: 'PLANNED', submissions: [] },
    });
    const user = userEvent.setup();
    const disclosure = screen.getByText('Capacity planning', {
      selector: 'summary',
    });
    await user.click(disclosure);
    await user.click(
      screen.getByRole('button', { name: 'Plan remaining effort' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Remaining production minutes' }),
      '45',
    );
    await user.click(disclosure);
    expect(
      screen.getByLabelText('Remaining production minutes'),
    ).not.toBeVisible();
    await user.click(disclosure);
    expect(
      screen.getByRole('spinbutton', { name: 'Remaining production minutes' }),
    ).toHaveValue(45);
    expect(run).not.toHaveBeenCalled();
  });
  it('requires feedback before requesting changes and submits the current revision', async () => {
    const run = renderDetail();
    const user = userEvent.setup();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'Feedback' }),
      'Fix the logo',
    );
    await user.click(screen.getByRole('button', { name: 'Request changes' }));
    expect(run).toHaveBeenCalledWith({
      action: 'review',
      taskId: 'task',
      revision: 2,
      decision: 'CHANGES_REQUESTED',
      selectedSubmissionVersion: 1,
      reviewAssignmentRevision: 0,
      feedback: 'Fix the logo',
    });
  });
  it('keeps approval unavailable to the assignee even with manager access', () => {
    renderDetail(
      { ...task, details: { ...task.details, reviewerId: 'editor' } },
      {
        ...workspace,
        actor: { memberId: 'editor', isAdmin: true, isManager: true },
      },
    );
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
  });
  it('lets an employee resubmit with evidence after changes are requested', async () => {
    const run = renderDetail(
      { ...task, details: { ...task.details, state: 'CHANGES_REQUESTED' } },
      {
        ...workspace,
        actor: { memberId: 'editor', isAdmin: false, isManager: false },
      },
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'What did you complete?' }),
      'Logo fixed',
    );
    await user.clear(
      screen.getByRole('textbox', { name: /Deliverable links/ }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Deliverable links/ }),
      'https://example.com/v2',
    );
    await user.click(
      screen.getByRole('button', { name: 'Submit to reviewer' }),
    );
    expect(run).toHaveBeenCalledWith({
      action: 'submit',
      taskId: 'task',
      revision: 2,
      description: 'Logo fixed',
      evidence: ['https://example.com/v2'],
    });
  });
  it('retains earlier versions and reviewer feedback', () => {
    renderDetail({
      ...task,
      details: {
        ...task.details,
        submissions: [
          {
            ...task.details.submissions[0],
            decision: 'CHANGES_REQUESTED',
            feedback: 'Fix the logo',
          },
          {
            ...task.details.submissions[0],
            version: 2,
            description: 'Logo fixed',
            evidence: ['https://example.com/v2'],
          },
        ],
      },
    });
    const history = within(
      screen.getByRole('region', { name: 'Submission history' }),
    );
    expect(history.getByText('Fix the logo')).toBeInTheDocument();
    expect(history.getByText('First cut')).toBeInTheDocument();
    expect(history.getByText('Logo fixed')).toBeInTheDocument();
  });
  it('names the exact latest creative submission and frozen asset in an independent approval', async () => {
    const run = renderDetail(creativeTask());
    await userEvent.click(
      screen.getByRole('button', { name: 'Approve submission' }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'review',
        decision: 'APPROVED',
        selectedSubmissionVersion: 1,
        creativeVersion: 1,
        finalAssetId: 'd3829431-a1bb-4355-8000-e2c937e86eac',
      }),
    );
  });
  it('keeps historical versions reviewable without showing current decision controls', () => {
    const current = creativeTask();
    current.details.submissions.push({
      ...current.details.submissions[0],
      version: 2,
    });
    renderDetail(current, workspace, '?creativeSubmission=1');
    expect(screen.getByText('Exact creative review')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request changes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review latest submission' }),
    ).toBeInTheDocument();
  });
  it('lets a reviewer request a replacement for legacy media without approving an inferred current asset', async () => {
    const legacy = creativeTask();
    legacy.details.submissions = [{ ...task.details.submissions[0] }];
    const run = renderDetail(legacy);
    expect(
      screen.getByRole('button', { name: 'Approve submission' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Feedback' }),
      'Submit the exact asset for review',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Request changes' }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedSubmissionVersion: 1,
        decision: 'CHANGES_REQUESTED',
      }),
    );
    expect(run.mock.calls[0][0]).not.toHaveProperty('finalAssetId');
  });
  it('keeps general feedback and review checks while navigation is blocked or kept, then clears them after confirmed discard', async () => {
    Object.assign(globalThis, { Request });
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    const current = creativeTask();
    current.details.submissions.push({
      ...current.details.submissions[0],
      version: 2,
      workflow: {
        templateId: 'template',
        version: 1,
        revision: 1,
        checkedIds: [],
        evidence: [],
        appliedAt: '2026-10-29T00:00:00Z',
        appliedByName: 'Amna',
        definition: {
          name: 'Final quality',
          description: '',
          service: 'CREATIVE',
          definitionOfDone: 'Review the exact file',
          checklist: [],
          evidence: [],
          reviewChecks: [
            { id: 'label', label: 'Confirm product label', required: true },
          ],
        },
      },
    });
    const run = jest.fn();
    mockReviewVersion = 2;
    const router = createMemoryRouter(
      [
        {
          path: '/delivery',
          element: (
            <I18nProvider i18n={i18n}>
              <DeliveryDraftGuardProvider>
                <DeliveryTaskDetail
                  task={current}
                  workspace={workspace}
                  run={run}
                  busy={false}
                  stateLabel={(state) => state}
                  celebrateApproval={false}
                />
                <Link to="/delivery?task=task&creativeSubmission=1">
                  Select earlier review
                </Link>
                <Link to="/delivery?task=task&creativeSubmission=2">
                  Return to latest review
                </Link>
              </DeliveryDraftGuardProvider>
            </I18nProvider>
          ),
        },
      ],
      { initialEntries: ['/delivery?task=task&creativeSubmission=2'] },
    );
    render(<RouterProvider router={router} />);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Feedback' }),
      'Keep this general review draft',
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Confirm product label/ }),
    );
    await userEvent.click(
      screen.getByRole('link', { name: 'Select earlier review' }),
    );
    expect(router.state.location.search).toContain('creativeSubmission=2');
    expect(screen.getByRole('textbox', { name: 'Feedback' })).toHaveValue(
      'Keep this general review draft',
    );
    expect(
      screen.getByRole('checkbox', { name: /Confirm product label/ }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: 'Feedback' })).toHaveValue(
      'Keep this general review draft',
    );
    expect(
      screen.getByRole('checkbox', { name: /Confirm product label/ }),
    ).toBeChecked();
    await userEvent.click(
      screen.getByRole('link', { name: 'Select earlier review' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain('creativeSubmission=1'),
    );
    await userEvent.click(
      screen.getByRole('link', { name: 'Return to latest review' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Feedback' })).toHaveValue('');
    expect(
      screen.getByRole('checkbox', { name: /Confirm product label/ }),
    ).not.toBeChecked();
    expect(run).not.toHaveBeenCalled();
  });
  it('accepts current scoped review authority without global production management and pins its assignment revision', async () => {
    mockAssignmentRevision = 2;
    const scoped = {
      ...workspace,
      actor: { memberId: 'backup-reviewer', isManager: false, isAdmin: false },
    };
    const run = renderDetail(task, scoped);
    await userEvent.click(
      screen.getByRole('button', { name: 'Approve submission' }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'APPROVED',
        selectedSubmissionVersion: 1,
        reviewAssignmentRevision: 2,
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Edit assignment' }),
    ).not.toBeInTheDocument();
  });
  it('hides final decisions for an older noncreative submission even when the current reviewer has authority', () => {
    const current = {
      ...task,
      details: {
        ...task.details,
        submissions: [
          ...task.details.submissions,
          { ...task.details.submissions[0], version: 2 },
        ],
      },
    };
    renderDetail(current, workspace, '?creativeSubmission=1');
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request changes' }),
    ).not.toBeInTheDocument();
  });
  it('uses verified server review authority rather than manager status alone', () => {
    mockReviewAllowed = false;
    renderDetail();
    expect(
      screen.queryByRole('button', { name: 'Approve submission' }),
    ).not.toBeInTheDocument();
  });
  it.each([null, 'not-a-date'])(
    'shows an unknown submitted time for %s without inventing a 1970 date',
    (submittedAt) => {
      const unknown = {
        ...task,
        details: {
          ...task.details,
          submissions: [{ ...task.details.submissions[0], submittedAt }],
        },
      };
      renderDetail(unknown);
      expect(
        screen.getByRole('region', { name: 'Exact submitted work' }),
      ).toHaveTextContent('Submitted time unknown');
      expect(
        screen.getByRole('region', { name: 'Submission history' }),
      ).toHaveTextContent('Submitted time unknown');
      expect(screen.queryByText(/1970|Invalid Date/)).not.toBeInTheDocument();
    },
  );
  it('labels a recorded future submission time as unverified against the server observation', () => {
    const future = {
      ...task,
      details: {
        ...task.details,
        submissions: [
          {
            ...task.details.submissions[0],
            submittedAt: '2099-01-01T00:00:00Z',
          },
        ],
      },
    };
    renderDetail(future);
    expect(
      screen.getByRole('region', { name: 'Exact submitted work' }),
    ).toHaveTextContent('Recorded future submitted time');
    expect(
      screen.getByRole('region', { name: 'Exact submitted work' }),
    ).toHaveTextContent('Waiting time unverified');
  });
});
