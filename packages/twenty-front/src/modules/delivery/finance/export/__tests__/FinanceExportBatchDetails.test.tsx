import { type ReactElement, type useState as useReactState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { saveAs } from 'file-saver';
import { type DeliveryFinanceExportDownloadQuery } from '~/generated-metadata/graphql';
import { FinanceExportBatchDetails } from '@/delivery/finance/export/FinanceExportBatchDetails';
import { type FinanceExportHistory as FinanceExportHistorySnapshot } from '@/delivery/finance/export/finance-export.types';
import { financeExportBatchDetailFixture } from '@/delivery/finance/export/__tests__/finance-export.fixtures';

const mockDownload = jest.fn();
const mockImport = jest.fn();
let mockReady = true;
let mockCanRead = true;
let mockScope = 'workspace:member';
let mockHistoryResponse: FinanceExportHistorySnapshot;
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/delivery/finance/export/financeExportStyles', () => ({
  StyledExportRow: 'article',
  StyledExportTotals: 'dl',
}));
jest.mock('@apollo/client/react', () => {
  const { useState } = jest.requireActual<{ useState: typeof useReactState }>(
    'react',
  );
  return {
    useLazyQuery: () => [mockDownload, { loading: false }],
    useQuery: () => {
      const [history] = useState(mockHistoryResponse);
      return {
        data: { deliveryFinanceExportHistory: history },
        loading: false,
        error: undefined,
        refetch: jest.fn().mockResolvedValue({}),
      };
    },
  };
});
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    scope: mockScope,
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
const CSV = '\uFEFFReference,Amount\r\n"München, client",1000.000000\r\n';
const destination = (changes: Record<string, string | null>) =>
  `/delivery?${new URLSearchParams(Object.fromEntries(Object.entries(changes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))}`;
const batchDetail = () => {
  const detail = financeExportBatchDetailFixture();
  detail.batch.byteLength = new Blob([CSV]).size;
  return detail;
};
const response = (
  detail = batchDetail(),
): DeliveryFinanceExportDownloadQuery => ({
  deliveryFinanceExportDownload: {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    batchId: detail.batch.id,
    fileName: 'accountant.csv',
    mimeType: 'text/csv;charset=utf-8',
    encoding: 'UTF-8',
    csv: CSV,
    checksum: detail.batch.checksum,
    byteLength: detail.batch.byteLength,
  },
});
const component = (
  detail = batchDetail(),
  enabled = true,
  canManage = false,
) => (
  <FinanceExportBatchDetails
    detail={detail}
    enabled={enabled}
    canManage={canManage}
    afterRowKey={null}
    destination={destination}
    onImport={mockImport}
  />
);
const setup = (element: ReactElement) => {
  const wrap = (content: ReactElement) => (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>{content}</MemoryRouter>
    </I18nProvider>
  );
  const view = render(wrap(element));
  return {
    ...view,
    replace: (content: ReactElement) => view.rerender(wrap(content)),
  };
};
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockCanRead = true;
  mockScope = 'workspace:member';
  mockHistoryResponse = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    events: [],
    nextBeforeId: null,
  };
  jest.clearAllMocks();
  mockDownload.mockResolvedValue({ data: response() });
});

