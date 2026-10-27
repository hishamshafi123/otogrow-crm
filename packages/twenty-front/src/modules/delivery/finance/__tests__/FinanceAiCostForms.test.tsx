import { useState, type ReactElement } from 'react';
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
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { FinanceAiCostImportForm } from '@/delivery/finance/FinanceAiCostImportForm';
import { FinanceAiCostPostForm } from '@/delivery/finance/FinanceAiCostPostForm';
import { type FinanceAiCostSnapshot } from '@/delivery/finance/finance-ai-cost.types';
import {
  AI_ENTRY_ID,
  AI_EVIDENCE_ID,
  AI_LATER_EVIDENCE_ID,
  AI_PRIOR_ENTRY_ID,
  AI_SPEND_ID,
  financeAiCostEntryFixture,
  financeAiCostSnapshotFixture,
  financeAiCostSourceFixture,
} from '@/delivery/finance/__tests__/finance-ai-cost.fixtures';

const mockSave = jest.fn();
const mockPost = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const mockRefetch = jest.fn();
let mockRecognitionAvailable = true;
let mockLockedMonths: string[] = [];
jest.mock('@/delivery/finance/useFinanceRecognitionAvailability', () => ({
  useFinanceRecognitionAvailability: (
    month: string,
    replacedMonth?: string | null,
  ) => ({
    available: mockRecognitionAvailable,
    canManage: mockRecognitionAvailable,
    monthValid: true,
    lockedMonths: mockLockedMonths.filter(
      (item) => item === month || item === replacedMonth,
    ),
    error: !mockRecognitionAvailable,
    checking: false,
    refetch: mockRefetch,
  }),
}));
let mockSnapshot: FinanceAiCostSnapshot;
let mockQueryError: Error | undefined;
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryFinanceAiCosts: mockSnapshot },
    loading: false,
    error: mockQueryError,
    refetch: mockRefetch,
  }),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    canReadFinance: true,
    canManageFinance: true,
    scope: 'workspace:member',
    matches: (value: FinanceAiCostSnapshot | undefined) =>
      value?.workspaceId === 'workspace',
  }),
}));
const sourceForm = (
  source = financeAiCostSourceFixture(),
  readOnly = false,
) => (
  <FinanceAiCostImportForm
    source={source}
    projects={financeAiCostSnapshotFixture().projects}
    month="2026-09"
    busy={false}
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const postForm = (entry = financeAiCostEntryFixture()) => (
  <FinanceAiCostPostForm
    entry={entry}
    busy={false}
    disabled={false}
    canManage
    onPost={mockPost}
  />
);
const setup = (initial: ReactElement) => {
  let update = (next: ReactElement) => {
    void next;
  };
  const Harness = () => {
    const [content, setContent] = useState(initial);
    update = setContent;
    return content;
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
    { initialEntries: ['/delivery?view=finance&financeView=ai-costs'] },
  );
  const view = render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    replace: (next: ReactElement) => act(() => update(next)),
    refresh: () =>
      view.rerender(
        <RouterProvider
          router={router}
          future={{ v7_startTransition: true }}
        />,
      ),
  };
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
  mockSnapshot = financeAiCostSnapshotFixture();
  mockQueryError = undefined;
  mockRecognitionAvailable = true;
  mockLockedMonths = [];
  mockSave.mockReset().mockResolvedValue(true);
  mockPost.mockReset().mockResolvedValue(true);
  mockCancel.mockReset();
  mockReload.mockReset();
  mockRefetch.mockReset().mockResolvedValue({});
});
const selectAndAllocateCompany = async (evidenceId = AI_EVIDENCE_ID) => {
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Recorded financial event' }),
    evidenceId,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Assign remaining amount to company' }),
  );
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I checked that this charge/ }),
  );
};
it('saves exact selected evidence and explicit allocation as a draft without supplying a mutable cost amount', async () => {
  setup(sourceForm());
  expect(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  ).toBeDisabled();
  await selectAndAllocateCompany();
  expect(
    screen.getByRole('textbox', { name: 'Recorded AI amount' }),
  ).toHaveValue('$10.125678');
  expect(
    screen.getByRole('textbox', { name: 'Recorded AI amount' }),
  ).toHaveAttribute('readonly');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Finance review notes' }),
    'Explicit finance review',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    spendId: AI_SPEND_ID,
    evidenceEventId: AI_EVIDENCE_ID,
    expectedSourceReviewToken: 'a'.repeat(64),
    expectedClaimRevision: 0,
    month: '2026-09',
    note: 'Explicit finance review',
    allocations: [{ projectId: null, amountMicros: '10125678' }],
    acknowledgeNoDuplicateCost: true,
    replacesEntryId: null,
  });
  expect(mockSave.mock.calls[0][0]).not.toHaveProperty('amountMicros');
});

