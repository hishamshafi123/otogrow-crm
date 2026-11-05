import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeUnusedUploads } from '@/delivery/knowledge/assets/KnowledgeUnusedUploads';
import {
  type KnowledgeAssetContext,
  type KnowledgeUploadReceipt,
} from '@/delivery/knowledge/assets/knowledge-assets.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/knowledge/assets/knowledgeAssetStyles', () => ({
  StyledKnowledgeAttachments: 'section',
}));
jest.mock('@/delivery/knowledge/assets/KnowledgeAssetFile', () => ({
  KnowledgeAssetFile: () => <p>Private file preview</p>,
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftStatus: jest.fn(),
}));
const mockQuery = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
let mockItems: KnowledgeUploadReceipt[];
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery }),
  useMutation: () => [mockMutate],
  useQuery: (_document: unknown, options: { skip: boolean }) => ({
    data: options.skip
      ? undefined
      : {
          deliveryKnowledgeUploads: {
            workspaceId: 'workspace',
            memberId: 'member',
            userWorkspaceId: 'user-workspace',
            projectId: 'project',
            items: mockItems,
            nextCursor: null,
          },
        },
    loading: false,
    error: undefined,
    networkStatus: 7,
    refetch: mockRefetch,
  }),
}));
const context: KnowledgeAssetContext = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'user-workspace',
  projectId: 'project',
  projectRevision: 1,
  companyId: 'company',
  sourceId: 'source',
  sourceRevision: 0,
  scope: 'scope:company:1',
};
const receipt: KnowledgeUploadReceipt = {
  id: 'upload',
  requestId: 'upload',
  workspaceId: context.workspaceId,
  projectId: context.projectId,
  sourceId: context.sourceId,
  companyId: context.companyId,
  sourceRevision: 0,
  name: 'Logo.png',
  mimeType: 'image/png',
  size: 4,
  sha256: 'a'.repeat(64),
  uploadedBy: context.memberId,
  uploaderUserWorkspaceId: context.userWorkspaceId,
  createdAt: '2026-11-05T00:00:00Z',
  state: 'READY',
  canRecover: false,
  canDiscard: true,
  cleanupPending: false,
  failureReason: null,
  availability: 'CURRENT',
  canAttach: true,
};
const result = (current = receipt) => ({
  workspaceId: context.workspaceId,
  memberId: context.memberId,
  userWorkspaceId: context.userWorkspaceId,
  projectId: context.projectId,
  sourceId: context.sourceId,
  receipt: current,
});
const use = jest.fn();
const denied = jest.fn();
const page = (enabled = true, projectWide = false) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>
      <KnowledgeUnusedUploads
        context={context}
        enabled={enabled}
        onUse={use}
        onAuthorityLost={denied}
        projectWide={projectWide}
      />
    </MemoryRouter>
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  mockItems = [receipt];
  mockRefetch.mockResolvedValue({});
});

it('links a project-wide upload to its original recovery route without creating or saving a source', async () => {
  render(page(true, true));
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  const link = screen.getByRole('link', { name: 'Recover draft for Logo.png' });
  const destination = new URL(
    link.getAttribute('href')!,
    'https://example.com',
  );
  expect(destination.searchParams.get('project')).toBe('project');
  expect(destination.searchParams.get('knowledgeCreate')).toBe('source');
  expect(destination.searchParams.has('source')).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
});
it('offers an explicit draft binding for a current private file', async () => {
  render(page());
  expect(screen.queryByText('Logo.png')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  expect(use).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use Logo.png in this draft' }),
  );
  expect(use).toHaveBeenCalledWith(receipt);
});
it('redacts a prior-brand upload and offers only cleanup without preview or binding', async () => {
  const earlier: KnowledgeUploadReceipt = {
    ...receipt,
    companyId: 'earlier-company',
    name: 'Never expose earlier client logo.png',
    availability: 'PREVIOUS_COMPANY',
    canAttach: false,
    canRecover: false,
  };
  mockItems = [earlier];
  mockMutate.mockResolvedValue({
    data: {
      discardDeliveryKnowledgeUpload: result({
        ...earlier,
        state: 'DISCARDED',
      }),
    },
  });
  render(page());
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  expect(screen.getByText('Unused upload from an earlier brand')).toBeVisible();
  expect(screen.queryByText(earlier.name)).not.toBeInTheDocument();
  expect(screen.queryByText('Private file preview')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Use .* in this draft/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Recover stored upload' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Discard unused Unused upload from an earlier brand',
    }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        projectId: 'project',
        sourceId: 'source',
        requestId: 'upload',
        sha256: receipt.sha256,
      },
    },
  });
  expect(
    await screen.findByText(/Current upload status checked/),
  ).toBeVisible();
});
it('requires local status reconciliation after an uncertain discard, without resending it', async () => {
  mockMutate.mockRejectedValue(new Error('Response lost'));
  render(page());
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard unused Logo.png' }),
  );
  expect(
    await screen.findByText(/file action could not be confirmed/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Discard unused Logo.png' }),
  ).not.toBeInTheDocument();
  mockQuery.mockResolvedValue({
    data: {
      deliveryKnowledgeUpload: result({ ...receipt, state: 'DISCARDED' }),
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check upload status' }),
  );
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledTimes(1);
});
it('ignores a late discard response after current project access is unavailable', async () => {
  let finish: (value: unknown) => void = () => undefined;
  mockMutate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(page());
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard unused Logo.png' }),
  );
  view.rerender(page(false));
  expect(
    screen.queryByText(/Unused uploads could not be checked/),
  ).not.toBeInTheDocument();
  await act(async () =>
    finish({ data: { discardDeliveryKnowledgeUpload: result() } }),
  );
  expect(
    screen.queryByRole('button', { name: 'Check upload status' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Logo.png')).not.toBeInTheDocument();
  expect(mockRefetch).not.toHaveBeenCalled();
});
it('does not show private uploads returned for another uploader', async () => {
  mockItems = [{ ...receipt, uploadedBy: 'other-member' }];
  render(page());
  await userEvent.click(screen.getByText('Unused brand uploads'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check unused uploads' }),
  );
  expect(screen.queryByText('Logo.png')).not.toBeInTheDocument();
  expect(screen.getByText(/Unused uploads could not be checked/)).toBeVisible();
});
