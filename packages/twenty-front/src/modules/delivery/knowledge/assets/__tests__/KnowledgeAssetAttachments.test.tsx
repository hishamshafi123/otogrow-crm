import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgeAssetAttachments } from '@/delivery/knowledge/assets/KnowledgeAssetAttachments';
import {
  type KnowledgeUploadRequest,
  type KnowledgeAssetContext,
  type KnowledgeAssetSelection,
} from '@/delivery/knowledge/assets/knowledge-assets.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/knowledge/assets/knowledgeAssetStyles', () => ({
  StyledKnowledgeAttachments: 'section',
  StyledKnowledgeSelectedFile: 'div',
}));
jest.mock('@/delivery/knowledge/assets/KnowledgeAssetFile', () => ({
  KnowledgeAssetFile: () => null,
}));
jest.mock('@/delivery/knowledge/assets/KnowledgeUnusedUploads', () => ({
  KnowledgeUnusedUploads: () => null,
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftStatus: jest.fn(),
}));
jest.mock('jotai', () => ({ useStore: () => ({ get: () => null }) }));
jest.mock('@/delivery/knowledge/assets/knowledge-file-bytes', () => ({
  hashKnowledgeBytes: async () => 'a'.repeat(64),
  validateKnowledgeFile: () => null,
}));
const mockQuery = jest.fn();
const mockRecover = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery }),
  useMutation: () => [mockRecover, { loading: false }],
}));
const mockFetch = jest.fn();
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
const receipt = (request: KnowledgeUploadRequest) => ({
  id: request.requestId,
  requestId: request.requestId,
  workspaceId: context.workspaceId,
  projectId: context.projectId,
  sourceId: context.sourceId,
  companyId: context.companyId,
  sourceRevision: 0,
  name: request.name,
  mimeType: 'image/png',
  size: request.size,
  sha256: request.sha256,
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
});
const result = (request: KnowledgeUploadRequest) => ({
  workspaceId: context.workspaceId,
  memberId: context.memberId,
  userWorkspaceId: context.userWorkspaceId,
  projectId: context.projectId,
  sourceId: context.sourceId,
  receipt: receipt(request),
});
const change = jest.fn();
const blocking = jest.fn();
const denied = jest.fn();
const page = (enabled = true, current = context) => (
  <I18nProvider i18n={i18n}>
    <KnowledgeAssetAttachments
      context={current}
      selections={[]}
      enabled={enabled}
      onChange={change}
      onBlockingChange={blocking}
      onAuthorityLost={denied}
    />
  </I18nProvider>
);
const select = async (name = 'Logo.png') => {
  const file = new File(['logo'], name, { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
  await userEvent
    .setup({ applyAccept: false })
    .upload(screen.getByLabelText('Choose a brand file'), file);
  await screen.findByRole('button', { name: 'Upload privately' });
};
const requestFromFetch = (index = 0) =>
  JSON.parse(
    (mockFetch.mock.calls[index][1].body as FormData).get('input') as string,
  ) as KnowledgeUploadRequest;
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  Object.assign(globalThis, { fetch: mockFetch });
  mockFetch.mockImplementation(async (_url, options: { body: FormData }) => {
    const request = JSON.parse(
      options.body.get('input') as string,
    ) as KnowledgeUploadRequest;
    return { ok: true, status: 200, json: async () => result(request) };
  });
});
it('uploads privately and attaches only after the exact ready file is explicitly selected', async () => {
  render(page());
  await select();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(blocking).toHaveBeenLastCalledWith(true);
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  expect(change).not.toHaveBeenCalled();
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Use uploaded file in this draft',
    }),
  );
  expect(change).toHaveBeenCalledWith([
    {
      asset: expect.objectContaining({
        id: requestFromFetch().requestId,
        name: 'Logo.png',
        sha256: 'a'.repeat(64),
      }),
      version: null,
    },
  ]);
  expect(blocking).toHaveBeenLastCalledWith(false);
});
it('recovers a lost upload response locally without dispatching another upload', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Lost response'));
  render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  expect(await screen.findByText(/upload outcome is unknown/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Upload privately' }),
  ).not.toBeInTheDocument();
  mockQuery.mockResolvedValue({
    data: { deliveryKnowledgeUpload: result(requestFromFetch()) },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check this upload' }),
  );
  await screen.findByRole('button', {
    name: 'Use uploaded file in this draft',
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
});
it('allows a fresh upload identity only after an exact status response confirms absence', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Lost response'));
  render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  const first = requestFromFetch();
  mockQuery.mockResolvedValue({
    data: { deliveryKnowledgeUpload: { ...result(first), receipt: null } },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check this upload' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Start a new upload attempt' }),
  );
  await screen.findByRole('button', {
    name: 'Use uploaded file in this draft',
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(requestFromFetch(1).requestId).not.toBe(first.requestId);
  expect(requestFromFetch(1).sha256).toBe(first.sha256);
});
it('does not expose a ready receipt from a different source or actor', async () => {
  mockFetch.mockImplementation(async (_url, options: { body: FormData }) => {
    const request = JSON.parse(
      options.body.get('input') as string,
    ) as KnowledgeUploadRequest;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...result(request), memberId: 'another-member' }),
    };
  });
  render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  await screen.findByText(/upload outcome is unknown/);
  expect(
    screen.queryByRole('button', { name: 'Use uploaded file in this draft' }),
  ).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
it('ignores a late upload after current source access becomes unavailable', async () => {
  let finish: (value: {
    ok: boolean;
    status: number;
    json: () => Promise<ReturnType<typeof result>>;
  }) => void = () => undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  const request = requestFromFetch();
  view.rerender(page(false));
  await act(async () =>
    finish({ ok: true, status: 200, json: async () => result(request) }),
  );
  expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(change).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Use uploaded file in this draft' }),
  ).not.toBeInTheDocument();
});

it('preserves a quota rejection through the required status check before offering a new upload', async () => {
  const reason =
    'This project has reached its brand-file storage limit. Discard unused private uploads; approved version history stays protected.';
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ message: reason, statusCode: 400 }),
  });
  render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(reason);
  expect(
    screen.queryByRole('button', { name: 'Start a new upload attempt' }),
  ).not.toBeInTheDocument();
  mockQuery.mockResolvedValue({
    data: {
      deliveryKnowledgeUpload: { ...result(requestFromFetch()), receipt: null },
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check this upload' }),
  );
  await screen.findByRole('button', { name: 'Start a new upload attempt' });
  expect(screen.getByRole('alert')).toHaveTextContent(reason);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Logo.png · 1 KB')).toBeVisible();
});

