import { Call, Device } from '@twilio/voice-sdk';
import { isDefined } from 'twenty-shared/utils';

import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { ensureTokenRenewed } from '@/auth/utils/ensureTokenRenewed';
import { activeCallPersonIdState } from '@/calling/states/activeCallPersonIdState';
import { callAnsweredAtState } from '@/calling/states/callAnsweredAtState';
import { callStatusState } from '@/calling/states/callStatusState';
import { dialerErrorState } from '@/calling/states/dialerErrorState';
import { dialerNumberState } from '@/calling/states/dialerNumberState';
import { isCallMutedState } from '@/calling/states/isCallMutedState';
import { preflightReportState } from '@/calling/states/preflightReportState';
import { isDialerOpenState } from '@/calling/states/isDialerOpenState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The Device must live outside React: it owns the WebRTC session and has to
// survive route changes and component unmounts. Jotai atoms are the bridge
// back into the UI.
let twilioDevice: Device | null = null;
let deviceInitPromise: Promise<Device> | null = null;
let currentCall: Call | null = null;
let ringbackAudio: HTMLAudioElement | null = null;
let callingScope: string | null = null;
let accessGeneration = 0;
let registeringDevice: Device | null = null;
let activePreflight: ReturnType<typeof Device.runPreflight> | null = null;

const hasCurrentAccess = (generation: number) =>
  callingScope !== null && generation === accessGeneration;

const clearCallingSession = () => {
  accessGeneration += 1;
  deviceInitPromise = null;
  const previousDevice = twilioDevice;
  const previousRegisteringDevice = registeringDevice;
  twilioDevice = null;
  registeringDevice = null;
  currentCall?.disconnect();
  previousDevice?.destroy();
  if (previousRegisteringDevice !== previousDevice)
    previousRegisteringDevice?.destroy();
  activePreflight?.stop();
  activePreflight = null;
  resetCallState();
  jotaiStore.set(isDialerOpenState.atom, false);
  jotaiStore.set(dialerNumberState.atom, '');
  jotaiStore.set(dialerErrorState.atom, null);
  jotaiStore.set(preflightReportState.atom, { status: 'IDLE', detail: null });
};

export const setCallingAccess = (scope: string | null) => {
  if (scope === callingScope) return;
  callingScope = scope;
  clearCallingSession();
};

const stopRingback = () => {
  ringbackAudio?.pause();
  ringbackAudio = null;
};

const startRingback = (hasEarlyMedia?: boolean) => {
  // With answerOnBridge the caller leg only answers when the callee picks up,
  // so Twilio streams no ringback and the SDK has no looping sound — without
  // this the caller hears dead air and hangs up before the callee answers.
  if (hasEarlyMedia === true || isDefined(ringbackAudio)) {
    return;
  }

  ringbackAudio = new Audio('/sounds/ringback.mp3');
  ringbackAudio.loop = true;
  ringbackAudio.play().catch(() => stopRingback());
};

// The SDK never resumes its shared AudioContext (Twilio COMMON_ISSUES.md);
// a suspended context silently swallows all local SDK sounds.
const resumeDeviceAudioContext = async () => {
  const audioContext = Device.audioContext;

  if (audioContext?.state === 'suspended') {
    await audioContext.resume();
  }
};

const fetchVoiceToken = async (): Promise<string> => {
  // The raw access token expires long before the refresh token; Apollo
  // requests renew automatically, this fetch must do it explicitly.
  await ensureTokenRenewed(jotaiStore);

  const tokenPair = getTokenPair();
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken?.token;

  if (!isDefined(accessToken)) {
    throw new Error('You must be signed in to place calls');
  }

  const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: 'mutation GenerateTwilioVoiceToken { generateTwilioVoiceToken }',
    }),
  });

  const payload = (await response.json()) as {
    data?: { generateTwilioVoiceToken?: string };
    errors?: { message?: string }[];
  };

  const token = payload.data?.generateTwilioVoiceToken;

  if (!response.ok || !isDefined(token)) {
    throw new Error(
      payload.errors?.[0]?.message ??
        'Calling is not enabled for this workspace',
    );
  }

  return token;
};

const resetCallState = () => {
  stopRingback();
  currentCall = null;
  jotaiStore.set(callStatusState.atom, 'ENDED');
  jotaiStore.set(isCallMutedState.atom, false);
  jotaiStore.set(callAnsweredAtState.atom, null);
  jotaiStore.set(activeCallPersonIdState.atom, null);
};

