import {
  fathomHash,
  fathomPreviewInput,
  formatFathomTranscript,
  normalizeFathomUrl,
  parseFathomInput,
} from 'src/modules/delivery/knowledge/fathom/delivery-fathom.policy';

const segment = (text: string) => ({
  timestamp: '00:01:23',
  speaker: {
    display_name: 'Amna',
    matched_calendar_invitee_email: 'private@example.invalid',
  },
  text,
});
it('preserves speaker and timestamp evidence without importing attendee addresses', () => {
  const result = formatFathomTranscript({
    transcript: [
      segment('Confirmed blue packaging.'),
      { ...segment('Next steps.'), speaker: { display_name: null } },
    ],
  });
  expect(result.transcript).toBe(
    '[00:01:23] Amna: Confirmed blue packaging.\n[00:01:23] Unknown speaker: Next steps.',
  );
  expect(result.segmentCount).toBe(2);
  expect(result.transcriptHash).toBe(fathomHash(result.transcript));
  expect(result.transcript).not.toContain('private@example.invalid');
});
it.each([
  [],
  [segment('   ')],
  [segment('bad\u0000text')],
  [segment('x'.repeat(200000))],
  [{ ...segment('note'), timestamp: '00:99:00' }],
])(
  'rejects empty, invalid or oversized evidence without truncation',
  (...segments) => {
    expect(() => formatFathomTranscript({ transcript: segments })).toThrow();
  },
);
it.each([
  'http://fathom.video/share/a',
  'https://fathom.video.attacker.invalid/share/a',
  'https://user@fathom.video/share/a',
  'https://fathom.video:4430/share/a',
  'https://fathom.video/share/a%2fb',
  'file:///tmp/notes',
])('rejects arbitrary or ambiguous provider URLs: %s', (value) => {
  expect(() => normalizeFathomUrl(value)).toThrow();
});
it('normalizes exact Fathom reference links without interpreting their slug as a recording ID', () => {
  expect(
    normalizeFathomUrl(
      'https://fathom.video/share/opaque-code/?tracking=1#title',
    ),
  ).toBe('https://fathom.video/share/opaque-code');
  expect(() =>
    parseFathomInput(fathomPreviewInput, {
      projectId: '00000000-0000-4000-8000-000000000001',
      sourceId: '00000000-0000-4000-8000-000000000002',
      recordingId: 'https://fathom.video/calls/123',
    }),
  ).toThrow();
});
