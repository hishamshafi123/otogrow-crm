export const KNOWLEDGE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_FILE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export type KnowledgeFileError =
  | 'FILE_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'FILE_MISMATCH';

export const validateKnowledgeFile = (
  file: Pick<File, 'name' | 'size' | 'type'>,
): KnowledgeFileError | null => {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'FILE_EMPTY';
  if (file.size > KNOWLEDGE_FILE_MAX_BYTES) return 'FILE_TOO_LARGE';
  if (!/\.(png|jpe?g|webp|pdf)$/i.test(file.name.trim()))
    return 'UNSUPPORTED_FILE';
  return null;
};

export const hashKnowledgeBytes = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

export const readKnowledgeFileBytes = async (
  response: Response,
  expected: { size: number; mimeType: string; sha256: string },
) => {
  const declared = response.headers.get('Content-Length');
  if (
    !KNOWLEDGE_FILE_MIME_TYPES.some((type) => type === expected.mimeType) ||
    !Number.isSafeInteger(expected.size) ||
    expected.size < 1 ||
    expected.size > KNOWLEDGE_FILE_MAX_BYTES ||
    !/^[a-f0-9]{64}$/.test(expected.sha256) ||
    response.headers.get('Content-Type')?.split(';')[0] !== expected.mimeType ||
    (declared !== null && Number(declared) !== expected.size)
  )
    throw new Error('FILE_MISMATCH');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('FILE_MISMATCH');
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > expected.size || received > KNOWLEDGE_FILE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('FILE_MISMATCH');
    }
    parts.push(new Uint8Array(chunk.value));
  }
  const blob = new Blob(parts, { type: expected.mimeType });
  if (
    blob.size !== expected.size ||
    (await hashKnowledgeBytes(await blob.arrayBuffer())) !== expected.sha256
  )
    throw new Error('FILE_MISMATCH');
  return blob;
};
