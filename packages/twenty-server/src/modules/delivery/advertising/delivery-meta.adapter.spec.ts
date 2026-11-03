import { DeliveryMetaAdapter } from 'src/modules/delivery/advertising/delivery-meta.adapter';
import { metaReportDate } from 'src/modules/delivery/advertising/delivery-meta.service';
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const row = {
  account_id: '1657332765534462',
  date_start: '2026-10-24',
  date_stop: '2026-10-24',
  spend: '10.25',
  impressions: '100',
  clicks: '10',
  actions: [
    { action_type: 'lead', value: '3' },
    { action_type: 'onsite_conversion.lead_grouped', value: '3' },
  ],
};
const response = (body: unknown, status = 200) => ({
  ok: status === 200,
  status,
  text: async () => JSON.stringify(body),
});
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});
it('uses bearer authentication and cursor pagination without following provider next URLs', async () => {
  fetchMock
    .mockResolvedValueOnce(
      response({
        data: [row],
        paging: {
          next: 'https://untrusted.invalid/?access_token=secret',
          cursors: { after: 'cursor' },
        },
      }),
    )
    .mockResolvedValueOnce(response({ data: [] }));
  const rows = await new DeliveryMetaAdapter().insights(
    row.account_id,
    'secret',
    '2026-10-24',
    'account',
  );
  expect(rows[0].actions).toHaveLength(2);
  expect(fetchMock.mock.calls[0][0]).not.toContain('secret');
  expect(fetchMock.mock.calls[0][1].headers).toEqual({
    Authorization: 'Bearer secret',
  });
  expect(fetchMock.mock.calls[1][0]).toMatch(/^https:\/\/graph.facebook.com\//);
  expect(fetchMock.mock.calls[1][0]).toContain('after=cursor');
});
it('accepts empty successful data and rejects mismatched account or dates', async () => {
  fetchMock.mockResolvedValueOnce(response({ data: [] }));
  await expect(
    new DeliveryMetaAdapter().insights(
      row.account_id,
      'secret',
      '2026-10-24',
      'account',
    ),
  ).resolves.toEqual([]);
  fetchMock.mockResolvedValueOnce(
    response({ data: [{ ...row, account_id: 'other' }] }),
  );
  await expect(
    new DeliveryMetaAdapter().insights(
      row.account_id,
      'secret',
      '2026-10-24',
      'account',
    ),
  ).rejects.toMatchObject({ reason: 'RESPONSE' });
});
it('sanitizes authentication and rate-limit failures without retrying', async () => {
  fetchMock.mockResolvedValueOnce(
    response({ error: { code: 190, message: 'secret' } }, 400),
  );
  await expect(
    new DeliveryMetaAdapter().account(row.account_id, 'secret'),
  ).rejects.toMatchObject({ reason: 'AUTH' });
  fetchMock.mockResolvedValueOnce(
    response({ error: { code: 4, message: 'secret' } }, 400),
  );
  await expect(
    new DeliveryMetaAdapter().account(row.account_id, 'secret'),
  ).rejects.toMatchObject({ reason: 'RATE_LIMIT' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('fails on repeated paging cursors instead of returning a partial report', async () => {
  fetchMock.mockResolvedValue(
    response({
      data: [row],
      paging: { next: 'next', cursors: { after: 'same' } },
    }),
  );
  await expect(
    new DeliveryMetaAdapter().insights(
      row.account_id,
      'secret',
      '2026-10-24',
      'account',
    ),
  ).rejects.toMatchObject({ reason: 'RESPONSE' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('selects yesterday in the ad account timezone across UTC boundaries', () => {
  expect(metaReportDate(new Date('2026-10-24T22:00:00Z'), 'Asia/Qatar')).toBe(
    '2026-10-24',
  );
  expect(metaReportDate(new Date('2026-10-24T20:00:00Z'), 'Asia/Qatar')).toBe(
    '2026-10-23',
  );
});
it('preserves explicit provider zero separately from missing normalized base fields', async () => {
  fetchMock.mockResolvedValueOnce(
    response({ data: [{ ...row, spend: '0', impressions: '0', clicks: '0' }] }),
  );
  const explicit = await new DeliveryMetaAdapter().insights(
    row.account_id,
    'secret',
    row.date_start,
    'account',
  );
  expect(explicit[0]).toMatchObject({
    spend: '0',
    impressions: '0',
    clicks: '0',
    reportedFields: {
      spend: true,
      impressions: true,
      clicks: true,
      actions: true,
      action_values: false,
    },
  });
  fetchMock.mockResolvedValueOnce(
    response({
      data: [
        {
          account_id: row.account_id,
          date_start: row.date_start,
          date_stop: row.date_stop,
        },
      ],
    }),
  );
  const absent = await new DeliveryMetaAdapter().insights(
    row.account_id,
    'secret',
    row.date_start,
    'account',
  );
  expect(absent[0]).toMatchObject({
    spend: '0',
    impressions: '0',
    clicks: '0',
    actions: [],
    action_values: [],
    reportedFields: {
      spend: false,
      impressions: false,
      clicks: false,
      actions: false,
      action_values: false,
    },
  });
});