const trackCall = (call: Call) => {
  currentCall = call;

  // The SDK's own accept listener runs before ours and is not
  // exception-safe for us; reconcile from the call's actual state so the UI
  // can never strand on "Ringing…" for an already-open call.
  if (call.status() === Call.State.Open) {
    stopRingback();
    jotaiStore.set(callStatusState.atom, 'IN_CALL');
    jotaiStore.set(callAnsweredAtState.atom, Date.now());
  }

  call.on('ringing', (hasEarlyMedia?: boolean) => {
    if (currentCall !== call || callingScope === null) return;
    jotaiStore.set(callStatusState.atom, 'RINGING');
    startRingback(hasEarlyMedia);
  });
  call.on('accept', () => {
    if (currentCall !== call || callingScope === null) return;
    stopRingback();
    jotaiStore.set(callStatusState.atom, 'IN_CALL');
    jotaiStore.set(callAnsweredAtState.atom, Date.now());
  });
  const resetIfCurrent = () => {
    if (currentCall === call) resetCallState();
  };
  call.on('disconnect', resetIfCurrent);
  call.on('cancel', resetIfCurrent);
  call.on('reject', resetIfCurrent);
  call.on('error', (error: Error) => {
    if (currentCall !== call) return;
    jotaiStore.set(dialerErrorState.atom, error.message || 'The call failed');
    resetCallState();
  });
};

