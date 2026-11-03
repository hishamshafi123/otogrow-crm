import { TextDecoder, TextEncoder } from 'util';
import {
  MAX_TRANSCRIPT_CHARACTERS,
  MAX_TRANSCRIPT_FILE_BYTES,
  MAX_TRANSCRIPT_PREVIEW_CHARACTERS,
  parseTranscriptBytes,
  transcriptTextPreview,
  validateTranscriptFile,
} from '@/delivery/knowledge/transcript/transcript-import';

const parseText = (text: string, name = 'meeting.txt') => {
  const bytes = new TextEncoder().encode(text);
  return parseTranscriptBytes({ name, size: bytes.byteLength }, bytes);
};
beforeAll(() => {
  Object.assign(globalThis, { TextDecoder });
});

it('normalizes only the first BOM and line endings, keeping whitespace, timestamps and speaker text', () => {
  const input =
    '\uFEFF  Amna:\tKeep this wording.\r\n00:00:01,200 --> 00:00:03,400\rClient: agreed.  \n';
  const expected =
    '  Amna:\tKeep this wording.\n00:00:01,200 --> 00:00:03,400\nClient: agreed.  \n';
  expect(parseText(input)).toEqual({
    success: true,
    text: expected,
    characterCount: expected.length,
  });
  expect(parseText('\uFEFF\uFEFFNotes')).toMatchObject({
    success: true,
    text: '\uFEFFNotes',
  });
});
it.each(['meeting.txt', 'meeting.VTT', 'meeting.srt'])(
  'preserves multilingual transcript text in %s without parsing or inventing captions',
  (name) => {
    const text =
      'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\n<v Amna>مرحبا — नमस्ते — café 🦊</v>\n';
    expect(parseText(text, name)).toEqual({
      success: true,
      text,
      characterCount: text.length,
    });
  },
);
it.each([
  'meeting.pdf',
  'meeting.txt.exe',
  'meeting.vtt.mp4',
  'meeting.json',
  'meeting',
])('rejects unsupported transcript file %s', (name) =>
  expect(parseText('Meeting notes', name)).toEqual({
    success: false,
    error: 'UNSUPPORTED_FILE',
  }),
);
it.each([
  [0xc3, 0x28],
  [0xe2, 0x82],
  [0xff, 0xfe, 0x61, 0x00],
  [0xc0, 0xaf],
])(
  'rejects invalid or non-UTF8 bytes %j without replacement characters',
  (...bytes) => {
    const value = new Uint8Array(bytes);
    expect(
      parseTranscriptBytes(
        { name: 'meeting.txt', size: value.byteLength },
        value,
      ),
    ).toEqual({ success: false, error: 'INVALID_UTF8' });
  },
);
it.each([
  'Notes\u0000hidden',
  'Notes\u0007hidden',
  'Notes\u007Fhidden',
  'Notes\u0085hidden',
  '%PDF-1.7\nNot a transcript',
  'GIF89a',
])('rejects binary content or unsupported controls', (text) => {
  expect(parseText(text)).toEqual({ success: false, error: 'BINARY_CONTENT' });
});
it('checks the byte cap before reading and checks actual bytes independently of metadata', () => {
  expect(
    validateTranscriptFile({
      name: 'meeting.txt',
      size: MAX_TRANSCRIPT_FILE_BYTES,
    }),
  ).toBeNull();
  expect(
    validateTranscriptFile({
      name: 'meeting.txt',
      size: MAX_TRANSCRIPT_FILE_BYTES + 1,
    }),
  ).toBe('FILE_TOO_LARGE');
  expect(
    parseTranscriptBytes(
      { name: 'meeting.txt', size: 1 },
      new Uint8Array(MAX_TRANSCRIPT_FILE_BYTES + 1),
    ),
  ).toEqual({ success: false, error: 'FILE_TOO_LARGE' });
});
it.each([0, -1, Number.NaN, 1.5])(
  'rejects an invalid or empty declared file size %s',
  (size) => {
    expect(validateTranscriptFile({ name: 'meeting.txt', size })).toBe(
      size === 0 ? 'EMPTY_TEXT' : 'READ_FAILED',
    );
  },
);
it('rejects incomplete local reads', () => {
  expect(
    parseTranscriptBytes(
      { name: 'meeting.txt', size: 50 },
      new TextEncoder().encode('Short'),
    ),
  ).toEqual({ success: false, error: 'READ_FAILED' });
});
it.each(['', ' \t\r\n ', '\uFEFF'])(
  'rejects empty transcript content without trimming valid notes',
  (text) => {
    expect(parseText(text)).toEqual({ success: false, error: 'EMPTY_TEXT' });
  },
);
it('enforces the same character limit as the existing source field independently of UTF8 byte count', () => {
  const maximum = '界'.repeat(MAX_TRANSCRIPT_CHARACTERS);
  expect(parseText(maximum)).toEqual({
    success: true,
    text: maximum,
    characterCount: MAX_TRANSCRIPT_CHARACTERS,
  });
  expect(parseText(`${maximum}界`)).toEqual({
    success: false,
    error: 'TEXT_TOO_LONG',
  });
  const lineEndings = `x${'\r\n'.repeat(MAX_TRANSCRIPT_CHARACTERS - 1)}`;
  expect(parseText(lineEndings)).toMatchObject({
    success: true,
    characterCount: MAX_TRANSCRIPT_CHARACTERS,
  });
});
it('bounds the preview without splitting a Unicode surrogate pair or truncating the imported source', () => {
  const text = `${'x'.repeat(MAX_TRANSCRIPT_PREVIEW_CHARACTERS - 1)}🦊End`;
  expect(transcriptTextPreview(text)).toBe(
    'x'.repeat(MAX_TRANSCRIPT_PREVIEW_CHARACTERS - 1),
  );
  expect(parseText(text)).toMatchObject({ success: true, text });
  expect(transcriptTextPreview('Short notes')).toBe('Short notes');
});
