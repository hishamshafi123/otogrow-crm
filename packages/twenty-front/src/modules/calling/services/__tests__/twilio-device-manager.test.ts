import {
  initializeCallingDevice,
  runVoicePreflight,
  setCallingAccess,
  startOutgoingCall,
} from '@/calling/services/twilio-device-manager';

const makeDevice = () => ({
  on: jest.fn(),
  register: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
  updateToken: jest.fn(),
  connect: jest.fn(),
  disconnectAll: jest.fn(),
});
let mockDevices: ReturnType<typeof makeDevice>[] = [];
let mockRegistration: Promise<void> | undefined;
const mockConstruct = jest.fn(() => {
  const device = makeDevice();
  if (mockRegistration) device.register.mockReturnValue(mockRegistration);
  mockDevices.push(device);
  return device;
});
const mockPreflight = { stop: jest.fn(), on: jest.fn() };
const mockPreflightRun = jest.fn(() => mockPreflight);
const mockSet = jest.fn();
jest.mock('@twilio/voice-sdk', () => ({
  Device: Object.assign(
    function () {
      return mockConstruct();
    },
    {
      Codec: { Opus: 'opus', PCMU: 'pcmu' },
      runPreflight: () => mockPreflightRun(),
    },
  ),
  Call: { State: { Open: 'open' }, Codec: { Opus: 'opus', PCMU: 'pcmu' } },
}));
jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: () => ({
    accessOrWorkspaceAgnosticToken: { token: 'synthetic-session' },
  }),
}));
jest.mock('@/auth/utils/ensureTokenRenewed', () => ({
  ensureTokenRenewed: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/ui/utilities/state/jotai/jotaiStore', () => ({
  jotaiStore: { set: (...args: unknown[]) => mockSet(...args) },
}));
const tokenResponse = {
  ok: true,
  json: async () => ({ data: { generateTwilioVoiceToken: 'synthetic-voice' } }),
} as Response;
const originalFetch = global.fetch;
beforeEach(() => {
  setCallingAccess(null);
  mockDevices = [];
  mockRegistration = undefined;
  mockConstruct.mockClear();
  mockPreflight.stop.mockClear();
  mockPreflightRun.mockClear();
  mockSet.mockClear();
  global.fetch = jest.fn().mockResolvedValue(tokenResponse);
});
afterEach(() => setCallingAccess(null));
afterAll(() => {
  global.fetch = originalFetch;
});
it('does not initialize, dial or diagnose without a current capability', async () => {
  await initializeCallingDevice();
  await startOutgoingCall({ toNumber: '+15551234567' });
  await runVoicePreflight();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockConstruct).not.toHaveBeenCalled();
  expect(mockPreflightRun).not.toHaveBeenCalled();
});
it('destroys the registered device on access loss and workspace change', async () => {
  setCallingAccess('workspace:member:membership');
  await initializeCallingDevice();
  await initializeCallingDevice();
  expect(mockConstruct).toHaveBeenCalledTimes(1);
  setCallingAccess('other-workspace:member:other-membership');
  expect(mockDevices[0].destroy).toHaveBeenCalledTimes(1);
  await initializeCallingDevice();
  expect(mockConstruct).toHaveBeenCalledTimes(2);
  setCallingAccess(null);
  expect(mockDevices[1].destroy).toHaveBeenCalledTimes(1);
  await startOutgoingCall({ toNumber: '+15551234567' });
  expect(mockDevices[1].connect).not.toHaveBeenCalled();
});
it('discards a late token after access is revoked', async () => {
  let finish: (response: Response) => void = () => undefined;
  global.fetch = jest.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  setCallingAccess('workspace:member');
  const initialization = initializeCallingDevice();
  await Promise.resolve();
  setCallingAccess(null);
  finish(tokenResponse);
  await initialization;
  expect(mockConstruct).not.toHaveBeenCalled();
});
it('cleans up a pending registration and does not resurrect it after revocation', async () => {
  let finish: () => void = () => undefined;
  mockRegistration = new Promise<void>((resolve) => {
    finish = resolve;
  });
  setCallingAccess('workspace:member');
  const initialization = initializeCallingDevice();
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  expect(mockDevices).toHaveLength(1);
  setCallingAccess(null);
  expect(mockDevices[0].destroy).toHaveBeenCalled();
  finish();
  await initialization;
  await startOutgoingCall({ toNumber: '+15551234567' });
  expect(mockDevices[0].connect).not.toHaveBeenCalled();
});
it('stops an ongoing diagnostic when access is revoked', async () => {
  setCallingAccess('workspace:member');
  await runVoicePreflight();
  expect(mockPreflightRun).toHaveBeenCalledTimes(1);
  setCallingAccess(null);
  expect(mockPreflight.stop).toHaveBeenCalledTimes(1);
});
it('discards an unusable session but allows a fresh server-checked retry after token renewal fails', async () => {
  setCallingAccess('workspace:member');
  await initializeCallingDevice();
  const renewal = mockDevices[0].on.mock.calls.find(
    ([event]) => event === 'tokenWillExpire',
  )?.[1] as () => Promise<void>;
  global.fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error('Network unavailable'));
  await renewal();
  expect(mockDevices[0].destroy).toHaveBeenCalledTimes(1);
  global.fetch = jest.fn().mockResolvedValue(tokenResponse);
  await initializeCallingDevice();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(mockConstruct).toHaveBeenCalledTimes(2);
});