const getOrInitDevice = async (): Promise<Device> => {
  const generation = accessGeneration;
  if (!hasCurrentAccess(generation))
    throw new Error('Phone access is not available');
  if (isDefined(twilioDevice)) {
    return twilioDevice;
  }

  // Concurrent opens share one init so two Device instances never register.
  deviceInitPromise ??= (async () => {
    const token = await fetchVoiceToken();
    if (!hasCurrentAccess(generation)) throw new Error('Phone access changed');
    const device = new Device(token, {
      // Debug while we diagnose local media-path failures; trim before prod.
      logLevel: 'debug',
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    registeringDevice = device;
    device.on('tokenWillExpire', async () => {
      if (!hasCurrentAccess(generation)) return;
      try {
        const freshToken = await fetchVoiceToken();

        if (!hasCurrentAccess(generation)) {
          device.destroy();
          return;
        }
        await device.updateToken(freshToken);
      } catch (error) {
        if (!hasCurrentAccess(generation)) return;
        // A transient renewal failure must permit a later server-checked retry.
        clearCallingSession();
        jotaiStore.set(
          dialerErrorState.atom,
          error instanceof Error ? error.message : 'Call session expired',
        );
      }
    });

    device.on('error', (error) => {
      if (!hasCurrentAccess(generation)) return;
      jotaiStore.set(dialerErrorState.atom, error.message);

      // A token-expired device never recovers; drop it so the next call
      // re-initializes with a fresh token instead of failing forever.
      if (error.message.toLowerCase().includes('expired')) {
        twilioDevice = null;
        device.destroy();
      }
    });

    device.on('incoming', (call) => {
      if (!hasCurrentAccess(generation)) {
        call.reject();
        return;
      }
      trackCall(call);

      // The caller's PSTN number arrives as a connect parameter; mirroring
      // it into dialerNumberState lets ActiveCallControls display it once
      // the call is accepted.
      const fromNumber = call.parameters.From ?? '';

      jotaiStore.set(dialerErrorState.atom, null);
      jotaiStore.set(dialerNumberState.atom, fromNumber);
      jotaiStore.set(callStatusState.atom, 'INCOMING');
      jotaiStore.set(isDialerOpenState.atom, true);
    });

    try {
      await device.register();
      if (!hasCurrentAccess(generation))
        throw new Error('Phone access changed');
      twilioDevice = device;
    } catch (error) {
      device.destroy();
      throw error;
    } finally {
      if (registeringDevice === device) registeringDevice = null;
    }

    return device;
  })();

  const pending = deviceInitPromise;
  try {
    return await pending;
  } finally {
    if (deviceInitPromise === pending) deviceInitPromise = null;
  }
};

export const startOutgoingCall = async ({
  toNumber,
  personId,
}: {
  toNumber: string;
  personId?: string | null;
}): Promise<void> => {
  const generation = accessGeneration;
  if (!hasCurrentAccess(generation)) return;
  jotaiStore.set(dialerErrorState.atom, null);
  jotaiStore.set(isDialerOpenState.atom, true);
  jotaiStore.set(callStatusState.atom, 'CONNECTING');
  jotaiStore.set(activeCallPersonIdState.atom, personId ?? null);

  try {
    const device = await getOrInitDevice();

    await resumeDeviceAudioContext();
    if (!hasCurrentAccess(generation)) return;

    const params: Record<string, string> = {
      To: toNumber,
      // Tells the voice webhook this is a browser call rather than an
      // inbound PSTN call.
      CallDirection: 'outbound',
    };

    if (isDefined(personId)) {
      params.PersonId = personId;
    }

    const call = await device.connect({ params });
    if (!hasCurrentAccess(generation)) {
      call.disconnect();
      return;
    }
    trackCall(call);
  } catch (error) {
    if (!hasCurrentAccess(generation)) return;
    jotaiStore.set(
      dialerErrorState.atom,
      error instanceof Error ? error.message : 'The call failed to start',
    );
    resetCallState();
  }
};

// Inbound calls only ring once the device is registered, so the workspace
// app calls this on login rather than waiting for the first outbound call.
// Failures are swallowed: calling may simply not be provisioned, and any
// real error surfaces when the user places a call.
export const initializeCallingDevice = async (): Promise<void> => {
  try {
    await getOrInitDevice();
  } catch {
    // no-op
  }
};

export const acceptIncomingCall = () => {
  if (callingScope === null) return;
  if (isDefined(currentCall)) {
    resumeDeviceAudioContext().catch(() => undefined);
    currentCall.accept();
  }
};

export const declineIncomingCall = () => {
  if (isDefined(currentCall)) {
    currentCall.reject();
  }

  resetCallState();
};

export const hangUpCall = () => {
  if (isDefined(currentCall)) {
    currentCall.disconnect();
  } else if (isDefined(twilioDevice)) {
    twilioDevice.disconnectAll();
  }

  resetCallState();
};

export const toggleCallMute = () => {
  if (callingScope === null) return;
  if (!isDefined(currentCall)) {
    return;
  }

  const nextMuted = !currentCall.isMuted();

  currentCall.mute(nextMuted);
  jotaiStore.set(isCallMutedState.atom, nextMuted);
};

export const sendCallDigits = (digits: string) => {
  if (callingScope === null) return;
  currentCall?.sendDigits(digits);
};

// Twilio's official connectivity diagnostic: places a real test call to the
// Twilio gateway (no PSTN leg) and measures RTP both ways. Used by the
// dialer's "Test connection" link to split network failures from device ones.
export const runVoicePreflight = async (): Promise<void> => {
  const generation = accessGeneration;
  if (!hasCurrentAccess(generation)) return;
  activePreflight?.stop();
  jotaiStore.set(preflightReportState.atom, {
    status: 'RUNNING',
    detail: null,
  });

  try {
    const token = await fetchVoiceToken();
    if (!hasCurrentAccess(generation)) return;
    const preflight = Device.runPreflight(token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    activePreflight = preflight;
    preflight.on('completed', (report) => {
      if (!hasCurrentAccess(generation) || activePreflight !== preflight)
        return;
      activePreflight = null;
      const stats = report.stats;
      const totals = report.totals;
      const parts = [
        `quality ${report.callQuality ?? 'n/a'}`,
        isDefined(stats) &&
          `mos ${stats.mos.average.toFixed(1)} · jitter ${stats.jitter.average.toFixed(1)}ms · rtt ${stats.rtt.average.toFixed(0)}ms`,
        isDefined(totals) &&
          `sent ${totals.bytesSent}B · recv ${totals.bytesReceived}B · lost ${totals.packetsLost} pkts`,
        report.warnings.length > 0 &&
          `warnings: ${report.warnings.map((warning: { name: string }) => warning.name).join(', ')}`,
      ].filter(isDefined);

      jotaiStore.set(preflightReportState.atom, {
        status: 'PASSED',
        detail: parts.join(' · ') || 'Completed',
      });
    });

    preflight.on('failed', (error) => {
      if (!hasCurrentAccess(generation) || activePreflight !== preflight)
        return;
      activePreflight = null;
      jotaiStore.set(preflightReportState.atom, {
        status: 'FAILED',
        detail: error.message,
      });
    });
  } catch (error) {
    if (!hasCurrentAccess(generation)) return;
    jotaiStore.set(preflightReportState.atom, {
      status: 'FAILED',
      detail: error instanceof Error ? error.message : 'Preflight failed',
    });
  }
};
