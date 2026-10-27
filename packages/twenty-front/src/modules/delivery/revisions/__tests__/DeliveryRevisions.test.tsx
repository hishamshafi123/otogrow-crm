import { type ReactNode } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { RevisionEditor } from '@/delivery/revisions/RevisionEditor';
import { DeliveryRevisions } from '@/delivery/revisions/DeliveryRevisions';
import { DeliveryRevisionCosts } from '@/delivery/revisions/DeliveryRevisionCosts';
import { GET_REVISION_COSTS } from '@/delivery/revisions/delivery-revisions.graphql';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  type DeliveryRevisionsQuery,
  type DeliveryRevisionCostsQuery,
} from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
}));
type RevisionData = DeliveryRevisionsQuery['deliveryRevisions'];
const round: RevisionData['rounds'][number] = {
  id: 'round',
  round: 1,
  revision: 2,
  source: 'INTERNAL_REVIEW',
  cause: 'UNCLASSIFIED',
  reason: 'Correct the logo',
  createdAt: '2026-10-27T00:00:00Z',
  submissionVersion: 1,
  effortMinutes: null,
  internalCost: null,
  proposedCharge: 0,
  currency: null,
};
let history: RevisionData;
let costs: DeliveryRevisionCostsQuery['deliveryRevisionCosts'];
let queryError: Error | undefined;
let finance = true;
let verified = true;
const refetch = jest.fn();
const mutate = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: verified,
    scope: 'identity',
    access: { capabilities: finance ? ['finance.read'] : [] },
    matches: () => verified,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: unknown) => ({
    data:
      document === GET_REVISION_COSTS
        ? { deliveryRevisionCosts: costs }
        : { deliveryRevisions: history },
    error: queryError,
    refetch,
  }),
  useMutation: () => [mutate],
}));
const task: DeliveryTask = {
  id: 'task',
  title: 'Video',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 3,
  details: {
    brief: 'Accurate logo',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state: 'CHANGES_REQUESTED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  projects: [
    {
      id: 'project',
      name: 'Brand',
      revision: 1,
      companyId: null,
      memberIds: [],
    },
  ],
  members: [],
  tasks: [task],
  companies: [],
};
const wrapper = (content: ReactNode) => (
  <I18nProvider i18n={i18n}>
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '/',
          element: (
            <DeliveryDraftGuardProvider>{content}</DeliveryDraftGuardProvider>
          ),
        },
      ])}
    />
  </I18nProvider>
);
const show = (content: ReactNode) => render(wrapper(content));
beforeEach(() => {
  finance = true;
  verified = true;
  queryError = undefined;
  refetch.mockReset();
  mutate.mockReset();
  history = {
    workspaceId: 'workspace',
    memberId: 'manager',
    userWorkspaceId: 'membership',
    taskId: 'task',
    canManage: true,
    canReadFinance: true,
    canManageFinance: true,
    total: 1,
    nextBeforeRound: null,
    rounds: [{ ...round }],
  };
  const today = new Date().toISOString().slice(0, 10);
  costs = {
    workspaceId: 'workspace',
    memberId: 'manager',
    userWorkspaceId: 'membership',
    startDate: today.slice(0, 8) + '01',
    endDate: today,
    projectId: null,
    groups: [
      {
        projectId: 'project',
        projectName: 'Brand',
        cause: 'INTERNAL_DEFECT',
        currency: 'USD',
        rounds: 2,
        missingCostCount: 1,
        missingEffortCount: 1,
        recordedCost: 1250,
        proposedCharges: 0,
        recordedEffortMinutes: 30,
      },
    ],
  };
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
it('records explicit zero effort and default zero charge without inventing a cost', async () => {
  const save = jest.fn().mockResolvedValue(true),
    close = jest.fn();
  show(
    <RevisionEditor
      taskId="task"
      initial={round}
      latest={round}
      canManage
      canManageFinance
      onSave={save}
      onClose={close}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Reason category'),
    'INTERNAL_DEFECT',
  );
  await userEvent.type(
    screen.getByLabelText('Recorded revision effort (minutes)'),
    '0',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save revision details' }),
  );
  expect(save).toHaveBeenCalledWith({
    taskId: 'task',
    id: 'round',
    revision: 2,
    cause: 'INTERNAL_DEFECT',
    effortMinutes: 0,
    internalCost: null,
    proposedCharge: 0,
    currency: null,
  });
  expect(close).toHaveBeenCalled();
});
it('requires currency, converts decimals to minor units and preserves a failed draft', async () => {
  const save = jest.fn().mockResolvedValue(false);
  show(
    <RevisionEditor
      taskId="task"
      initial={round}
      latest={round}
      canManage
      canManageFinance
      onSave={save}
      onClose={jest.fn()}
    />,
  );
  await userEvent.type(
    screen.getByLabelText('Recorded internal cost'),
    '12.50',
  );
  expect(
    screen.getByRole('button', { name: 'Save revision details' }),
  ).toBeDisabled();
  await userEvent.selectOptions(screen.getByLabelText('Currency'), 'USD');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save revision details' }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        internalCost: 1250,
        proposedCharge: 0,
        currency: 'USD',
      }),
    ),
  );
  expect(screen.getByLabelText('Recorded internal cost')).toHaveValue(12.5);
  expect(screen.getByText(/Your draft is preserved/)).toBeVisible();
});
it('keeps and explicitly discards a conflicting draft before reloading the latest version', async () => {
  show(
    <RevisionEditor
      taskId="task"
      initial={round}
      latest={{
        ...round,
        revision: 3,
        cause: 'SCOPE_CHANGE',
        effortMinutes: 50,
      }}
      canManage
      canManageFinance={false}
      onSave={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  await userEvent.type(
    screen.getByLabelText('Recorded revision effort (minutes)'),
    '15',
  );
  expect(
    screen.getByRole('button', { name: 'Save revision details' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest round' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByLabelText('Recorded revision effort (minutes)'),
  ).toHaveValue(15);
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest round' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    screen.getByLabelText('Recorded revision effort (minutes)'),
  ).toHaveValue(50);
  expect(screen.getByLabelText('Reason category')).toHaveValue('SCOPE_CHANGE');
  expect(
    screen.getByRole('button', { name: 'Save revision details' }),
  ).toBeEnabled();
});
it('lets delivery managers classify work without exposing or submitting financial fields', async () => {
  const save = jest.fn().mockResolvedValue(true);
  show(
    <RevisionEditor
      taskId="task"
      initial={round}
      latest={round}
      canManage
      canManageFinance={false}
      onSave={save}
      onClose={jest.fn()}
    />,
  );
  expect(
    screen.queryByLabelText('Recorded internal cost'),
  ).not.toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText('Reason category'),
    'CLIENT_PREFERENCE',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save revision details' }),
  );
  expect(save).toHaveBeenCalledWith({
    taskId: 'task',
    id: 'round',
    revision: 2,
    cause: 'CLIENT_PREFERENCE',
    effortMinutes: null,
  });
});
it('lets finance staff edit money without changing classification', () => {
  show(
    <RevisionEditor
      taskId="task"
      initial={round}
      latest={round}
      canManage={false}
      canManageFinance
      onSave={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  expect(screen.getByLabelText('Reason category')).toBeDisabled();
  expect(
    screen.getByLabelText('Recorded revision effort (minutes)'),
  ).toBeDisabled();
  expect(screen.getByLabelText('Recorded internal cost')).toBeEnabled();
});
it('shows source, original reason and unknown cost separately from a zero charge', () => {
  show(<DeliveryRevisions task={task} />);
  expect(screen.getByText('Correct the logo')).toBeVisible();
  expect(screen.getByText('Internal review · Submission 1')).toBeVisible();
  expect(
    screen.getByText(
      'Recorded cost: Not recorded · Proposed charge: 0 (no charge)',
    ),
  ).toBeVisible();
});
it('hides finance and editing for an ordinary assigned editor', () => {
  history = {
    ...history,
    canManage: false,
    canReadFinance: false,
    canManageFinance: false,
  };
  show(<DeliveryRevisions task={task} />);
  expect(screen.queryByText(/Recorded cost:/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit round 1' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Correct the logo')).toBeVisible();
});
it('hides unverified and failed history responses and offers recovery', () => {
  queryError = new Error('Connection lost');
  show(<DeliveryRevisions task={task} />);
  expect(screen.queryByText('Correct the logo')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry revision history' }),
  ).toBeVisible();
});
it('resets the edit form when opening a different round', async () => {
  history.rounds.push({ ...round, id: 'second', round: 2, effortMinutes: 40 });
  show(<DeliveryRevisions task={task} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit round 1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Edit round 2' }));
  expect(
    screen.getByLabelText('Recorded revision effort (minutes)'),
  ).toHaveValue(40);
});
it('separates currency totals and displays incomplete cost coverage', () => {
  show(<DeliveryRevisionCosts workspace={workspace} />);
  expect(screen.getByText(/USD 12.50/)).toBeVisible();
  expect(screen.getByText(/1.*cost/)).toBeVisible();
});
it('does not show old results for a newly selected project', async () => {
  show(<DeliveryRevisionCosts workspace={workspace} />);
  await userEvent.selectOptions(
    screen.getByLabelText('Revision project'),
    'project',
  );
  expect(screen.queryByText(/USD 12.50/)).not.toBeInTheDocument();
  expect(screen.getByText('Loading revision costs…')).toBeVisible();
});
it('does not expose cost summaries without finance access', () => {
  finance = false;
  show(<DeliveryRevisionCosts workspace={workspace} />);
  expect(screen.queryByText('Revision costs by cause')).not.toBeInTheDocument();
});