describe('immutable accountant batch', () => {
  it('refreshes latest history after manual import confirmation and reversal without changing the saved file', () => {
    const detail = batchDetail();
    const created = {
      id: '7d64d42b-5501-45b4-91c8-2de676b2ba32',
      sourceType: 'BATCH',
      sourceId: detail.batch.id,
      action: 'FINANCE_EXPORT_BATCH_CREATED',
      revision: 1,
      actorId: 'reader',
      actorName: 'Finance reader',
      createdAt: '2026-10-28T10:00:00Z',
      reason: 'Reviewed immutable handoff.',
      importStatus: 'NOT_CONFIRMED',
      reference: null,
      evidenceUrl: null,
      checksum: detail.batch.checksum,
      profile: null,
    };
    mockHistoryResponse.events = [created];
    const view = setup(component(detail, true, true));
    expect(
      screen.getByRole('article', { name: 'Immutable batch created' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('article', { name: 'Manual import recorded' }),
    ).not.toBeInTheDocument();
    const confirmed = {
      ...created,
      id: 'e59c8f30-f57a-4e44-a790-f677774e88a2',
      action: 'FINANCE_EXPORT_IMPORT_CONFIRMED',
      revision: 2,
      actorName: 'Amna',
      importStatus: 'CONFIRMED',
      reference: 'accountant-import-42',
    };
    mockHistoryResponse = {
      ...mockHistoryResponse,
      events: [confirmed, created],
    };
    const confirmedDetail = {
      ...detail,
      batch: {
        ...detail.batch,
        revision: 2,
        importStatus: 'CONFIRMED',
        importReference: 'accountant-import-42',
      },
    };
    view.replace(component(confirmedDetail, true, true));
    expect(
      screen.getByRole('article', { name: 'Manual import recorded' }),
    ).toHaveTextContent('Amna');
    const reversed = {
      ...confirmed,
      id: '49bdb1bd-c8e1-475f-98ce-d8fd7e7ddd0d',
      action: 'FINANCE_EXPORT_IMPORT_REVERSED',
      revision: 3,
      importStatus: 'REVERSED',
      reason: 'Corrected the manual import confirmation.',
    };
    mockHistoryResponse = {
      ...mockHistoryResponse,
      events: [reversed, confirmed, created],
    };
    view.replace(
      component(
        {
          ...confirmedDetail,
          batch: {
            ...confirmedDetail.batch,
            revision: 3,
            importStatus: 'REVERSED',
          },
        },
        true,
        true,
      ),
    );
    expect(
      screen.getByRole('article', {
        name: 'Manual import confirmation reversed',
      }),
    ).toHaveTextContent('Corrected the manual import confirmation.');
    expect(
      screen.getByRole('article', { name: 'Immutable batch created' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(`SHA-256: ${detail.batch.checksum}`, {
        selector: 'p',
      }),
    ).toHaveLength(4);
  });
  it('downloads the exact stored Unicode CSV bytes without regenerating headers or rows', async () => {
    setup(component());
    await userEvent.click(
      screen.getByRole('button', { name: 'Download saved CSV' }),
    );
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
    const [blob, name] = jest.mocked(saveAs).mock.calls[0];
    expect(name).toBe('accountant.csv');
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error('Expected stored CSV Blob');
    expect(blob.size).toBe(new Blob([CSV]).size);
    expect(await readBlob(blob)).toBe(CSV.slice(1));
    expect(
      screen.getByText(/External import is still a separate manual step/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Import not confirmed/)).toBeInTheDocument();
  });
  it('retries the same saved batch and retains its original checksum', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    setup(component());
    await userEvent.click(
      screen.getByRole('button', { name: 'Download saved CSV' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Retry this same batch',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Download saved CSV' }),
    );
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
    expect(mockDownload.mock.calls[1][0]).toEqual(
      mockDownload.mock.calls[0][0],
    );
    expect(screen.getByText(`SHA-256: ${'c'.repeat(64)}`)).toBeInTheDocument();
  });
  it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
    'rejects a download response for a foreign %s',
    async (field) => {
      const data = response();
      data.deliveryFinanceExportDownload[field] = 'foreign';
      mockDownload.mockResolvedValue({ data });
      setup(component());
      await userEvent.click(
        screen.getByRole('button', { name: 'Download saved CSV' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'could not be verified',
      );
      expect(saveAs).not.toHaveBeenCalled();
    },
  );
  it.each(['checksum', 'byteLength', 'csv'] as const)(
    'rejects inconsistent stored %s rather than writing an unverified file',
    async (field) => {
      const data = response();
      if (field === 'byteLength')
        data.deliveryFinanceExportDownload.byteLength += 1;
      else data.deliveryFinanceExportDownload[field] = 'changed';
      mockDownload.mockResolvedValue({ data });
      setup(component());
      await userEvent.click(
        screen.getByRole('button', { name: 'Download saved CSV' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'could not be verified',
      );
      expect(saveAs).not.toHaveBeenCalled();
    },
  );
  it.each(['access', 'identity', 'unmount'] as const)(
    'does not download a late response after %s changes',
    async (change) => {
      let resolve: (result: {
        data: DeliveryFinanceExportDownloadQuery;
      }) => void = () => undefined;
      mockDownload.mockImplementation(
        () =>
          new Promise((complete) => {
            resolve = complete;
          }),
      );
      const view = setup(component());
      await userEvent.click(
        screen.getByRole('button', { name: 'Download saved CSV' }),
      );
      if (change === 'access') {
        mockCanRead = false;
        view.replace(component());
      } else if (change === 'identity') {
        mockScope = 'foreign:member';
        view.replace(component());
      } else view.unmount();
      await act(async () => resolve({ data: response() }));
      expect(saveAs).not.toHaveBeenCalled();
    },
  );
  it('shows exported and current source status separately without changing saved totals', async () => {
    const detail = batchDetail();
    detail.rows[0] = {
      ...detail.rows[0],
      sourceStatus: 'ACTIVE',
      currentStatus: 'VOID',
      sourceChanged: true,
    };
    detail.currentWarnings = ['PREVIOUS_EXPORT_NOW_EXCLUDED'];
    setup(component(detail));
    expect(
      screen.getByText(/Exported status: Active · Current status: Voided/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/original CSV remains unchanged/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Complete export selection totals' }),
    ).toHaveTextContent('$800.00');
    expect(
      screen.getByRole('link', { name: 'Open financial source' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining(`financeCash=${detail.rows[0].sourceId}`),
    );
  });
  it('preserves unknown excluded amounts and does not portray them as zero', () => {
    const detail = batchDetail();
    detail.exclusions = [
      {
        key: 'invalid',
        sourceId: null,
        title: 'Unconfirmed amount',
        sourceType: 'CASH',
        sourceStatus: null,
        code: 'INVALID_SOURCE',
        amountMicros: null,
        blocking: true,
        previousBatchCount: 0,
      },
    ];
    setup(component(detail));
    expect(
      screen.getByRole('region', { name: 'Sources excluded from export' }),
    ).toHaveTextContent('Amount not confirmed');
    expect(
      screen.getByRole('region', { name: 'Sources excluded from export' }),
    ).not.toHaveTextContent('$0.00');
  });
  it('gates manual status controls by current management permission', async () => {
    const view = setup(component());
    expect(
      screen.queryByRole('button', { name: 'Record manual import' }),
    ).not.toBeInTheDocument();
    view.replace(component(batchDetail(), true, true));
    await userEvent.click(
      screen.getByRole('button', { name: 'Record manual import' }),
    );
    expect(mockImport).toHaveBeenCalledTimes(1);
    const confirmed = batchDetail();
    confirmed.batch.importStatus = 'CONFIRMED';
    view.replace(component(confirmed, true, true));
    expect(
      screen.getByRole('button', {
        name: 'Reverse manual import confirmation',
      }),
    ).toBeInTheDocument();
  });
  it('unmounts all read-only financial figures when parent availability is lost', () => {
    const view = setup(component());
    expect(screen.getByText(/Client payment ·/)).toBeInTheDocument();
    view.replace(component(batchDetail(), false));
    expect(screen.queryByText(/Client payment ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SHA-256/)).not.toBeInTheDocument();
  });
});