it('ignores late decoded upload data after its company boundary changes', async () => {
  let decode: (value: ReturnType<typeof result>) => void = () => undefined;
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      new Promise((resolve) => {
        decode = resolve;
      }),
  });
  const view = render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  const request = requestFromFetch();
  view.rerender(
    page(true, {
      ...context,
      companyId: 'other-company',
      scope: 'other-company:2',
    }),
  );
  await act(async () => decode(result(request)));
  expect(
    screen.queryByRole('button', { name: 'Use uploaded file in this draft' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Logo.png · 1 KB')).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});

it('normalizes a padded filename consistently with its durable upload receipt', async () => {
  render(page());
  await select('  Logo.png  ');
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  expect(requestFromFetch().name).toBe('Logo.png');
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Use uploaded file in this draft',
    }),
  );
  expect(change).toHaveBeenCalledWith([
    {
      asset: expect.objectContaining({
        name: 'Logo.png',
        sha256: 'a'.repeat(64),
      }),
      version: null,
    },
  ]);
});

it('moves lost keyboard focus to the explicit next action after an upload completes', async () => {
  render(page());
  await select();
  screen.getByRole('button', { name: 'Upload privately' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(
    await screen.findByRole('button', {
      name: 'Use uploaded file in this draft',
    }),
  ).toHaveFocus();
  expect(change).not.toHaveBeenCalled();
});

it('does not steal focus when someone moves to another control while the upload is running', async () => {
  let finish: (value: {
    ok: boolean;
    status: number;
    json: () => Promise<ReturnType<typeof result>>;
  }) => void = () => undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <>
      {page()}
      <button type="button">Another control</button>
    </>,
  );
  await select();
  screen.getByRole('button', { name: 'Upload privately' }).focus();
  await userEvent.keyboard('{Enter}');
  screen.getByRole('button', { name: 'Another control' }).focus();
  const request = requestFromFetch();
  await act(async () =>
    finish({ ok: true, status: 200, json: async () => result(request) }),
  );
  await screen.findByRole('button', {
    name: 'Use uploaded file in this draft',
  });
  expect(screen.getByRole('button', { name: 'Another control' })).toHaveFocus();
});

const AttachedFiles = () => {
  const [selections, setSelections] = useState<KnowledgeAssetSelection[]>([]);
  return (
    <I18nProvider i18n={i18n}>
      <KnowledgeAssetAttachments
        context={context}
        selections={selections}
        enabled
        onChange={setSelections}
        onBlockingChange={blocking}
        onAuthorityLost={denied}
      />
    </I18nProvider>
  );
};
it('focuses the attached file group after the explicit Use action removes its button', async () => {
  render(<AttachedFiles />);
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload privately' }),
  );
  await screen.findByRole('button', {
    name: 'Use uploaded file in this draft',
  });
  await userEvent.keyboard('{Enter}');
  expect(
    screen.getByRole('group', { name: 'Attached file Logo.png' }),
  ).toHaveFocus();
});
it('returns focus to the chooser after clearing a selected file', async () => {
  render(page());
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear file selection' }),
  );
  expect(screen.getByLabelText('Choose a brand file')).toHaveFocus();
  expect(mockFetch).not.toHaveBeenCalled();
});
