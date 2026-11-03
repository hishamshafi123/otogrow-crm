import { type ComponentProps } from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryTranscriptImport } from '@/delivery/knowledge/transcript/DeliveryTranscriptImport';
import {
  MAX_TRANSCRIPT_FILE_BYTES,
  MAX_TRANSCRIPT_PREVIEW_CHARACTERS,
} from '@/delivery/knowledge/transcript/transcript-import';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
const mockReadFile = jest.fn();
jest.mock('@/spreadsheet-import/utils/readFilesAsync', () => ({
  readFileAsync: (file: File) => mockReadFile(file),
}));
type ImportProps = ComponentProps<typeof DeliveryTranscriptImport>;
const mockImport = jest.fn();
const TRANSCRIPT =
  'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nAmna: مرحبا, café 🦊\n';
const bytes = (text: string) => {
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
};
const transcriptFile = (text = TRANSCRIPT, name = 'meeting.vtt') =>
  new File([text], name, { type: 'text/vtt' });
const deferredRead = () => {
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (value: Error) => void = () => undefined;
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const setup = (initial: Partial<ImportProps> = {}) => {
  let props: ImportProps = {
    sourceIdentity: 'project-a:meeting-a:1',
    transcript: '',
    onImport: mockImport,
    ...initial,
  };
  const content = () => (
    <I18nProvider i18n={i18n}>
      <DeliveryTranscriptImport
        sourceIdentity={props.sourceIdentity}
        transcript={props.transcript}
        disabled={props.disabled}
        onImport={props.onImport}
      />
    </I18nProvider>
  );
  const view = render(content());
  return {
    update: (changes: Partial<ImportProps>) => {
      props = { ...props, ...changes };
      view.rerender(content());
    },
    unmount: view.unmount,
  };
};
const upload = (file = transcriptFile()) =>
  userEvent.upload(screen.getByLabelText('Choose transcript file'), file);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { TextDecoder });
  mockReadFile.mockReset().mockResolvedValue(bytes(TRANSCRIPT));
  mockImport.mockReset().mockReturnValue(true);
});

