import { type ComponentProps, type ReactElement, useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { FinancePlanForm } from '@/delivery/finance/FinancePlanForm';
import { FinanceEntryForm } from '@/delivery/finance/FinanceEntryForm';
import { financeAiCostEntryFixture } from '@/delivery/finance/__tests__/finance-ai-cost.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
type PlanProps = ComponentProps<typeof FinancePlanForm>;
type EntryProps = ComponentProps<typeof FinanceEntryForm>;
const MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const FORMER_MEMBER_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const PLAN_ID = '879ef795-b85d-4db5-bfba-d3d89b159111';
const ENTRY_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const SECOND_PROJECT_ID = '7ce59062-eb7f-42f3-932a-b7fc5307b5b3';
const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const mockRecognitionRefetch = jest.fn();
let mockRecognitionAvailable = true;
let mockLockedMonths: string[] = [];
jest.mock('@/delivery/finance/useFinanceRecognitionAvailability', () => ({
  useFinanceRecognitionAvailability: () => ({
    available: mockRecognitionAvailable,
    canManage: mockRecognitionAvailable,
    monthValid: true,
    lockedMonths: mockLockedMonths,
    error: !mockRecognitionAvailable,
    checking: false,
    refetch: mockRecognitionRefetch,
  }),
}));
const members = [{ id: MEMBER_ID, name: 'Active editor' }];
const projects = [
  { id: PROJECT_ID, name: 'Client Alpha' },
  { id: SECOND_PROJECT_ID, name: 'Client Beta' },
];
const planFixture = (): NonNullable<PlanProps['initial']> => ({
  id: PLAN_ID,
  revision: 2,
  type: 'SALARY',
  name: 'Editor monthly pay',
  currency: 'USD',
  monthlyAmountMicros: '1000000000',
  memberId: MEMBER_ID,
  memberName: 'Active editor',
  memberActive: true,
  startMonth: '2026-10',
  endMonth: null,
  dueDay: 31,
  active: true,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});
const entryFixture = (): NonNullable<EntryProps['initial']> => ({
  id: ENTRY_ID,
  revision: 3,
  month: '2026-10',
  kind: 'COST',
  category: 'SALARY',
  title: 'October editor pay',
  currency: 'USD',
  amountMicros: '1000000000',
  note: '',
  evidenceUrl: null,
  status: 'DRAFT',
  sourceType: 'PLAN',
  sourcePlan: {
    planId: PLAN_ID,
    revision: 2,
    type: 'SALARY',
    name: 'Editor monthly pay',
    memberId: MEMBER_ID,
    memberName: 'Active editor',
    monthlyAmountMicros: '1000000000',
    startMonth: '2026-10',
    endMonth: null,
    dueDay: 31,
  },
  sourceWarnings: [],
  lockedMonths: [],
  sourceReviewToken: null,
  dueDate: '2026-10-31',
  remainingAllocationMicros: '1000000000',
  allocations: [],
  createdBy: MEMBER_ID,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  postedAt: null,
  voidedAt: null,
  voidReason: null,
});
const planProps = (initial: PlanProps['initial'] = null): PlanProps => ({
  initial,
  month: '2026-10',
  members,
  busy: false,
  latestRevision: initial?.revision ?? 0,
  onSave: mockSave,
  onCancel: mockCancel,
  onReload: mockReload,
});
const entryProps = (initial: EntryProps['initial'] = null): EntryProps => ({
  initial,
  month: '2026-10',
  projects,
  busy: false,
  latestRevision: initial?.revision ?? 0,
  onSave: mockSave,
  onCancel: mockCancel,
  onReload: mockReload,
});
const renderPlan = (props: PlanProps) => (
  <FinancePlanForm
    initial={props.initial}
    month={props.month}
    members={props.members}
    busy={props.busy}
    readOnly={props.readOnly}
    latestRevision={props.latestRevision}
    onSave={props.onSave}
    onCancel={props.onCancel}
    onReload={props.onReload}
  />
);
const renderEntry = (props: EntryProps) => (
  <FinanceEntryForm
    initial={props.initial}
    month={props.month}
    projects={props.projects}
    busy={props.busy}
    readOnly={props.readOnly}
    latestRevision={props.latestRevision}
    onSave={props.onSave}
    onCancel={props.onCancel}
    onReload={props.onReload}
  />
);
const setup = (content: ReactElement) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  let replaceContent: (value: ReactElement) => void = () => undefined;
  const Harness = () => {
    const [value, setValue] = useState(content);
    replaceContent = setValue;
    return value;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery?view=finance'] },
  );
  render(<RouterProvider router={router} />);
  return { update: (value: ReactElement) => act(() => replaceContent(value)) };
};
const fillSalary = async (amount = '1234.567891') => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Plan name' }),
    'Editor monthly pay',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Employee' }),
    MEMBER_ID,
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Monthly amount' }),
    amount,
  );
};
const fillManualEntry = async (amount = '100.000001') => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Entry title' }),
    'October client service cost',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Total amount' }),
    amount,
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source notes' }),
    'Reviewed supplier evidence for October.',
  );
};
const addAllocation = async (
  index: number,
  projectId: string,
  amount: string,
) => {
  await userEvent.click(screen.getByRole('button', { name: 'Add allocation' }));
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: `Allocation ${index} project` }),
    projectId,
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: `Allocation ${index} amount` }),
    amount,
  );
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSave.mockReset().mockResolvedValue(false);
  mockCancel.mockReset();
  mockReload.mockReset();
  mockRecognitionAvailable = true;
  mockLockedMonths = [];
  mockRecognitionRefetch.mockReset().mockResolvedValue({});
});

