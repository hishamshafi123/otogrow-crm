export const MAX_TRANSCRIPT_FILE_BYTES = 1024 * 1024;
export const MAX_TRANSCRIPT_CHARACTERS = 200000;
export const MAX_TRANSCRIPT_PREVIEW_CHARACTERS = 4000;

export type TranscriptImportError =
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_TEXT'
  | 'INVALID_UTF8'
  | 'BINARY_CONTENT'
  | 'TEXT_TOO_LONG'
  | 'READ_FAILED';
export type TranscriptFile = { name: string; size: number };
export type TranscriptImportResult =
  | { success: true; text: string; characterCount: number }
  | { success: false; error: TranscriptImportError };

export const validateTranscriptFile = (
  file: TranscriptFile,
): TranscriptImportError | null => {
  if (!/\.(txt|vtt|srt)$/i.test(file.name)) return 'UNSUPPORTED_FILE';
  if (!Number.isSafeInteger(file.size) || file.size < 0) return 'READ_FAILED';
  if (file.size > MAX_TRANSCRIPT_FILE_BYTES) return 'FILE_TOO_LARGE';
  if (file.size === 0) return 'EMPTY_TEXT';
  return null;
};

export const parseTranscriptBytes = (
  file: TranscriptFile,
  bytes: Uint8Array,
): TranscriptImportResult => {
  const metadataError = validateTranscriptFile(file);
  if (metadataError) return { success: false, error: metadataError };
  if (bytes.byteLength > MAX_TRANSCRIPT_FILE_BYTES)
    return { success: false, error: 'FILE_TOO_LARGE' };
  if (bytes.byteLength !== file.size)
    return { success: false, error: 'READ_FAILED' };
  if (typeof TextDecoder === 'undefined')
    return { success: false, error: 'READ_FAILED' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n');
  } catch {
    return { success: false, error: 'INVALID_UTF8' };
  }
  if (
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text) ||
    /^(%PDF-|GIF87a|GIF89a|%!PS-Adobe-)/.test(text)
  )
    return { success: false, error: 'BINARY_CONTENT' };
  if (!text.trim()) return { success: false, error: 'EMPTY_TEXT' };
  if (text.length > MAX_TRANSCRIPT_CHARACTERS)
    return { success: false, error: 'TEXT_TOO_LONG' };
  return { success: true, text, characterCount: text.length };
};

export const transcriptTextPreview = (text: string) => {
  const preview = text.slice(0, MAX_TRANSCRIPT_PREVIEW_CHARACTERS);
  const finalCodeUnit = preview.charCodeAt(preview.length - 1);
  return finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff
    ? preview.slice(0, -1)
    : preview;
};
