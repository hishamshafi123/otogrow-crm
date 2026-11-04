import axios, { AxiosError, AxiosHeaders } from 'axios';
import {
  CompetitorCollectionError,
  DeliveryCompetitorXTransport,
  type CompetitorReadDispatch,
} from '../delivery-competitor-x.transport';
import { type CompetitorXPageInput } from '../../delivery-competitor.types';
const input: CompetitorXPageInput = {
  accountId: '123',
  limit: 5,
  sinceId: '100',
  untilId: null,
  nextToken: null,
};
const configuration = {
  accessToken: 'synthetic-token-for-http-fixture',
  tariff: { postReadMicros: '5000', userReadMicros: '10000' },
};
const data = {
  data: [
    {
      id: '101',
      author_id: '123',
      text: 'A recorded public post.',
      created_at: '2020-03-01T06:00:00Z',
    },
  ],
  meta: { result_count: 1 },
};
const transport = new DeliveryCompetitorXTransport();
const dispatch: CompetitorReadDispatch = async (_bound, perform) => perform();
const response = (
  status: number,
  responseData: unknown = data,
  retryAfter = '17',
) => ({
  status,
  statusText: 'fixture',
  data: responseData,
  config: { headers: new AxiosHeaders() },
  headers: { 'retry-after': retryAfter },
});
afterEach(() => jest.restoreAllMocks());
it('requires dispatch authorization before any HTTP operation and gives it the full page bound', async () => {
  const get = jest.spyOn(axios, 'get').mockResolvedValue(response(200));
  const authorize = jest.fn<
    ReturnType<CompetitorReadDispatch>,
    Parameters<CompetitorReadDispatch>
  >(async (bound, perform) => {
    expect(bound).toBe('25000');
    expect(get).not.toHaveBeenCalled();
    return perform();
  });
  const result = await transport.collectPage(input, configuration, authorize);
  expect(result.observations[0].externalId).toBe('101');
  expect(get).toHaveBeenCalledTimes(1);
  const [address, options] = get.mock.calls[0];
  expect(new URL(address).origin).toBe('https://api.x.com');
  expect(options).toMatchObject({
    maxRedirects: 0,
    timeout: 20000,
    maxContentLength: 1048576,
    maxBodyLength: 1048576,
    headers: { Authorization: `Bearer ${configuration.accessToken}` },
  });
  expect(address).not.toContain(configuration.accessToken);
});
it('does not dispatch or request when pricing is unknown', async () => {
  const get = jest.spyOn(axios, 'get').mockResolvedValue(response(200));
  const authorize = jest.fn();
  await expect(
    transport.collectPage(input, { ...configuration, tariff: null }, authorize),
  ).rejects.toMatchObject({ code: 'UNKNOWN_TARIFF', costUncertain: false });
  expect(authorize).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
it.each(['', '   ', 'token with-space', 'token\r\nInjected: header'])(
  'rejects invalid credentials before dispatch',
  async (accessToken) => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue(response(200));
    await expect(
      transport.collectPage(input, { ...configuration, accessToken }, dispatch),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_REQUIRED',
      costUncertain: false,
    });
    expect(get).not.toHaveBeenCalled();
  },
);
it('leaves a denied reservation with zero HTTP attempts', async () => {
  const get = jest.spyOn(axios, 'get').mockResolvedValue(response(200));
  await expect(
    transport.collectPage(input, configuration, async () => {
      throw new Error('No data allowance');
    }),
  ).rejects.toThrow('No data allowance');
  expect(get).not.toHaveBeenCalled();
});
it('does not let a dispatcher retry a paid read under the same reservation', async () => {
  const get = jest
    .spyOn(axios, 'get')
    .mockRejectedValue(new Error('Uncertain request'));
  await expect(
    transport.collectPage(input, configuration, async (_cost, perform) => {
      await expect(perform()).rejects.toMatchObject({ costUncertain: true });
      return perform();
    }),
  ).rejects.toMatchObject({ code: 'READ_ALREADY_DISPATCHED' });
  expect(get).toHaveBeenCalledTimes(1);
});
it.each([
  [401, 'AUTHENTICATION_REQUIRED'],
  [403, 'ACCESS_DENIED'],
  [429, 'RATE_LIMITED'],
  [503, 'PROVIDER_UNAVAILABLE'],
])(
  'returns a bounded safe failure for HTTP %s without echoing body or credentials',
  async (status, code) => {
    const get = jest
      .spyOn(axios, 'get')
      .mockRejectedValue(
        new AxiosError(
          'unsafe: ' + configuration.accessToken,
          undefined,
          undefined,
          undefined,
          response(Number(status), { secret: configuration.accessToken }),
        ),
      );
    const result = await transport
      .collectPage(input, configuration, dispatch)
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(CompetitorCollectionError);
    expect(result).toMatchObject({
      code,
      costUncertain: true,
      retryAfterMilliseconds: 17000,
    });
    expect(String(result)).not.toContain(configuration.accessToken);
    expect(JSON.stringify(result)).not.toContain(configuration.accessToken);
    expect(get).toHaveBeenCalledTimes(1);
  },
);
it('retains cost uncertainty on invalid successful provider data and never retries automatically', async () => {
  const get = jest
    .spyOn(axios, 'get')
    .mockResolvedValue(response(200, { data: [] }));
  await expect(
    transport.collectPage(input, configuration, dispatch),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', costUncertain: true });
  expect(get).toHaveBeenCalledTimes(1);
});
