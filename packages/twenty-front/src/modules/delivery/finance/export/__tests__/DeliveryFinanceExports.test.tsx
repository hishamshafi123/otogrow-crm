import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryFinanceExportBatchInput } from '~/generated-metadata/graphql';
import { DeliveryFinanceExports } from '@/delivery/finance/export/DeliveryFinanceExports';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type FinanceExportPreview,
  type FinanceExportsSnapshot,
} from '@/delivery/finance/export/finance-export.types';
import {
  EXPORT_BATCH_ID,
  EXPORT_PROFILE_ID,
  financeExportBatchFixture,
  financeExportBatchDetailFixture,
  financeExportPreviewFixture,
  financeExportsFixture,
} from '@/delivery/finance/export/__tests__/finance-export.fixtures';

const mockOperation = (document: DocumentNode) =>
  document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  )?.name?.value;
let mockSnapshot: FinanceExportsSnapshot;
let mockPreview: FinanceExportPreview;
let mockError: Error | undefined;
let mockPreviewError: Error | undefined;
let mockPreviewLoading = false;
let mockReady = true;
let mockCanRead = true;
let mockCanManage = true;
let mockScope = 'workspace:member';
let mockRefreshPage: () => void;
const mockSaveProfile = jest.fn();
const mockCreate = jest.fn();
const mockImport = jest.fn();
const mockDownload = jest.fn();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
const mockPreviewRefetch = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
}));
jest.mock('@/delivery/finance/financeStyles', () => ({
  StyledFinanceNavigation: 'nav',
}));
jest.mock('@/delivery/finance/export/financeExportStyles', () => ({
  StyledExportBoundary: 'fieldset',
  StyledExportFields: 'div',
  StyledExportRow: 'article',
  StyledExportTotals: 'dl',
}));
jest.mock('@/delivery/finance/export/FinanceExportHistory', () => ({
  FinanceExportHistory: () => null,
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
  useMutation: (document: DocumentNode) => [
    mockOperation(document) === 'SaveDeliveryFinanceExportProfile'
      ? mockSaveProfile
      : mockOperation(document) === 'CreateDeliveryFinanceExportBatch'
        ? mockCreate
        : mockImport,
  ],
  useLazyQuery: () => [mockDownload, { loading: false }],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    canManageFinance: mockCanManage,
    lastVerifiedCanReadFinance: mockReady ? mockCanRead : true,
    scope: mockScope,
    refetch: mockRefetch,
    matches: (
      value:
        | { workspaceId: string; memberId: string; userWorkspaceId: string }
        | undefined,
    ) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === 'member' &&
      value.userWorkspaceId === 'membership',
  }),
}));
const setup = (section = 'review', selectionParams = '') => {
  const Page = () => {
    const [, setVersion] = useState(0);
    mockRefreshPage = () => setVersion((value) => value + 1);
    return <DeliveryFinanceExports onChanged={mockChanged} />;
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
        `/delivery?view=finance&financeView=exports&financeExportSection=${section}&financeExportProfile=${EXPORT_PROFILE_ID}&financeCurrency=EUR${section === 'batches' ? `&financeExportBatch=${EXPORT_BATCH_ID}` : ''}${selectionParams}`,
      ],
    },
  );
  const view = render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    router,
    unmount: view.unmount,
    refresh: () => act(() => mockRefreshPage()),
  };
};
const chooseCashPeriod = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: 'Choose source period' }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Export currency'),
    'USD',
  );
  fireEvent.change(screen.getByLabelText('Cash date from'), {
    target: { value: '2026-10-01' },
  });
  fireEvent.change(screen.getByLabelText('Cash date to'), {
    target: { value: '2026-10-28' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Review export' }));
  await screen.findByRole('heading', { name: 'Review before handoff' });
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
  mockSnapshot = financeExportsFixture();
  mockPreview = financeExportPreviewFixture();
  mockError = undefined;
  mockPreviewError = undefined;
  mockPreviewLoading = false;
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  mockScope = 'workspace:member';
  jest.clearAllMocks();
  mockChanged.mockResolvedValue(undefined);
  mockRefetch.mockImplementation(async () => ({
    data: { deliveryFinanceExports: mockSnapshot },
  }));
  mockPreviewRefetch.mockImplementation(async () => ({
    data: { deliveryFinanceExportPreview: mockPreview },
  }));
  mockSaveProfile.mockResolvedValue({
    data: {
      saveDeliveryFinanceExportProfile: {
        profile: mockSnapshot.profiles[0],
        replayed: false,
      },
    },
  });
  mockCreate.mockResolvedValue({
    data: {
      createDeliveryFinanceExportBatch: {
        batch: financeExportBatchFixture(),
        replayed: false,
      },
    },
  });
  mockImport.mockResolvedValue({
    data: {
      changeDeliveryFinanceExportImportStatus: {
        batch: { ...financeExportBatchFixture(), importStatus: 'CONFIRMED' },
        replayed: false,
      },
    },
  });
  mockQuery.mockImplementation((document: DocumentNode) =>
    mockOperation(document) === 'DeliveryFinanceExportPreview'
      ? {
          data: { deliveryFinanceExportPreview: mockPreview },
          error: mockPreviewError,
          loading: mockPreviewLoading,
          refetch: mockPreviewRefetch,
        }
      : {
          data: { deliveryFinanceExports: mockSnapshot },
          error: mockError,
          loading: false,
          refetch: mockRefetch,
        },
  );
});

describe('accountant export workspace', () => {
  it('restores a validated cash review from its URL after a fresh mount', async () => {
    const sourceParams =
      '&financeExportCurrency=USD&financeExportDateFrom=2026-10-01&financeExportDateTo=2026-10-28';
    const first = setup('review', sourceParams);
    expect(
      screen.getByRole('region', { name: 'Complete export selection totals' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose source period' }),
    ).not.toBeInTheDocument();
    first.unmount();
    setup('review', sourceParams);
    expect(
      await screen.findByRole('button', { name: 'Create export batch' }),
    ).toBeEnabled();
    expect(
      mockQuery.mock.calls.some(
        ([, options]) =>
          options.variables.input.dateFrom === '2026-10-01' &&
          options.variables.input.dateTo === '2026-10-28' &&
          options.variables.input.currency === 'USD',
      ),
    ).toBe(true);
  });
  it('records explicit source filters in the URL and restores them across sections and browser history', async () => {
    const { router } = setup();
    await chooseCashPeriod();
    const reviewedUrl = router.state.location.search;
    const selected = new URLSearchParams(reviewedUrl);
    expect(selected.get('financeExportCurrency')).toBe('USD');
    expect(selected.get('financeExportDateFrom')).toBe('2026-10-01');
    expect(selected.get('financeExportDateTo')).toBe('2026-10-28');
    expect(selected.get('financeCurrency')).toBe('EUR');
    await userEvent.click(screen.getByRole('link', { name: 'Profiles' }));
    expect(
      await screen.findByRole('button', { name: 'Edit this export profile' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(
      await screen.findByRole('button', { name: 'Create export batch' }),
    ).toBeEnabled();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(
      await screen.findByRole('button', { name: 'Edit this export profile' }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate(1);
    });
    expect(
      await screen.findByRole('button', { name: 'Create export batch' }),
    ).toBeEnabled();
    expect(router.state.location.search).toBe(reviewedUrl);
  });
  it('restores recognition service month and its explicitly chosen accounting date without cash dates', () => {
    const profile = { ...mockSnapshot.profiles[0], basis: 'RECOGNITION' };
    mockSnapshot = {
      ...mockSnapshot,
      profiles: [profile],
      selectedProfile: profile,
    };
    mockPreview = {
      ...mockPreview,
      profile,
      basis: 'RECOGNITION',
      currency: 'EUR',
    };
    setup(
      'review',
      '&financeExportCurrency=EUR&financeExportServiceMonth=2026-09&financeExportAccountingDate=2026-10-15',
    );
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeEnabled();
    expect(
      mockQuery.mock.calls.some(
        ([, options]) =>
          options.variables.input.serviceMonth === '2026-09' &&
          options.variables.input.accountingDate === '2026-10-15' &&
          options.variables.input.dateFrom === null &&
          options.variables.input.dateTo === null,
      ),
    ).toBe(true);
  });
  it.each([
    '&financeExportCurrency=XYZ&financeExportDateFrom=2026-10-01&financeExportDateTo=2026-10-28',
    '&financeExportCurrency=USD&financeExportDateFrom=2026-02-30&financeExportDateTo=2026-10-28',
    '&financeExportCurrency=USD&financeExportDateFrom=2026-10-28&financeExportDateTo=2026-10-01',
    '&financeExportCurrency=USD&financeExportDateFrom=2026-10-01',
    '&financeExportCurrency=USD&financeExportDateFrom=2026-10-01&financeExportDateTo=2026-10-28&financeExportServiceMonth=2026-09',
  ])(
    'requires a fresh source selection for invalid URL filters %s',
    (sourceParams) => {
      setup('review', sourceParams);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'incomplete or invalid',
      );
      expect(
        screen.getByRole('button', { name: 'Choose source period' }),
      ).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'Create export batch' }),
      ).not.toBeInTheDocument();
    },
  );
  it('protects a dirty review during back navigation while retaining the URL source selection after discard', async () => {
    mockPreview.totals.repeatedSourceCount = 1;
    const { router } = setup();
    await chooseCashPeriod();
    const reviewedUrl = router.state.location.search;
    await userEvent.type(
      screen.getByLabelText('Reason for re-export'),
      'Keep this review',
    );
    await act(async () => {
      await router.navigate(-1);
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    expect(router.state.location.search).toBe(reviewedUrl);
    expect(screen.getByLabelText('Reason for re-export')).toHaveValue(
      'Keep this review',
    );
    await act(async () => {
      await router.navigate(-1);
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Discard and continue' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Choose source period' }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate(1);
    });
    expect(await screen.findByLabelText('Reason for re-export')).toHaveValue(
      '',
    );
    expect(router.state.location.search).toBe(reviewedUrl);
  });
  it('describes a replayed profile request using its current version rather than claiming a new save', async () => {
    const latest = { ...mockSnapshot.profiles[0], revision: 3, active: false };
    mockSaveProfile.mockImplementation(async () => {
      mockSnapshot = {
        ...mockSnapshot,
        profiles: [latest],
        selectedProfile: latest,
      };
      return {
        data: {
          saveDeliveryFinanceExportProfile: { profile: latest, replayed: true },
        },
      };
    });
    setup('profiles');
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Check earlier request',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save export profile' }),
    );
    expect(
      await screen.findByText(
        /This profile request was already processed. Its current version is 3/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Export profile saved.')).not.toBeInTheDocument();
    expect(mockRefetch).toHaveBeenCalled();
  });
  it('recovers a committed batch after a lost response using its exact original request despite a changed preview', async () => {
    let committedId = '';
    mockCreate.mockImplementation(
      async ({
        variables,
      }: {
        variables: { input: DeliveryFinanceExportBatchInput };
      }) => {
        const batch = {
          ...financeExportBatchFixture(),
          id: variables.input.id,
        };
        if (!committedId) {
          committedId = batch.id;
          mockSnapshot = {
            ...mockSnapshot,
            batches: [batch],
            selectedBatch: { ...financeExportBatchDetailFixture(), batch },
          };
          mockPreview = {
            ...mockPreview,
            previewToken: 'b'.repeat(64),
            totals: { ...mockPreview.totals, repeatedSourceCount: 1 },
          };
          throw new Error('Connection lost after commit');
        }
        return {
          data: { createDeliveryFinanceExportBatch: { batch, replayed: true } },
        };
      },
    );
    const { router, refresh } = setup();
    await chooseCashPeriod();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create export batch' }),
    );
    expect(
      await screen.findByRole('region', {
        name: 'Earlier batch request recovery',
      }),
    ).toHaveTextContent(committedId);
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeDisabled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const original = mockCreate.mock.calls[0][0].variables.input;
    mockPreviewError = new Error('Current source review unavailable');
    refresh();
    expect(
      screen.queryByRole('region', {
        name: 'Complete export selection totals',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check earlier batch request' }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh export preview' }),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Keep your changes?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(mockPreviewRefetch).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check earlier batch request' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain(
        `financeExportBatch=${committedId}`,
      ),
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1][0].variables.input).toEqual(original);
    expect(original).toEqual(
      expect.objectContaining({
        expectedPreviewToken: 'a'.repeat(64),
        acknowledgeRepeatedSources: false,
        reexportReason: null,
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Download saved CSV' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Batch history' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(mockDownload).not.toHaveBeenCalled();
  });
  it('lets finance readers review and create an exact batch without management controls', async () => {
    mockCanManage = false;
    mockSnapshot.canManage = false;
    const { router } = setup();
    expect(
      screen.queryByRole('button', { name: 'Edit this export profile' }),
    ).not.toBeInTheDocument();
    await chooseCashPeriod();
    expect(
      screen.getByRole('region', { name: 'Complete export selection totals' }),
    ).toHaveTextContent('$800.00');
    expect(
      screen.getByText(
        'Totals cover the complete server-selected period, including rows on other pages.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create export batch' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain(
        `financeExportBatch=${EXPORT_BATCH_ID}`,
      ),
    );
    expect(mockCreate).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({
          currency: 'USD',
          dateFrom: '2026-10-01',
          dateTo: '2026-10-28',
          expectedPreviewToken: 'a'.repeat(64),
        }),
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Download saved CSV' }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Batch history' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.queryByRole('button', { name: 'Record manual import' }),
    ).not.toBeInTheDocument();
    expect(router.state.location.search).toContain('financeCurrency=EUR');
  });
  it('shows exact mapping and precision blockers before source rows and prevents saving', async () => {
    mockPreview = {
      ...mockPreview,
      canCreate: false,
      errors: ['MISSING_ACCOUNT', 'PRECISION_UNSUPPORTED'],
      totals: { ...mockPreview.totals, errorCount: 2 },
    };
    setup();
    await chooseCashPeriod();
    expect(
      screen.getByText('Choose an account mapping for this row.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/needs more decimal places/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeDisabled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('does not mount a new review from cached preview data while the fresh request is pending', async () => {
    mockPreviewLoading = true;
    const view = setup();
    await chooseCashPeriod();
    expect(
      screen.queryByRole('button', { name: 'Create export batch' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Client payment ·/)).not.toBeInTheDocument();
    mockPreviewLoading = false;
    view.refresh();
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeEnabled();
  });
  it('explains a complete selection cap failure without offering a partial export', async () => {
    mockPreviewError = new Error(
      'This export selection exceeds 2,000 rows or exclusions.',
    );
    setup();
    await chooseCashPeriod();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a narrower source period',
    );
    expect(
      screen.queryByRole('button', { name: 'Create export batch' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change source selection' }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Change source selection' }),
    );
    expect(screen.getByLabelText('Cash date from')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Cash date to')).toHaveValue('2026-10-28');
  });
  it('unmounts stale preview figures on failure while retaining the exact protected reason draft', async () => {
    mockPreview.totals.repeatedSourceCount = 1;
    const view = setup();
    await chooseCashPeriod();
    await userEvent.type(
      screen.getByLabelText('Reason for re-export'),
      'Keep my accountant review',
    );
    const reason = screen.getByLabelText('Reason for re-export');
    mockPreviewError = new Error('offline');
    view.refresh();
    expect(
      screen.queryByRole('region', {
        name: 'Complete export selection totals',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Client payment ·/)).not.toBeInTheDocument();
    expect(reason).toBeInTheDocument();
    expect(reason).not.toBeVisible();
    expect(reason).toBeDisabled();
    mockPreviewError = undefined;
    view.refresh();
    expect(screen.getByLabelText('Reason for re-export')).toBe(reason);
    expect(reason).toHaveValue('Keep my accountant review');
  });
  it('keeps management draft read-only on manage revocation and clears it after confirmed read loss', async () => {
    const view = setup('profiles');
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Preserve manager note',
    );
    const reason = screen.getByLabelText('Reason for profile change');
    mockCanManage = false;
    view.refresh();
    expect(reason).toBeDisabled();
    expect(reason).toHaveValue('Preserve manager note');
    mockCanRead = false;
    view.refresh();
    expect(reason).not.toBeInTheDocument();
    mockCanRead = true;
    mockCanManage = true;
    view.refresh();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    expect(screen.getByLabelText('Reason for profile change')).toHaveValue('');
  });
  it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
    'hides all read-only data when query %s does not match current identity',
    (field) => {
      const view = setup('batches');
      expect(screen.getByText(/Client payment ·/)).toBeInTheDocument();
      mockSnapshot = { ...mockSnapshot, [field]: 'foreign' };
      view.refresh();
      expect(screen.queryByText(/Client payment ·/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Download saved CSV' }),
      ).not.toBeInTheDocument();
    },
  );
  it('retains a hidden same-identity form during access failure and disposes it on identity change', async () => {
    const view = setup('profiles');
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Private configuration',
    );
    const reason = screen.getByLabelText('Reason for profile change');
    mockReady = false;
    view.refresh();
    expect(reason).not.toBeVisible();
    expect(reason).toBeDisabled();
    expect(screen.queryByText('Profile history')).not.toBeInTheDocument();
    mockScope = 'foreign:member';
    view.refresh();
    expect(reason).not.toBeInTheDocument();
  });
  it('guards dirty profile navigation and discards only after an explicit decision', async () => {
    const { router } = setup('profiles');
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Unsaved mapping review',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Batch history' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Keep your changes?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Reason for profile change')).toHaveValue(
      'Unsaved mapping review',
    );
    expect(router.state.location.search).toContain(
      'financeExportSection=profiles',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Batch history' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain(
        'financeExportSection=batches',
      ),
    );
    await userEvent.click(screen.getByRole('link', { name: 'Profiles' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit this export profile' }),
    );
    expect(screen.getByLabelText('Reason for profile change')).toHaveValue('');
  });
  it('detects source changes after review and keeps the re-export reason until guarded reload', async () => {
    mockPreview.totals.repeatedSourceCount = 1;
    const view = setup();
    await chooseCashPeriod();
    await userEvent.type(
      screen.getByLabelText('Reason for re-export'),
      'Review amended source',
    );
    mockPreview = { ...mockPreview, previewToken: 'b'.repeat(64) };
    view.refresh();
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Reason for re-export')).toHaveValue(
      'Review amended source',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh export preview' }),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Keep your changes?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(mockPreviewRefetch).not.toHaveBeenCalled();
  });
  it('keeps complete totals when paging visible preview rows and separately pages exclusions', async () => {
    mockPreview.nextRowKey = 'next-row';
    mockPreview.nextExclusionKey = 'next-exclusion';
    setup();
    await chooseCashPeriod();
    await userEvent.click(
      screen.getByRole('button', { name: 'More preview rows' }),
    );
    expect(
      mockQuery.mock.calls.some(
        ([, options]) => options.variables.input.afterRowKey === 'next-row',
      ),
    ).toBe(true);
    expect(
      within(
        screen.getByRole('region', {
          name: 'Complete export selection totals',
        }),
      ).getByText('$800.00'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'More excluded sources' }),
    );
    expect(
      mockQuery.mock.calls.some(
        ([, options]) =>
          options.variables.input.afterExclusionKey === 'next-exclusion',
      ),
    ).toBe(true);
  });
  it('uses a truthful review fallback for unknown section URLs and retains unrelated filters', () => {
    const { router } = setup('not-a-section');
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      expect.stringContaining('financeCurrency=EUR'),
    );
    expect(router.state.location.search).toContain('not-a-section');
  });
});
