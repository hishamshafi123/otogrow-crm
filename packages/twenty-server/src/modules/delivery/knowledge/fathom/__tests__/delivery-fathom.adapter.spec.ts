import { DeliveryFathomAdapter } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.adapter';
import { FATHOM_MAX_BYTES } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.policy';

const body = {
  transcript: [
    {
      timestamp: '00:00:01',
      speaker: { display_name: 'Amna' },
      text: 'A confirmed fact',
    },
  ],
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
afterEach(() => jest.restoreAllMocks());
it('fetches only the fixed authenticated HTTPS endpoint and disables redirects', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(body));
  expect(
    (await new DeliveryFathomAdapter().transcript('test-secret', '12345'))
      .transcript,
  ).toContain('A confirmed fact');
  expect(String(fetch.mock.calls[0][0])).toBe(
    'https://api.fathom.ai/external/v1/recordings/12345/transcript',
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: 'GET',
    redirect: 'error',
    headers: { 'X-Api-Key': 'test-secret' },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('uses authenticated metadata to match exact links and keeps API recording identity distinct', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      json({
        items: [
          {
            recording_id: 555,
            title: 'Client meeting',
            url: 'https://fathom.video/calls/999',
            share_url: 'https://fathom.video/share/private',
            recording_start_time: '2026-11-01T12:00:00Z',
            calendar_invitees: [{ email: 'secret@example.invalid' }],
          },
        ],
        next_cursor: 'next-page',
      }),
    );
  const result = await new DeliveryFathomAdapter().meetings('key', {
    createdAfter: '2026-11-01T00:00:00Z',
    createdBefore: '2026-11-03T00:00:00Z',
    exactUrl: 'https://fathom.video/share/private',
  });
  expect(result.items).toEqual([
    {
      recordingId: '555',
      title: 'Client meeting',
      recordedAt: '2026-11-01T12:00:00Z',
      sourceUrl: 'https://fathom.video/calls/999',
    },
  ]);
  expect(result.nextCursor).toBe('next-page');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('reports provider rate limits without retrying or returning provider error bodies', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response('private provider diagnostics', {
        status: 429,
        headers: { 'retry-after': '120' },
      }),
    );
  await expect(
    new DeliveryFathomAdapter().transcript('secret', '123'),
  ).rejects.toThrow('Wait 120 seconds');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 404, 500])(
  'sanitizes provider failure %s with no retry',
  async (status) => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('secret token and private metadata', { status }),
      );
    try {
      await new DeliveryFathomAdapter().transcript('key', '123');
      throw new Error('Expected failure');
    } catch (error) {
      expect(String(error)).not.toContain('secret token');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('enforces the streaming byte bound without trusting content-length', async () => {
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(FATHOM_MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel,
  });
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(stream, { headers: { 'content-type': 'application/json' } }),
    );
  await expect(
    new DeliveryFathomAdapter().transcript('key', '123'),
  ).rejects.toThrow('exceeds the import limit');
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('rejects malformed or non-JSON content instead of importing partial evidence', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response('{incomplete', {
        headers: { 'content-type': 'application/json' },
      }),
    );
  await expect(
    new DeliveryFathomAdapter().transcript('key', '123'),
  ).rejects.toThrow('incomplete or invalid');
});
