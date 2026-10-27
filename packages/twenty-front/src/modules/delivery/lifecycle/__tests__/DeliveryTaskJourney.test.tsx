import { type CreativeDocument } from '@/delivery/delivery-creative.types';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryTaskJourney } from '@/delivery/lifecycle/DeliveryTaskJourney';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
}));
const task: DeliveryTask = {
  id: 'task',
  title: 'Launch video',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 1,
  details: {
    brief: 'Brief',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [],
  projects: [],
  companies: [],
  members: [
    { id: 'editor', name: 'Maya', access: 'MEMBER', roleLabel: '' },
    { id: 'manager', name: 'Amna', access: 'ADMIN', roleLabel: '' },
  ],
};
const delivery: NonNullable<DeliveryTask['delivery']> = {
  timezone: 'Asia/Qatar',
  status: 'WAITING',
  cycle: 1,
  deliveredAt: '2026-10-26T10:00:00Z',
  nextCheckAt: '2026-10-26T22:00:00Z',
  deliveredSubmissionVersion: 1,
};
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('walks production, independent review, delivery and fulfilment with one next action', async () => {
  const open = jest.fn();
  const view = (current: DeliveryTask) => (
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={current}
        workspace={workspace}
        onOpenPanel={open}
      />
    </I18nProvider>
  );
  const { rerender } = render(view(task));
  const user = userEvent.setup();
  expect(screen.getByText('Maya')).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Open task instructions' }),
  );
  expect(open).toHaveBeenLastCalledWith('task');
  rerender(view({ ...task, details: { ...task.details, state: 'IN_REVIEW' } }));
  expect(screen.getByText('Amna')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Review submission' }));
  const approved = {
    ...task,
    details: { ...task.details, state: 'APPROVED' as const },
  };
  rerender(
    view({
      ...approved,
      delivery: { ...delivery, status: 'NOT_DELIVERED', nextCheckAt: null },
    }),
  );
  expect(screen.queryByText('Client work fulfilled')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Record client delivery' }),
  );
  expect(open).toHaveBeenLastCalledWith('operations');
  rerender(view({ ...approved, delivery }));
  await user.click(screen.getByRole('button', { name: 'Check fulfilment' }));
  expect(open).toHaveBeenLastCalledWith('operations');
  expect(screen.getByText(/Next fulfilment check:/)).toBeVisible();
  rerender(
    view({
      ...approved,
      delivery: { ...delivery, status: 'FULFILLED', nextCheckAt: null },
    }),
  );
  expect(
    screen.getByRole('heading', { name: 'Client work fulfilled' }),
  ).toBeVisible();
  expect(screen.queryByText('Next owner:')).not.toBeInTheDocument();
});
it('returns revisions to production and explains that old delivery must not count', () => {
  const { rerender } = render(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={{
          ...task,
          details: { ...task.details, state: 'CHANGES_REQUESTED' },
          delivery: { ...delivery, status: 'REDOING' },
        }}
        workspace={workspace}
        onOpenPanel={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getByText(/earlier delivery cycle is retained/)).toBeVisible();
  expect(screen.getByText('Maya')).toBeVisible();
  rerender(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={{
          ...task,
          details: { ...task.details, state: 'APPROVED' },
          delivery: { ...delivery, status: 'NEEDS_RECONFIRMATION' },
        }}
        workspace={workspace}
        onOpenPanel={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('earlier version');
  expect(
    screen.getByRole('button', { name: 'Record client delivery' }),
  ).toBeVisible();
});
it('does not offer an assignee self-review or self-fulfilment actions', () => {
  const assignee = {
    ...workspace,
    actor: { memberId: 'editor', isAdmin: true, isManager: true },
  };
  const { rerender } = render(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={{ ...task, details: { ...task.details, state: 'IN_REVIEW' } }}
        workspace={assignee}
        onOpenPanel={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(
    screen.queryByRole('button', { name: 'Review submission' }),
  ).not.toBeInTheDocument();
  rerender(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={{
          ...task,
          details: { ...task.details, state: 'APPROVED' },
          delivery,
        }}
        workspace={assignee}
        onOpenPanel={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('button', { name: 'View fulfilment' })).toBeVisible();
});

const document: CreativeDocument = {
  version: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  briefVersion: 1,
  approvedBriefVersion: null,
  brief: {
    objective: 'ADS',
    duration: 30,
    audience: '',
    painPoint: '',
    angle: '',
    concept: 'Product launch',
    productFacts: '',
    mandatoryClaims: '',
    visualDirection: '',
    format: '9:16',
    hook: '',
    cta: '',
    music: '',
    brandAssets: [],
  },
  briefHistory: [],
  references: [],
  shots: [],
  assets: [],
  finalAssetId: null,
  assembly: {
    assetIds: [],
    overlayText: '',
    audioId: null,
    notes: 'Calm pace',
  },
  variants: [],
  revisionCharge: 0,
};
it('routes an unapproved creative brief to the manager before production', async () => {
  const open = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryTaskJourney
        task={{
          ...task,
          details: {
            ...task.details,
            state: 'IN_PROGRESS',
            creative: document,
          },
        }}
        workspace={workspace}
        onOpenPanel={open}
      />
    </I18nProvider>,
  );
  expect(
    screen.getByRole('heading', { name: 'Creative brief needs approval' }),
  ).toBeVisible();
  expect(screen.getByText('Amna')).toBeVisible();
  expect(screen.getByText('Brief & assignment').closest('li')).toHaveAttribute(
    'aria-current',
    'step',
  );
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Review creative brief' }));
  expect(open).toHaveBeenCalledWith('creative');
});