it('previews a local transcript and applies it only after an explicit Use transcript', async () => {
  setup();
  await upload();
  expect(
    await screen.findByRole('region', { name: 'Transcript preview' }),
  ).toHaveTextContent('00:00:01.000 --> 00:00:02.500');
  expect(screen.getByText('meeting.vtt')).toBeVisible();
  expect(
    screen.getByText(new RegExp(`^· ${TRANSCRIPT.length} characters$`)),
  ).toBeVisible();
  expect(mockImport).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Use transcript' }));
  expect(mockImport).toHaveBeenCalledWith(TRANSCRIPT, {
    sourceIdentity: 'project-a:meeting-a:1',
    transcript: '',
  });
  expect(
    screen.queryByRole('region', { name: 'Transcript preview' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Transcript added to this draft/)).toBeVisible();
});
it('requires Replace existing notes and allows cancellation and reselection of the same file', async () => {
  setup({ transcript: 'Earlier meeting notes' });
  const file = transcriptFile();
  await upload(file);
  expect(
    await screen.findByRole('button', { name: 'Replace existing notes' }),
  ).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Use transcript' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
  expect(mockImport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Choose transcript file')).toHaveFocus();
  await upload(file);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Replace existing notes' }),
  );
  expect(mockImport).toHaveBeenCalledWith(TRANSCRIPT, {
    sourceIdentity: 'project-a:meeting-a:1',
    transcript: 'Earlier meeting notes',
  });
});
it('rejects unsupported and oversized files before reading their bytes', async () => {
  setup();
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(
    screen.getByLabelText('Choose transcript file'),
    transcriptFile('Recording', 'meeting.mp4'),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose a TXT, VTT or SRT transcript file.',
  );
  const oversized = transcriptFile();
  Object.defineProperty(oversized, 'size', {
    value: MAX_TRANSCRIPT_FILE_BYTES + 1,
  });
  await user.upload(screen.getByLabelText('Choose transcript file'), oversized);
  expect(screen.getByRole('alert')).toHaveTextContent('no larger than 1 MiB');
  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockImport).not.toHaveBeenCalled();
});
it('shows an actionable binary-content error without changing the draft', async () => {
  setup({ transcript: 'Retain these notes' });
  const binary = 'Notes\u0000hidden';
  mockReadFile.mockResolvedValue(bytes(binary));
  await upload(transcriptFile(binary));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'binary data or unsupported control characters',
  );
  expect(mockImport).not.toHaveBeenCalled();
});
it('retains the original draft when a local file read fails', async () => {
  setup({ transcript: 'Retain these notes' });
  mockReadFile.mockRejectedValue(new Error('Local read failed'));
  await upload();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose it again or paste your notes.',
  );
  expect(mockImport).not.toHaveBeenCalled();
});
it('rejects a local reader result that is not file bytes', async () => {
  setup();
  mockReadFile.mockResolvedValue(TRANSCRIPT);
  await upload();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This file could not be read.',
  );
  expect(mockImport).not.toHaveBeenCalled();
});
it('keeps the latest selected preview when earlier file bytes finish late', async () => {
  const first = deferredRead();
  const second = deferredRead();
  mockReadFile
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  setup();
  await upload(transcriptFile('First notes', 'first.txt'));
  await upload(transcriptFile('Second notes', 'second.txt'));
  await act(async () => second.resolve(bytes('Second notes')));
  expect(
    screen.getByRole('region', { name: 'Transcript preview' }),
  ).toHaveTextContent('Second notes');
  await act(async () => first.resolve(bytes('First notes')));
  expect(
    screen.getByRole('region', { name: 'Transcript preview' }),
  ).toHaveTextContent('Second notes');
  await userEvent.click(screen.getByRole('button', { name: 'Use transcript' }));
  expect(mockImport).toHaveBeenCalledWith('Second notes', {
    sourceIdentity: 'project-a:meeting-a:1',
    transcript: '',
  });
});
it('ignores bytes and failures after cancelling a pending read', async () => {
  const pending = deferredRead();
  mockReadFile.mockReturnValueOnce(pending.promise);
  setup();
  await upload();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Reading transcript file',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
  await act(async () => pending.reject(new Error('Late read error')));
  expect(
    screen.queryByRole('region', { name: 'Transcript preview' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(mockImport).not.toHaveBeenCalled();
});
it('does not carry a pending read into another source identity', async () => {
  const pending = deferredRead();
  mockReadFile.mockReturnValueOnce(pending.promise);
  const page = setup();
  await upload();
  page.update({
    sourceIdentity: 'project-b:meeting-b:1',
    transcript: 'Project B notes',
  });
  await act(async () => pending.resolve(bytes(TRANSCRIPT)));
  expect(
    screen.queryByRole('region', { name: 'Transcript preview' }),
  ).not.toBeInTheDocument();
  expect(mockImport).not.toHaveBeenCalled();
  await upload();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Replace existing notes' }),
  );
  expect(mockImport).toHaveBeenCalledWith(TRANSCRIPT, {
    sourceIdentity: 'project-b:meeting-b:1',
    transcript: 'Project B notes',
  });
});
it('clears an already visible private preview when its source changes', async () => {
  const page = setup();
  await upload();
  expect(
    await screen.findByRole('region', { name: 'Transcript preview' }),
  ).toBeVisible();
  page.update({ sourceIdentity: 'project-a:meeting-a:2' });
  expect(
    screen.queryByRole('region', { name: 'Transcript preview' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Use transcript' }),
  ).not.toBeInTheDocument();
  expect(mockImport).not.toHaveBeenCalled();
});
it.each(['reading', 'preview'] as const)(
  'clears private bytes when editing becomes unavailable during %s',
  async (phase) => {
    const pending = deferredRead();
    mockReadFile.mockReturnValueOnce(pending.promise);
    const page = setup();
    await upload();
    if (phase === 'preview')
      await act(async () => pending.resolve(bytes(TRANSCRIPT)));
    page.update({ disabled: true });
    if (phase === 'reading')
      await act(async () => pending.resolve(bytes(TRANSCRIPT)));
    expect(screen.getByLabelText('Choose transcript file')).toBeDisabled();
    expect(
      screen.queryByRole('region', { name: 'Transcript preview' }),
    ).not.toBeInTheDocument();
    page.update({ disabled: false });
    expect(
      screen.queryByRole('region', { name: 'Transcript preview' }),
    ).not.toBeInTheDocument();
    expect(mockImport).not.toHaveBeenCalled();
  },
);
it.each(['reading', 'preview'] as const)(
  'protects notes edited during %s until the replacement is reviewed again',
  async (phase) => {
    const pending = deferredRead();
    mockReadFile.mockReturnValueOnce(pending.promise);
    const page = setup({ transcript: 'Original notes' });
    await upload();
    if (phase === 'preview')
      await act(async () => pending.resolve(bytes(TRANSCRIPT)));
    page.update({ transcript: 'Newer manually typed notes' });
    if (phase === 'reading')
      await act(async () => pending.resolve(bytes(TRANSCRIPT)));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'meeting draft changed',
    );
    expect(
      screen.getByRole('button', { name: 'Replace existing notes' }),
    ).toBeDisabled();
    expect(mockImport).not.toHaveBeenCalled();
  },
);
it('uses the current parent callback and preserves a rejected replacement for inspection', async () => {
  const page = setup();
  await upload();
  await screen.findByRole('button', { name: 'Use transcript' });
  const rejectCurrentTarget = jest.fn().mockReturnValue(false);
  page.update({ onImport: rejectCurrentTarget });
  await userEvent.click(screen.getByRole('button', { name: 'Use transcript' }));
  expect(rejectCurrentTarget).toHaveBeenCalledTimes(1);
  expect(mockImport).not.toHaveBeenCalled();
  expect(
    screen.getByRole('region', { name: 'Transcript preview' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use transcript' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('meeting draft changed');
});
it('imports the complete validated text even though its visible preview is bounded', async () => {
  const text = 'Transcript text.\n'.repeat(1000);
  mockReadFile.mockResolvedValue(bytes(text));
  setup();
  await upload(transcriptFile(text));
  const preview = await screen.findByRole('region', {
    name: 'Transcript preview',
  });
  expect(preview.textContent).toHaveLength(MAX_TRANSCRIPT_PREVIEW_CHARACTERS);
  expect(screen.getByText(/Only the beginning is shown/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Use transcript' }));
  expect(mockImport).toHaveBeenCalledWith(text, {
    sourceIdentity: 'project-a:meeting-a:1',
    transcript: '',
  });
});
it('ignores a pending local file after its component is removed', async () => {
  const pending = deferredRead();
  mockReadFile.mockReturnValueOnce(pending.promise);
  const page = setup();
  await upload();
  page.unmount();
  await act(async () => pending.resolve(bytes(TRANSCRIPT)));
  expect(mockImport).not.toHaveBeenCalled();
});
