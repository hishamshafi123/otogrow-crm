import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { FinancePeriodPanel } from '@/delivery/finance/FinancePeriodPanel';
import {
  type FinancePeriodSnapshot,
  type FinancePeriodState,
} from '@/delivery/finance/finance-period.types';
import {
  financePeriodLockedFixture,
  financePeriodSnapshotFixture,
  financePeriodStateFixture,
  PERIOD_ENTRY_ID,
} from '@/delivery/finance/__tests__/finance-period.fixtures';

let mockSnapshot: FinancePeriodSnapshot;
let mockParentPeriod: FinancePeriodState;
let mockQueryError: Error | undefined;
let mockReady = true;
let mockCanRead = true;
let mockCanManage = true;
const mockRefetch = jest.fn();
const mockChange = jest.fn();
const mockChanged = jest.fn();
const mockOperationName = (document: DocumentNode) =>
  document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: DocumentNode) => {
    const operation = mockOperationName(document);
    return {
      data:
        operation?.kind === 'OperationDefinition' &&
        operation.name?.value === 'DeliveryFinancePeriod'
          ? { deliveryFinancePeriod: mockSnapshot }
          : undefined,
      loading: false,
      error: mockQueryError,
      refetch: mockRefetch,
    };
  },
  useMutation: () => [mockChange],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    canManageFinance: mockCanManage,
    scope: 'workspace:finance-member:membership',
    matches: (value: FinancePeriodSnapshot | undefined) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === 'finance-member' &&
      value.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryBadge: 'span',
}));
const setup = (month = '2026-10') => {
  let refresh: () => void = () => undefined;
  const Page = () => {
    const [, setVersion] = useState(0);
    refresh = () => setVersion((value) => value + 1);
    return (
      <FinancePeriodPanel
        month={month}
        period={mockParentPeriod}
        available={mockReady && mockCanRead}
        busy={false}
        canManage={mockCanManage}
        onStartReview={(open) => open()}
        onChanged={mockChanged}
      />
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
    ],
    {
      initialEntries: [
        `/delivery?view=finance&financeView=monthly&financeMonth=${month}&financeCurrency=USD`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return { update: () => act(refresh), router };
};
const openReview = async (name = 'Review and lock month') => {
  await userEvent.click(screen.getByRole('button', { name }));
  await screen.findByRole('heading', {
    name: 'Review recorded monthly results',
  });
};
const fillReview = async () => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
    'Reviewed all currencies.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSnapshot = financePeriodSnapshotFixture();
  mockParentPeriod = financePeriodStateFixture();
  mockQueryError = undefined;
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  mockRefetch
    .mockReset()
    .mockImplementation(async () => ({
      data: { deliveryFinancePeriod: mockSnapshot },
    }));
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockChange
    .mockReset()
    .mockResolvedValue({
      data: {
        changeDeliveryFinancePeriod: {
          period: financePeriodLockedFixture(),
          replayed: false,
        },
      },
    });
});

it('reviews every currency despite a currency filter and links each blocking draft to its real month', async () => {
  mockSnapshot = {
    ...mockSnapshot,
    blockerCount: 1,
    canLock: false,
    blockers: [
      {
        entryId: PERIOD_ENTRY_ID,
        month: '2026-09',
        title: 'Pending September correction',
        sourceType: 'AI_SPEND',
        reason: 'CROSS_MONTH_CORRECTION',
      },
    ],
  };
  setup();
  await openReview();
  expect(
    screen.getByRole('region', { name: 'USD recorded result' }),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'EUR recorded result' }),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole('region', { name: 'EUR recorded result' }),
    ).getByText(/€1\.00/),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Review blocking entry' }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=finance&financeView=monthly&financeMonth=2026-09&financeEntry=${PERIOD_ENTRY_ID}`,
  );
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
});

it('mounts a new review only after its fresh preview succeeds, never from the prior session token', async () => {
  const page = setup();
  await openReview();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel month review' }),
  );
  let finish: (() => void) | undefined;
  mockRefetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({ data: { deliveryFinancePeriod: mockSnapshot } });
      }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Reason for locking' }),
  ).not.toBeInTheDocument();
  mockSnapshot = {
    ...mockSnapshot,
    previewToken: 'd'.repeat(64),
    recognitionHash: 'e'.repeat(64),
  };
  await act(async () => {
    finish?.();
  });
  page.update();
  await screen.findByRole('textbox', { name: 'Reason for locking' });
  expect(
    screen.queryByText(/This record changed while you were editing/),
  ).not.toBeInTheDocument();
  await fillReview();
  await userEvent.click(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  );
  await waitFor(() =>
    expect(mockChange).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            expectedPreviewToken: 'd'.repeat(64),
          }),
        },
      }),
    ),
  );
});

it('keeps a failed new preview closed until an explicit successful retry', async () => {
  mockRefetch.mockRejectedValueOnce(new Error('Offline'));
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  await screen.findByText(
    'The latest month review could not be checked. Refresh before reviewing its status.',
  );
  expect(
    screen.queryByRole('textbox', { name: 'Reason for locking' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh month review' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('');
  expect(mockChange).not.toHaveBeenCalled();
});

it('hides a previously opened reason and figures during failure, retains them after failed retry, and restores without writing', async () => {
  const page = setup();
  await openReview();
  await fillReview();
  mockQueryError = new Error('Offline');
  page.update();
  expect(
    screen.queryByRole('textbox', { name: 'Reason for locking' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'USD recorded result' }),
  ).not.toBeInTheDocument();
  mockRefetch.mockRejectedValueOnce(new Error('Offline'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh month review' }),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Reason for locking' }),
  ).not.toBeInTheDocument();
  mockQueryError = undefined;
  page.update();
  expect(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('Reviewed all currencies.');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(mockChange).not.toHaveBeenCalled();
});

it('uses a newer verified review status and intent while the parent monthly snapshot remains old', async () => {
  const page = setup();
  await openReview();
  mockSnapshot = {
    ...mockSnapshot,
    period: { ...financePeriodLockedFixture(), revision: 2 },
    canLock: false,
    canReopen: true,
    previewToken: 'c'.repeat(64),
  };
  page.update();
  expect(
    screen.getByRole('button', { name: 'Review reopening' }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel month review' }),
  );
  await openReview('Review reopening');
  expect(
    screen.getByRole('textbox', { name: 'Reason for reopening' }),
  ).toHaveValue('');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('shows the actual current status of a replay instead of promising a new lock', async () => {
  mockChange.mockResolvedValue({
    data: {
      changeDeliveryFinancePeriod: {
        period: { ...financePeriodStateFixture(), revision: 3 },
        replayed: true,
      },
    },
  });
  setup();
  await openReview();
  await fillReview();
  await userEvent.click(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  );
  expect(
    await screen.findByText(
      'This earlier request was already processed. Current month status: Open.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(
      'Monthly results locked. Actual payments and evidence remain available.',
    ),
  ).not.toBeInTheDocument();
});

it('lets finance readers inspect a fresh preview without rendering a management form', async () => {
  mockCanManage = false;
  setup();
  await openReview('Review month');
  expect(
    screen.getByRole('region', { name: 'USD recorded result' }),
  ).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Lock monthly results' }),
  ).not.toBeInTheDocument();
});
