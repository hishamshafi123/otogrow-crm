import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Request } from 'cross-fetch';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { RecurringTemplateForm } from '@/delivery/operations/forms/RecurringTemplateForm';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const MANAGER_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_ID = '10000000-0000-4000-8000-000000000003';
const PROJECT_ID = '10000000-0000-4000-8000-000000000004';
const workspace: DeliveryWorkspace = {
  actor: { memberId: MANAGER_ID, isAdmin: true, isManager: true },
  tasks: [],
  companies: [],
  projects: [
    {
      id: PROJECT_ID,
      revision: 1,
      name: 'SEO client',
      companyId: null,
      memberIds: [OWNER_ID, MANAGER_ID],
    },
  ],
  members: [
    {
      id: OWNER_ID,
      name: 'Project specialist',
      access: 'MEMBER',
      roleLabel: '',
    },
    {
      id: MANAGER_ID,
      name: 'Delivery manager',
      access: 'MANAGER',
      roleLabel: '',
    },
    {
      id: OTHER_ID,
      name: 'Other project specialist',
      access: 'MEMBER',
      roleLabel: '',
    },
  ],
};
const mockSave = jest.fn();
const mockInspect = jest.fn();
const mockCancel = jest.fn();
let refreshTimezone: (timezone: string) => void;
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/workflows/WorkflowPinField', () => ({
  WorkflowPinField: () => (
    <input type="hidden" name="workflowPin" value="" readOnly />
  ),
  workflowPinFromForm: () => null,
}));
const setup = () => {
  const Page = () => {
    const [timezone, setTimezone] = useState('Asia/Qatar');
    refreshTimezone = setTimezone;
    return (
      <>
        <Link to="/other">Another page</Link>
        <RecurringTemplateForm
          workspace={workspace}
          template={null}
          timezone={timezone}
          busy={false}
          onSave={mockSave}
          onInspect={mockInspect}
          onCancel={mockCancel}
        />
      </>
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
      { path: '/other', element: <p>Other page</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
};
const prepare = async () => {
  const user = setup();
  await user.type(screen.getByLabelText('Task title'), 'Weekly SEO delivery');
  await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
  await user.selectOptions(screen.getByLabelText('Assignee'), OWNER_ID);
  await user.selectOptions(screen.getByLabelText('Reviewer'), MANAGER_ID);
  return user;
};
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(globalThis, { Request });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSave.mockResolvedValue({ kind: 'SAVED' });
  mockInspect.mockResolvedValue(true);
});
it('requires explicit project and people, scoped assignment and independent manager review', async () => {
  const user = setup();
  expect(screen.getByLabelText('Project')).toHaveValue('');
  expect(screen.getByLabelText('Assignee')).toHaveValue('');
  expect(screen.getByLabelText('Reviewer')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Save recurring template' }),
  ).toBeDisabled();
  await user.type(screen.getByLabelText('Task title'), 'Weekly SEO delivery');
  await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
  expect(
    within(screen.getByLabelText('Assignee')).queryByRole('option', {
      name: 'Other project specialist',
    }),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Assignee'), MANAGER_ID);
  expect(
    within(screen.getByLabelText('Reviewer')).queryByRole('option', {
      name: 'Delivery manager',
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/No separate current manager/)).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Assignee'), OWNER_ID);
  await user.selectOptions(screen.getByLabelText('Reviewer'), MANAGER_ID);
  expect(
    screen.getByRole('checkbox', { name: 'Keep this template paused' }),
  ).toBeChecked();
  await user.click(
    screen.getByRole('button', { name: 'Save recurring template' }),
  );
  expect(mockSave.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      projectId: PROJECT_ID,
      paused: true,
      frequency: 'WEEKLY',
      weekdays: [1],
      fields: expect.objectContaining({
        assigneeId: OWNER_ID,
        reviewerId: MANAGER_ID,
      }),
    }),
  );
});
it('shows only relevant recurrence controls and normalizes hidden legacy fields', async () => {
  const user = await prepare();
  await user.selectOptions(screen.getByLabelText('Frequency'), 'MONTHLY');
  expect(
    screen.queryByRole('group', { name: 'Weekly days' }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Monthly day (clamped to month end)'));
  await user.type(
    screen.getByLabelText('Monthly day (clamped to month end)'),
    '31',
  );
  await user.selectOptions(screen.getByLabelText('Frequency'), 'DAILY');
  expect(
    screen.queryByLabelText('Monthly day (clamped to month end)'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Save recurring template' }),
  );
  expect(mockSave.mock.calls[0][0]).toEqual(
    expect.objectContaining({ frequency: 'DAILY', monthDay: 1, weekdays: [1] }),
  );
});
it('preserves notes when leaving is declined and blocks a timezone reinterpretation until explicit reload', async () => {
  const user = await prepare();
  await user.click(screen.getByRole('link', { name: 'Another page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Weekly SEO delivery',
  );
  act(() => refreshTimezone('UTC'));
  expect(
    screen.getByRole('button', { name: 'Save recurring template' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Weekly SEO delivery',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Weekly SEO delivery',
  );
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps definitive validation failures editable and unknown creates locked until deliberate inspection/discard', async () => {
  mockSave.mockResolvedValueOnce({
    kind: 'REJECTED',
    message: 'Choose an active project owner.',
  });
  const user = await prepare();
  await user.click(
    screen.getByRole('button', { name: 'Save recurring template' }),
  );
  expect(
    await screen.findByText('Choose an active project owner.'),
  ).toBeVisible();
  expect(screen.getByLabelText('Task title')).toBeEnabled();
  mockSave.mockResolvedValueOnce({ kind: 'UNKNOWN' });
  await user.click(
    screen.getByRole('button', { name: 'Save recurring template' }),
  );
  expect(await screen.findByText(/The save result is unknown/)).toBeVisible();
  expect(screen.getByLabelText('Task title')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: /Retry/ }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Inspect current schedules' }),
  );
  await user.click(
    await screen.findByRole('button', {
      name: 'Discard this preparation after inspecting schedules',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Weekly SEO delivery',
  );
  expect(mockSave).toHaveBeenCalledTimes(2);
});