it('sends exact monthly money, effective month and month-end due day with a stable retry identity', async () => {
  setup(renderPlan(planProps()));
  await fillSalary();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Currency' }),
    'AED',
  );
  const due = screen.getByRole('spinbutton', { name: 'Due day each month' });
  await userEvent.clear(due);
  await userEvent.type(due, '31');
  expect(
    screen.getByText('Shorter months use their last calendar day.'),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  const first = mockSave.mock.calls[0][0];
  expect(first).toMatchObject({
    revision: 0,
    type: 'SALARY',
    name: 'Editor monthly pay',
    currency: 'AED',
    monthlyAmountMicros: '1234567891',
    memberId: MEMBER_ID,
    startMonth: '2026-10',
    dueDay: 31,
    endMonth: null,
    active: true,
  });
  expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByRole('textbox', { name: 'Monthly amount' })).toHaveValue(
    '1234.567891',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect(mockSave.mock.calls[1][0].id).toBe(first.id);
});
it.each([
  ['0', '0'],
  ['9223372036854.775807', '9223372036854775807'],
])(
  'accepts an explicit monthly amount %s without rounding',
  async (amount, expected) => {
    setup(renderPlan(planProps()));
    await fillSalary(amount);
    await userEvent.click(
      screen.getByRole('button', { name: 'Save monthly plan' }),
    );
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].monthlyAmountMicros).toBe(expected);
  },
);
it.each(['9223372036854.775808', '-1', '0.0000001'])(
  'blocks the unsupported monthly amount %s before a save',
  async (amount) => {
    setup(renderPlan(planProps()));
    await fillSalary(amount);
    expect(
      screen.getByRole('button', { name: 'Save monthly plan' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  },
);
it('requires an employee for salary while overhead clears the person from its payload', async () => {
  setup(renderPlan(planProps()));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Plan name' }),
    'Office overhead',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Monthly amount' }),
    '0',
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Employee' }),
    MEMBER_ID,
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Cost type' }),
    'OVERHEAD',
  );
  expect(
    screen.queryByRole('combobox', { name: 'Employee' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    type: 'OVERHEAD',
    memberId: null,
    monthlyAmountMicros: '0',
  });
});
it('retains a departed employee on an inactive historical plan but prevents activating it', async () => {
  const initial = {
    ...planFixture(),
    memberId: FORMER_MEMBER_ID,
    memberName: 'Former editor',
    memberActive: false,
    active: false,
  };
  setup(renderPlan(planProps(initial)));
  const amount = screen.getByRole('textbox', { name: 'Monthly amount' });
  await userEvent.clear(amount);
  await userEvent.type(amount, '900');
  expect(screen.getByRole('combobox', { name: 'Employee' })).toHaveValue(
    FORMER_MEMBER_ID,
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeEnabled();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Active for monthly draft preparation',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Active for monthly draft preparation',
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    memberId: FORMER_MEMBER_ID,
    active: false,
  });
});
it('keeps dirty plan changes on Cancel and guards reloading a newer server revision', async () => {
  const initial = planFixture();
  const props = planProps(initial);
  const rendered = setup(renderPlan(props));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Plan name' }),
    ' revised',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
    'Editor monthly pay revised',
  );
  expect(mockCancel).not.toHaveBeenCalled();
  rendered.update(renderPlan({ ...props, latestRevision: 3 }));
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(mockReload).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockReload).toHaveBeenCalledTimes(1);
});
it('blocks invalid effective ranges and unsupported saved currencies with useful correction paths', async () => {
  const initial = {
    ...planFixture(),
    currency: 'JPY',
    startMonth: '2026-11',
    endMonth: '2026-10',
  };
  setup(renderPlan(planProps(initial)));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Plan name' }),
    ' revised',
  );
  expect(screen.getByText('Choose a supported currency.')).toBeVisible();
  expect(
    screen.getByText('The last month must be the first month or later.'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeDisabled();
});
it('retains values when a plan save throws', async () => {
  mockSave.mockRejectedValue(new Error('Synthetic unavailable service'));
  setup(renderPlan(planProps()));
  await fillSalary('1200');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your draft is kept.',
  );
  expect(screen.getByRole('textbox', { name: 'Monthly amount' })).toHaveValue(
    '1200',
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly plan' }),
  ).toBeEnabled();
});
it('saves an exact manual draft with an explicit unallocated remainder and stable retry identity', async () => {
  setup(renderEntry(entryProps()));
  await fillManualEntry();
  expect(screen.getByText(/Unallocated:/)).toHaveTextContent(
    'This draft can be saved',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    revision: 0,
    month: '2026-10',
    kind: 'COST',
    category: 'DIRECT_COST',
    currency: 'USD',
    amountMicros: '100000001',
    allocations: [],
    evidenceUrl: null,
  });
  const id = mockSave.mock.calls[0][0].id;
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect(mockSave.mock.calls[1][0].id).toBe(id);
});
it('requires manual source evidence or notes and permits a custom revenue category', async () => {
  setup(renderEntry(entryProps()));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Entry title' }),
    'October service revenue',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Total amount' }),
    '0',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Entry kind' }),
    'REVENUE',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Category' }),
    'CUSTOM',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Custom category name' }),
    'App milestone',
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Evidence link (optional)' }),
    'https://example.com/milestone',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    kind: 'REVENUE',
    category: 'App milestone',
    amountMicros: '0',
    note: '',
    evidenceUrl: 'https://example.com/milestone',
  });
});
it('rejects duplicate buckets and over-allocation before allowing an exact client split', async () => {
  setup(renderEntry(entryProps()));
  await fillManualEntry('100');
  await addAllocation(1, PROJECT_ID, '120');
  expect(screen.getByText(/Over-allocated by/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  const amount = screen.getByRole('textbox', { name: 'Allocation 1 amount' });
  await userEvent.clear(amount);
  await userEvent.type(amount, '100');
  await addAllocation(2, PROJECT_ID, '0');
  expect(
    screen.getAllByText('Use each client project or company bucket only once.'),
  ).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Remove allocation 2' }),
  );
  expect(screen.getByText('The total is fully allocated.')).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0].allocations).toEqual([
    { projectId: PROJECT_ID, amountMicros: '100000000' },
  ]);
});
it('assigns only the exact remainder to an explicit company bucket without changing the client split', async () => {
  setup(renderEntry(entryProps()));
  await fillManualEntry('100.000001');
  await addAllocation(1, PROJECT_ID, '40.000001');
  await userEvent.click(
    screen.getByRole('button', { name: 'Allocate remainder to company' }),
  );
  expect(
    screen.getByRole('combobox', { name: 'Allocation 2 project' }),
  ).toHaveValue('COMPANY');
  expect(
    screen.getByRole('textbox', { name: 'Allocation 2 amount' }),
  ).toHaveValue('60');
  const total = screen.getByRole('textbox', { name: 'Total amount' });
  await userEvent.clear(total);
  await userEvent.type(total, '110.000001');
  await userEvent.click(
    screen.getByRole('button', { name: 'Allocate remainder to company' }),
  );
  expect(screen.getAllByRole('group', { name: /^Allocation \d/ })).toHaveLength(
    2,
  );
  expect(
    screen.getByRole('textbox', { name: 'Allocation 1 amount' }),
  ).toHaveValue('40.000001');
  expect(
    screen.getByRole('textbox', { name: 'Allocation 2 amount' }),
  ).toHaveValue('70');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0].allocations).toEqual([
    { projectId: PROJECT_ID, amountMicros: '40000001' },
    { projectId: null, amountMicros: '70000000' },
  ]);
});
it('requires an explicit bucket on new allocation rows and preserves failed entry edits', async () => {
  setup(renderEntry(entryProps()));
  await fillManualEntry('100');
  await userEvent.click(screen.getByRole('button', { name: 'Add allocation' }));
  expect(
    screen.getByRole('combobox', { name: 'Allocation 1 project' }),
  ).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Allocation 1 project' }),
    'COMPANY',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Allocation 1 amount' }),
    '100',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your changes are kept',
  );
  expect(
    screen.getByRole('textbox', { name: 'Allocation 1 amount' }),
  ).toHaveValue('100');
});
it('keeps source-plan identity fixed and requires an explanation when overriding its amount', async () => {
  const initial = {
    ...entryFixture(),
    sourceWarnings: ['SOURCE_PLAN_CHANGED'],
  };
  setup(renderEntry(entryProps(initial)));
  expect(screen.getByLabelText('Recognition month')).toHaveAttribute(
    'readonly',
  );
  expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Entry kind' })).toHaveValue(
    'Cost',
  );
  expect(screen.getByRole('textbox', { name: 'Category' })).toHaveValue(
    'Salary',
  );
  expect(
    screen.getByText(/The plan changed after this draft was prepared/),
  ).toBeVisible();
  const amount = screen.getByRole('textbox', { name: 'Total amount' });
  await userEvent.clear(amount);
  await userEvent.type(amount, '900');
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source notes' }),
    'Explicit adjustment after reviewed start date.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    id: ENTRY_ID,
    revision: 3,
    month: '2026-10',
    currency: 'USD',
    kind: 'COST',
    category: 'SALARY',
    amountMicros: '900000000',
    note: 'Explicit adjustment after reviewed start date.',
  });
});
it('locks a saved AI cost to its amount, kind, category and currency while allowing finance notes and allocation edits', async () => {
  const initial = {
    ...entryFixture(),
    sourceType: 'AI_SPEND',
    sourcePlan: null,
    sourceAiSpend: financeAiCostEntryFixture().sourceAiSpend,
    category: 'OS production AI',
    title: 'Recorded AI charge',
    amountMicros: '10125678',
    remainingAllocationMicros: '0',
    allocations: [
      {
        projectId: PROJECT_ID,
        projectName: 'Client Alpha',
        amountMicros: '10125678',
      },
    ],
  };
  setup(renderEntry(entryProps(initial)));
  expect(screen.getByRole('textbox', { name: 'Total amount' })).toHaveAttribute(
    'readonly',
  );
  expect(screen.getByRole('textbox', { name: 'Entry kind' })).toHaveValue(
    'Cost',
  );
  expect(screen.getByRole('textbox', { name: 'Category' })).toHaveValue(
    'OS production AI',
  );
  expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
  expect(
    screen.queryByRole('textbox', { name: 'Evidence link (optional)' }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Source notes' }),
    'Finance allocation reviewed',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    kind: 'COST',
    category: 'OS production AI',
    currency: 'USD',
    amountMicros: '10125678',
    note: 'Finance allocation reviewed',
  });
});
it('prevents editing a posted recognition and still allows closing its form', async () => {
  const initial = { ...entryFixture(), status: 'POSTED' };
  setup(renderEntry(entryProps(initial)));
  expect(screen.getByRole('textbox', { name: 'Total amount' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});
it('preserves an entry draft through Cancel and a conflicting server update', async () => {
  const initial = entryFixture();
  const props = entryProps(initial);
  const rendered = setup(renderEntry(props));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Entry title' }),
    ' revised',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'October editor pay revised',
  );
  rendered.update(renderEntry({ ...props, latestRevision: 4 }));
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});

it.each(['plan', 'entry'] as const)(
  'retains a dirty %s form in read-only mode without trapping Cancel or allowing writes',
  async (form) => {
    const props =
      form === 'plan' ? planProps(planFixture()) : entryProps(entryFixture());
    const content =
      form === 'plan'
        ? renderPlan(props as PlanProps)
        : renderEntry(props as EntryProps);
    const rendered = setup(content);
    const fieldName = form === 'plan' ? 'Plan name' : 'Entry title';
    await userEvent.type(
      screen.getByRole('textbox', { name: fieldName }),
      ' retained',
    );
    const readOnlyContent =
      form === 'plan'
        ? renderPlan({
            ...(props as PlanProps),
            readOnly: true,
            latestRevision: 9,
          })
        : renderEntry({
            ...(props as EntryProps),
            readOnly: true,
            latestRevision: 9,
          });
    rendered.update(readOnlyContent);
    expect(screen.getByRole('textbox', { name: fieldName })).toHaveValue(
      form === 'plan'
        ? 'Editor monthly pay retained'
        : 'October editor pay retained',
    );
    expect(screen.getByRole('textbox', { name: fieldName })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: form === 'plan' ? 'Save monthly plan' : 'Save monthly draft',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reload latest version' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: fieldName })).toHaveValue(
      form === 'plan'
        ? 'Editor monthly pay retained'
        : 'October editor pay retained',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  },
);
it('does not call an unnamed allocation complete merely because its numeric amount equals the total', async () => {
  setup(renderEntry(entryProps()));
  await fillManualEntry('12.34');
  await userEvent.click(screen.getByRole('button', { name: 'Add allocation' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Allocation 1 amount' }),
    '12.34',
  );
  expect(screen.getByText(/Allocated:/)).toHaveTextContent('$12.34 / $12.34');
  expect(
    screen.getByText(
      'Choose a valid client project or company bucket for each allocation.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('The total is fully allocated.'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
});

it('preserves a completed manual draft while month status is unavailable or locked and leaves the target month editable', async () => {
  const props = entryProps();
  const page = setup(renderEntry(props));
  await fillManualEntry('12.34');
  await userEvent.click(
    screen.getByRole('button', { name: 'Allocate remainder to company' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeEnabled();
  mockRecognitionAvailable = false;
  page.update(renderEntry(props));
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'October client service cost',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Check month status' }),
  );
  expect(mockRecognitionRefetch).toHaveBeenCalledTimes(1);
  mockRecognitionAvailable = true;
  mockLockedMonths = ['2026-10'];
  page.update(renderEntry(props));
  expect(
    screen.getByRole('link', { name: 'Review reopening 2026-10' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=finance&financeView=monthly&financeMonth=2026-10',
  );
  expect(screen.getByLabelText('Recognition month')).toBeEnabled();
  expect(screen.getByLabelText('Recognition month')).not.toHaveAttribute(
    'readonly',
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  mockLockedMonths = [];
  page.update(renderEntry(props));
  expect(screen.getByRole('textbox', { name: 'Source notes' })).toHaveValue(
    'Reviewed supplier evidence for October.',
  );
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeEnabled();
  expect(mockSave).not.toHaveBeenCalled();
});
