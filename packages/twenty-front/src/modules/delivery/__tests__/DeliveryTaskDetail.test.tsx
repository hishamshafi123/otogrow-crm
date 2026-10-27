import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const renderDetail = (taskOverride = task, workspaceOverride = workspace) => {
  const run = jest.fn().mockResolvedValue(true);
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskDetail
        task={taskOverride}
        workspace={workspaceOverride}
        run={run}
        busy={false}
        stateLabel={(state) => state}
        celebrateApproval={false}
      />
    </I18nProvider>,
  );
  return run;
};

describe('delivery task review', () => {
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
    expect(screen.getByText('Fix the logo')).toBeInTheDocument();
    expect(screen.getByText('First cut')).toBeInTheDocument();
    expect(screen.getByText('Logo fixed')).toBeInTheDocument();
  });
});