it('keeps a correction draft blocked by both its selected and prior locked months with an actionable reopening link', async () => {
  const source = financeAiCostSourceFixture();
  source.claim = {
    revision: 4,
    currentEntry: {
      id: AI_PRIOR_ENTRY_ID,
      revision: 3,
      month: '2026-08',
      status: 'POSTED',
      amountMicros: '10125678',
      matchedMicros: '0',
      activeMatchCount: 0,
    },
    replacementEntry: null,
  };
  mockLockedMonths = ['2026-08', '2026-09'];
  const page = setup(sourceForm(source));
  fireEvent.change(screen.getByLabelText('Service month'), {
    target: { value: '2026-09' },
  });
  await selectAndAllocateCompany();
  await userEvent.type(
    screen.getByRole('textbox', {
      name: 'Reason for correcting the posted cost',
    }),
    'Correct the client allocation.',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Finance review notes' }),
    'Preserve this review through the period check.',
  );
  expect(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('link', { name: 'Review reopening 2026-08' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=finance&financeView=monthly&financeMonth=2026-08',
  );
  expect(
    screen.getByRole('link', { name: 'Review reopening 2026-09' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Service month')).toBeEnabled();
  expect(screen.getByLabelText('Service month')).not.toHaveAttribute(
    'readonly',
  );
  mockLockedMonths = ['2026-08'];
  page.replace(sourceForm(source));
  expect(
    screen.queryByRole('link', { name: 'Review reopening 2026-09' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  ).toBeDisabled();
  mockRecognitionAvailable = false;
  page.replace(sourceForm(source));
  expect(
    screen.getByRole('button', { name: 'Check month status' }),
  ).toBeVisible();
  expect(
    screen.getByRole('textbox', {
      name: 'Reason for correcting the posted cost',
    }),
  ).toHaveValue('Correct the client allocation.');
  mockRecognitionAvailable = true;
  mockLockedMonths = [];
  page.replace(sourceForm(source));
  expect(
    screen.getByRole('textbox', { name: 'Finance review notes' }),
  ).toHaveValue('Preserve this review through the period check.');
  expect(screen.getByLabelText('Service month')).toHaveValue('2026-09');
  expect(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  ).toBeEnabled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(source.claim.currentEntry?.status).toBe('POSTED');
});
it('keeps an explicit zero administrator-recorded charge distinct from unknown provider evidence', async () => {
  const source = financeAiCostSourceFixture();
  source.settledAmountMicros = '0';
  source.evidenceOptions = [
    {
      ...source.evidenceOptions[0],
      basis: 'MANUAL_EVIDENCE',
      amountMicros: '0',
    },
  ];
  setup(sourceForm(source));
  await selectAndAllocateCompany();
  expect(
    screen.getByRole('textbox', { name: 'Recorded AI amount' }),
  ).toHaveValue('$0.00');
  expect(
    screen.getByText(/Private supporting budget evidence is excluded/),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0].allocations).toEqual([
    { projectId: null, amountMicros: '0' },
  ]);
});
it.each(['8000001', '12345678'])(
  'prepares a reasoned replacement of %s micros without voiding the existing posted cost',
  async (amountMicros) => {
    const source = financeAiCostSourceFixture();
    source.claim = {
      revision: 4,
      currentEntry: {
        id: AI_PRIOR_ENTRY_ID,
        revision: 3,
        month: '2026-08',
        status: 'POSTED',
        amountMicros: '10125678',
        matchedMicros: '5000000',
        activeMatchCount: 1,
      },
      replacementEntry: null,
    };
    source.evidenceOptions.push({
      id: AI_LATER_EVIDENCE_ID,
      basis: 'LATE_PRICED_USAGE',
      amountMicros,
      recordedAt: '2026-10-02T10:00:00Z',
    });
    source.sourceWarnings = ['LATE_EVIDENCE_AVAILABLE'];
    setup(sourceForm(source));
    expect(screen.getByLabelText('Service month')).toHaveValue('2026-08');
    expect(screen.getByLabelText('Service month')).not.toHaveAttribute(
      'readonly',
    );
    await selectAndAllocateCompany(AI_LATER_EVIDENCE_ID);
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: /I understand the source warnings/,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Save AI-cost draft' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', {
        name: 'Reason for correcting the posted cost',
      }),
      'Reviewed later usage for the service month',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save AI-cost draft' }),
    );
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      evidenceEventId: AI_LATER_EVIDENCE_ID,
      replacesEntryId: AI_PRIOR_ENTRY_ID,
      expectedReplacedEntryRevision: 3,
      expectedClaimRevision: 4,
      month: '2026-08',
      correctionReason: 'Reviewed later usage for the service month',
      allocations: [{ projectId: null, amountMicros }],
    });
    expect(source.claim.currentEntry?.status).toBe('POSTED');
    expect(mockPost).not.toHaveBeenCalled();
  },
);
it('preserves a stale review and requires explicit discard before reloading changed evidence', async () => {
  const source = financeAiCostSourceFixture();
  const page = setup(sourceForm(source));
  await selectAndAllocateCompany();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Cost title' }),
    ' retained',
  );
  page.replace(
    sourceForm({ ...source, sourceReviewToken: 'b'.repeat(64), revision: 4 }),
  );
  expect(screen.getByRole('textbox', { name: 'Cost title' })).toHaveValue(
    'AI cost — reviewed-model retained',
  );
  expect(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(mockReload).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps a read-only draft after edit access loss and guards cancellation', async () => {
  const source = financeAiCostSourceFixture();
  const page = setup(sourceForm(source));
  await selectAndAllocateCompany();
  page.replace(sourceForm(source, true));
  expect(
    screen.getByRole('combobox', { name: 'Recorded financial event' }),
  ).toHaveValue(AI_EVIDENCE_ID);
  expect(
    screen.getByRole('combobox', { name: 'Recorded financial event' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(mockCancel).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockCancel).toHaveBeenCalledTimes(1);
});
const configurePostSource = (replacement = false) => {
  const source = financeAiCostSourceFixture();
  const entry = financeAiCostEntryFixture();
  const reference = {
    id: AI_ENTRY_ID,
    revision: 1,
    month: entry.month,
    amountMicros: entry.amountMicros,
    status: 'DRAFT',
    matchedMicros: '0',
    activeMatchCount: 0,
  };
  source.claim = {
    revision: 2,
    currentEntry: reference,
    replacementEntry: null,
  };
  if (replacement) {
    entry.sourceAiSpend = {
      ...entry.sourceAiSpend!,
      replacesEntryId: AI_PRIOR_ENTRY_ID,
      correctionReason: 'Reviewed correction',
    };
    source.claim = {
      revision: 4,
      currentEntry: {
        ...reference,
        id: AI_PRIOR_ENTRY_ID,
        revision: 3,
        month: '2026-08',
        status: 'POSTED',
        matchedMicros: '5000000',
        activeMatchCount: 1,
      },
      replacementEntry: reference,
    };
  }
  mockSnapshot.selectedSource = source;
  return entry;
};
it('posts an AI draft using the fresh source and claim token through the dedicated action', async () => {
  const entry = configurePostSource();
  setup(postForm(entry));
  await userEvent.click(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  );
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  expect(mockPost).toHaveBeenCalledWith({
    id: AI_ENTRY_ID,
    revision: 1,
    expectedClaimRevision: 2,
    expectedSourceReviewToken: 'a'.repeat(64),
    acknowledgeSourceWarnings: false,
    acknowledgeReplacement: false,
  });
});
it('requires explicit replacement acknowledgement and retains it hidden during a source outage', async () => {
  const entry = configurePostSource(true);
  const page = setup(postForm(entry));
  expect(
    screen.getByText(/The prior cost stays counted until this post/),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  );
  expect(mockPost).not.toHaveBeenCalled();
  const checkbox = screen.getByRole('checkbox', {
    name: /I acknowledge replacing/,
  });
  await userEvent.click(checkbox);
  mockQueryError = new Error('Offline');
  page.replace(postForm(entry));
  expect(screen.getByLabelText(/I acknowledge replacing/)).toBeChecked();
  expect(checkbox).not.toBeVisible();
  expect(checkbox).toBeDisabled();
  mockQueryError = undefined;
  page.replace(postForm(entry));
  expect(
    screen.getByRole('checkbox', { name: /I acknowledge replacing/ }),
  ).toBe(checkbox);
  await userEvent.click(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  );
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  expect(mockPost.mock.calls[0][0].acknowledgeReplacement).toBe(true);
});
it('invalidates correction review when current monthly match details change', async () => {
  const entry = configurePostSource(true);
  const page = setup(postForm(entry));
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I acknowledge replacing/ }),
  );
  mockSnapshot = {
    ...mockSnapshot,
    selectedSource: {
      ...mockSnapshot.selectedSource!,
      sourceReviewToken: 'b'.repeat(64),
      claim: {
        ...mockSnapshot.selectedSource!.claim,
        currentEntry: {
          ...mockSnapshot.selectedSource!.claim.currentEntry!,
          activeMatchCount: 2,
        },
      },
    },
  };
  page.replace(postForm(entry));
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  ).toBeDisabled();
  expect(mockPost).not.toHaveBeenCalled();
});
