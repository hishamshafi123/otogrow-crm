import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { Headers } from 'cross-fetch';
import {
  hashKnowledgeBytes,
  readKnowledgeFileBytes,
  validateKnowledgeFile,
  KNOWLEDGE_FILE_MAX_BYTES,
} from '@/delivery/knowledge/assets/knowledge-file-bytes';

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
  Object.defineProperty(globalThis, 'Blob', {
    configurable: true,
    value: NodeBlob,
  });
});
const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
const response = (changes: Record<string, unknown> = {}) =>
  ({
    headers: new Headers({
      'Content-Type': 'image/png',
      'Content-Length': '4',
    }),
    blob: async () => new Blob([bytes], { type: 'image/png' }),
    body: {
      getReader: () => ({
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(bytes) })
          .mockResolvedValue({ done: true }),
        cancel: jest.fn(),
      }),
    },
    ...changes,
  }) as unknown as Response;
it('returns only the exact bytes bound to the published file hash', async () => {
  const sha256 = await hashKnowledgeBytes(bytes);
  const blob = await readKnowledgeFileBytes(response(), {
    size: 4,
    mimeType: 'image/png',
    sha256,
  });
  expect(blob.size).toBe(4);
  await expect(
    readKnowledgeFileBytes(response(), {
      size: 4,
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
    }),
  ).rejects.toThrow('FILE_MISMATCH');
});
it('rejects another media type or a declared size mismatch before consuming bytes', async () => {
  const blob = jest.fn();
  const expected = {
    size: 4,
    mimeType: 'image/png',
    sha256: await hashKnowledgeBytes(bytes),
  };
  await expect(
    readKnowledgeFileBytes(
      response({
        headers: new Headers({
          'Content-Type': 'text/html',
          'Content-Length': '4',
        }),
        blob,
      }),
      expected,
    ),
  ).rejects.toThrow('FILE_MISMATCH');
  await expect(
    readKnowledgeFileBytes(
      response({
        headers: new Headers({
          'Content-Type': 'image/png',
          'Content-Length': '500',
        }),
        blob,
      }),
      expected,
    ),
  ).rejects.toThrow('FILE_MISMATCH');
  expect(blob).not.toHaveBeenCalled();
});
it('cancels a stream exceeding the immutable expected size', async () => {
  const cancel = jest.fn();
  const read = jest
    .fn()
    .mockResolvedValue({ done: false, value: new Uint8Array(5) });
  await expect(
    readKnowledgeFileBytes(
      response({ body: { getReader: () => ({ read, cancel }) } }),
      {
        size: 4,
        mimeType: 'image/png',
        sha256: await hashKnowledgeBytes(bytes),
      },
    ),
  ).rejects.toThrow('FILE_MISMATCH');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
});
it('limits local selection without trusting the supplied MIME type', () => {
  expect(
    validateKnowledgeFile({ name: 'logo.png', size: 4, type: '' }),
  ).toBeNull();
  expect(
    validateKnowledgeFile({ name: ' logo.png ', size: 4, type: '' }),
  ).toBeNull();
  expect(
    validateKnowledgeFile({ name: 'logo.exe', size: 4, type: 'image/png' }),
  ).toBe('UNSUPPORTED_FILE');
  expect(validateKnowledgeFile({ name: 'logo.png', size: 0, type: '' })).toBe(
    'FILE_EMPTY',
  );
  expect(
    validateKnowledgeFile({
      name: 'logo.png',
      size: KNOWLEDGE_FILE_MAX_BYTES + 1,
      type: '',
    }),
  ).toBe('FILE_TOO_LARGE');
});

it('does not buffer an unbounded fallback when the response has no readable stream', async () => {
  const blob = jest.fn();
  await expect(
    readKnowledgeFileBytes(response({ body: null, blob }), {
      size: 4,
      mimeType: 'image/png',
      sha256: await hashKnowledgeBytes(bytes),
    }),
  ).rejects.toThrow('FILE_MISMATCH');
  expect(blob).not.toHaveBeenCalled();
});
