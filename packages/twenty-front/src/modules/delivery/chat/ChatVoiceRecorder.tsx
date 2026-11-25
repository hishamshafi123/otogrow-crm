import { useCallback, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { IconPlayerStop, IconSend, IconTrash } from 'twenty-ui/icon';
import {
  StyledIconButton,
  StyledRecorderBar,
  StyledRecordingDot,
  StyledSendButton,
  StyledWaveformBar,
  StyledWaveformBars,
} from '@/delivery/chat/chatStyles';
import { formatVoiceDuration } from '@/delivery/chat/deliveryChatTypes';

const MAX_RECORD_MS = 5 * 60 * 1000;
const WAVEFORM_BARS = 28;

export type RecordedVoiceClip = {
  blob: Blob;
  durationMs: number;
  waveform: number[];
};

type ChatVoiceRecorderProps = {
  onCancel: () => void;
  onComplete: (clip: RecordedVoiceClip, sendImmediately: boolean) => void;
  onError: (message: string) => void;
};

const pickSupportedAudioMime = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
};

const downsampleWaveform = (
  samples: number[],
  targetCount: number,
): number[] => {
  if (samples.length === 0) {
    return Array.from({ length: targetCount }, () => 25);
  }
  const result: number[] = [];
  const step = samples.length / targetCount;
  for (let i = 0; i < targetCount; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < samples.length; j += 1) {
      sum += samples[j];
      count += 1;
    }
    result.push(
      Math.max(12, Math.min(100, Math.round(sum / Math.max(1, count)))),
    );
  }
  return result;
};

export const ChatVoiceRecorder = ({
  onCancel,
  onComplete,
  onError,
}: ChatVoiceRecorderProps) => {
  const { t } = useLingui();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>(() =>
    Array.from({ length: WAVEFORM_BARS }, () => 18),
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Active MediaRecorder session resources must be cleaned up synchronously on unmount/stop.
  const sessionRef = useRef<{
    recorder: MediaRecorder | null;
    stream: MediaStream | null;
    audioCtx: AudioContext | null;
    chunks: Blob[];
    samples: number[];
    startedAt: number;
    timerId: number | null;
    cancelled: boolean;
    sendImmediately: boolean;
  }>({
    recorder: null,
    stream: null,
    audioCtx: null,
    chunks: [],
    samples: [],
    startedAt: 0,
    timerId: null,
    cancelled: false,
    sendImmediately: false,
  });

  const cleanupMedia = useCallback(() => {
    const session = sessionRef.current;
    if (session.timerId !== null) {
      window.clearInterval(session.timerId);
      session.timerId = null;
    }
    session.stream?.getTracks().forEach((track) => track.stop());
    session.stream = null;
    if (session.audioCtx && session.audioCtx.state !== 'closed') {
      void session.audioCtx.close().catch(() => undefined);
    }
    session.audioCtx = null;
  }, []);

  const stopRecording = useCallback(
    (sendImmediately: boolean) => {
      const session = sessionRef.current;
      session.sendImmediately = sendImmediately;
      if (session.recorder && session.recorder.state !== 'inactive') {
        session.recorder.stop();
      } else {
        cleanupMedia();
        onCancel();
      }
    },
    [cleanupMedia, onCancel],
  );

  useEffect(() => {
    let disposed = false;
    const session = sessionRef.current;
    session.cancelled = false;
    session.chunks = [];
    session.samples = [];

    const start = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        onError(t`Voice recording is not supported in this browser.`);
        onCancel();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        session.stream = stream;
        const mimeType = pickSupportedAudioMime();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        session.recorder = recorder;
        session.startedAt = Date.now();

        let analyser: AnalyserNode | null = null;
        let dataArray: Uint8Array<ArrayBuffer> | null = null;
        if (typeof AudioContext !== 'undefined') {
          try {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            source.connect(analyser);
            dataArray = new Uint8Array(
              new ArrayBuffer(analyser.frequencyBinCount),
            );
            session.audioCtx = audioCtx;
          } catch {
            analyser = null;
          }
        }

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            session.chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const durationMs = Math.max(500, Date.now() - session.startedAt);
          const blobType = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(session.chunks, { type: blobType });
          const waveform = downsampleWaveform(session.samples, WAVEFORM_BARS);
          const wasCancelled = session.cancelled;
          const sendNow = session.sendImmediately;
          cleanupMedia();
          if (wasCancelled || disposed) return;
          if (blob.size === 0) {
            onError(t`Voice recording was empty. Try again.`);
            onCancel();
            return;
          }
          onComplete({ blob, durationMs, waveform }, sendNow);
        };

        recorder.start(200);
        session.timerId = window.setInterval(() => {
          const elapsed = Date.now() - session.startedAt;
          setElapsedMs(elapsed);
          let level = 25;
          if (analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i += 1) {
              sum += dataArray[i];
            }
            const avg = sum / Math.max(1, dataArray.length);
            level = Math.max(14, Math.min(100, Math.round((avg / 140) * 100)));
          } else {
            level = 20 + Math.round((Math.sin(elapsed / 180) + 1) * 32);
          }
          session.samples.push(level);
          setLiveBars((prev) => [...prev.slice(1), level]);
          if (elapsed >= MAX_RECORD_MS) {
            stopRecording(false);
          }
        }, 120);
      } catch {
        if (!disposed) {
          onError(
            t`Microphone access was denied. Allow microphone access in your browser to send voice messages.`,
          );
          onCancel();
        }
      }
    };

    void start();
    return () => {
      disposed = true;
      session.cancelled = true;
      if (session.recorder && session.recorder.state !== 'inactive') {
        try {
          session.recorder.stop();
        } catch {
          // ignore
        }
      }
      cleanupMedia();
    };
  }, [cleanupMedia, onCancel, onComplete, onError, stopRecording, t]);

  return (
    <StyledRecorderBar role="status" aria-live="polite">
      <StyledRecordingDot />
      <strong>{formatVoiceDuration(elapsedMs)}</strong>
      <StyledWaveformBars aria-hidden="true">
        {liveBars.map((height, index) => (
          <StyledWaveformBar
            key={`rec-bar-${index}`}
            data-played="true"
            style={{ height: `${height}%` }}
          />
        ))}
      </StyledWaveformBars>
      <StyledIconButton
        type="button"
        data-danger="true"
        aria-label={t`Cancel voice recording`}
        title={t`Cancel`}
        onClick={() => {
          sessionRef.current.cancelled = true;
          stopRecording(false);
          onCancel();
        }}
      >
        <IconTrash size={16} />
      </StyledIconButton>
      <StyledIconButton
        type="button"
        aria-label={t`Stop and attach voice note`}
        title={t`Stop & preview`}
        onClick={() => stopRecording(false)}
      >
        <IconPlayerStop size={16} />
      </StyledIconButton>
      <StyledSendButton
        type="button"
        aria-label={t`Send voice message`}
        onClick={() => stopRecording(true)}
      >
        <IconSend size={15} />
        {t`Send`}
      </StyledSendButton>
    </StyledRecorderBar>
  );
};
