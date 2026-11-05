import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgeAssetFile } from '@/delivery/knowledge/assets/KnowledgeAssetFile';
import { readKnowledgeFileBytes } from '@/delivery/knowledge/assets/knowledge-file-bytes';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/knowledge/assets/knowledgeAssetStyles', () => ({
  StyledKnowledgeAsset: 'article',
}));
jest.mock('jotai', () => ({ useStore: () => ({ get: () => null }) }));
jest.mock('@/delivery/knowledge/assets/knowledge-file-bytes', () => ({
  readKnowledgeFileBytes: jest.fn(),
}));
const mockFetch = jest.fn();
const mockRevoke = jest.fn();
const mockCreate = jest.fn();
const asset = {
  id: 'asset',
  name: 'Brand.pdf',
  mimeType: 'application/pdf',
  size: 4,
  sha256: 'a'.repeat(64),
  uploadedBy: 'member',
  createdAt: '2026-11-05T00:00:00Z',
};
const denied = jest.fn();
const page = (enabled = true, scope = 'project:company:1') => (
  <I18nProvider i18n={i18n}>
    <KnowledgeAssetFile
      sourceId="source"
      selection={{ asset, version: 2 }}
      scope={scope}
      enabled={enabled}
      onAuthorityLost={denied}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  Object.assign(globalThis, { fetch: mockFetch });
  Object.assign(URL, {
    createObjectURL: mockCreate,
    revokeObjectURL: mockRevoke,
  });
  mockCreate.mockReturnValue('blob:exact-file');
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
  jest.mocked(readKnowledgeFileBytes).mockResolvedValue(new Blob(['file']));
});
it('requires an explicit read, uses the exact version route and downloads PDF without embedding it', async () => {
  render(page());
  expect(mockFetch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Load Brand.pdf' }));
  const link = await screen.findByRole('link', { name: 'Download Brand.pdf' });
  expect(link).toHaveAttribute('download', 'Brand.pdf');
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/portal/delivery-knowledge-files/source/2/asset'),
    expect.objectContaining({
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    }),
  );
  expect(document.querySelector('iframe,object,embed')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Close file' }));
  expect(mockRevoke).toHaveBeenCalledWith('blob:exact-file');
});
it('revokes a loaded local URL immediately when project access becomes unavailable', async () => {
  const view = render(page());
  await userEvent.click(screen.getByRole('button', { name: 'Load Brand.pdf' }));
  await screen.findByRole('link', { name: 'Download Brand.pdf' });
  view.rerender(page(false));
  expect(
    screen.queryByRole('link', { name: 'Download Brand.pdf' }),
  ).not.toBeInTheDocument();
  expect(mockRevoke).toHaveBeenCalledWith('blob:exact-file');
});
it('rejects a late file result after the company scope changes', async () => {
  let finish: (value: { ok: boolean; status: number }) => void = () =>
    undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(page());
  await userEvent.click(screen.getByRole('button', { name: 'Load Brand.pdf' }));
  view.rerender(page(true, 'project:other-company:2'));
  await act(async () => finish({ ok: true, status: 200 }));
  expect(mockCreate).not.toHaveBeenCalled();
});
it('treats a permission denial as current authority loss without exposing bytes', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 403 });
  render(page());
  await userEvent.click(screen.getByRole('button', { name: 'Load Brand.pdf' }));
  expect(denied).toHaveBeenCalledTimes(1);
  expect(readKnowledgeFileBytes).not.toHaveBeenCalled();
});
