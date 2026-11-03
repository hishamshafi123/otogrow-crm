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
import { Headers } from 'cross-fetch';
import { CreativeReviewPlayer } from '@/delivery/creative/review/CreativeReviewPlayer';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/review/creativeReviewStyles', () => ({
  StyledReviewPlayer: 'section',
}));
jest.mock('jotai', () => ({ useStore: () => ({ get: () => null }) }));
const mockFetch = jest.fn();
const mockCreateUrl = jest.fn();
const mockRevokeUrl = jest.fn();
const asset = {
  id: 'asset-one',
  name: 'Final cut.mp4',
  mimeType: 'video/mp4',
  size: 4,
};
const response = () => ({
  ok: true,
  headers: new Headers({ 'Content-Type': 'video/mp4', 'Content-Length': '4' }),
  blob: async () => new Blob(['test'], { type: 'video/mp4' }),
});
const player = (seek?: { seconds: number; requestId: number }) => (
  <I18nProvider i18n={i18n}>
    <CreativeReviewPlayer
      taskId="task-one"
      asset={asset}
      label="Submission 2"
      seek={seek}
    />
  </I18nProvider>
);
const setup = (seek?: { seconds: number; requestId: number }) =>
  render(player(seek));
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  Object.assign(globalThis, { fetch: mockFetch });
  Object.assign(URL, {
    createObjectURL: mockCreateUrl,
    revokeObjectURL: mockRevokeUrl,
  });
  mockCreateUrl.mockReturnValue('blob:permitted');
  mockFetch.mockResolvedValue(response());
});
it('loads only after an explicit action, exposes the original and releases local bytes on unload', async () => {
  setup();
  expect(mockFetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  const download = await screen.findByRole('link', {
    name: 'Download original',
  });
  expect(download).toHaveAttribute('href', 'blob:permitted');
  expect(download).toHaveAttribute('download', 'Final cut.mp4');
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/delivery-creative/task-one/assets/asset-one'),
    expect.objectContaining({
      credentials: 'include',
      signal: expect.any(AbortSignal),
    }),
  );
  expect(document.querySelector('video')).not.toHaveAttribute('autoplay');
  await userEvent.click(screen.getByRole('button', { name: 'Unload asset' }));
  expect(
    screen.queryByRole('link', { name: 'Download original' }),
  ).not.toBeInTheDocument();
  expect(mockRevokeUrl).toHaveBeenCalledWith('blob:permitted');
});
it('cancels a pending load and ignores its later response', async () => {
  let finish: (value: ReturnType<typeof response>) => void = () => undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel asset load' }),
  );
  expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => finish(response()));
  expect(mockCreateUrl).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  ).toBeEnabled();
});
it('rejects mismatched bytes and allows an explicit retry', async () => {
  mockFetch.mockResolvedValueOnce({
    ...response(),
    headers: new Headers({ 'Content-Type': 'text/html' }),
  });
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'file type does not match',
  );
  expect(mockCreateUrl).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry Submission 2' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Download original' }),
  ).toBeInTheDocument();
});
it('aborts on removal and releases an already loaded preview', async () => {
  const view = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  await screen.findByRole('link', { name: 'Download original' });
  view.unmount();
  await waitFor(() =>
    expect(mockRevokeUrl).toHaveBeenCalledWith('blob:permitted'),
  );
  expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
});
it('explains an out-of-range anchor without clamping or unloading and accepts a later valid seek', async () => {
  const view = setup({ seconds: 20, requestId: 1 });
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  await screen.findByRole('link', { name: 'Download original' });
  const video = document.querySelector('video');
  if (!video) throw new Error('Loaded video is required');
  Object.defineProperties(video, {
    duration: { configurable: true, value: 5 },
    readyState: { configurable: true, value: 1 },
  });
  fireEvent.loadedMetadata(video);
  expect(screen.getByRole('status')).toHaveTextContent(
    "Saved time 0:20 exceeds this file's loaded duration 0:05",
  );
  expect(video.currentTime).toBe(0);
  expect(
    screen.getByRole('link', { name: 'Download original' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry Submission 2' }),
  ).not.toBeInTheDocument();
  view.rerender(player({ seconds: 3, requestId: 2 }));
  expect(video.currentTime).toBe(3);
  expect(screen.queryByText(/exceeds this file/)).not.toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
it('keeps a pending seek until native metadata supplies a finite valid duration', async () => {
  setup({ seconds: 2, requestId: 1 });
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Submission 2' }),
  );
  await screen.findByRole('link', { name: 'Download original' });
  const video = document.querySelector('video');
  if (!video) throw new Error('Loaded video is required');
  expect(screen.getByRole('status')).toHaveTextContent(
    'Playback metadata is not ready',
  );
  expect(video.currentTime).toBe(0);
  Object.defineProperties(video, {
    duration: { configurable: true, value: 8 },
    readyState: { configurable: true, value: 1 },
  });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(2);
  expect(
    screen.queryByText(/Playback metadata is not ready/),
  ).not.toBeInTheDocument();
});
