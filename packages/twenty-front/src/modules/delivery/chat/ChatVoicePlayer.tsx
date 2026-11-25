import { useEffect, useMemo, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { IconPlayerPause, IconPlayerPlay } from 'twenty-ui/icon';
import {
  StyledSpeedButton,
  StyledVoiceMeta,
  StyledVoicePlayBtn,
  StyledVoicePlayer,
  StyledWaveformBar,
  StyledWaveformBars,
} from '@/delivery/chat/chatStyles';
import {
  buildFallbackWaveform,
  type DeliveryChatAttachment,
  formatVoiceDuration,
} from '@/delivery/chat/deliveryChatTypes';
import { useChatAuthenticatedBlobUrl } from '@/delivery/chat/useChatFileAuth';

const PLAYBACK_RATES = [1, 1.5, 2] as const;

type ChatVoicePlayerProps = {
  attachment: DeliveryChatAttachment;
  localUrl?: string | null;
};

export const ChatVoicePlayer = ({
  attachment,
  localUrl,
}: ChatVoicePlayerProps) => {
  const { t } = useLingui();
  const [activated, setActivated] = useState(Boolean(localUrl));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [measuredDurationMs, setMeasuredDurationMs] = useState<number>(
    attachment.durationMs ?? 0,
  );
  const [rateIndex, setRateIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fetched = useChatAuthenticatedBlobUrl(
    localUrl ? null : attachment.id,
    activated && !localUrl,
  );
  const audioSrc = localUrl ?? fetched.url;

  const bars = useMemo(() => {
    if (attachment.waveform && attachment.waveform.length >= 4) {
      return attachment.waveform;
    }
    return buildFallbackWaveform(attachment.id, 28);
  }, [attachment.id, attachment.waveform]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = PLAYBACK_RATES[rateIndex];
  }, [rateIndex, audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc || !playing) return;
    audio.play().catch(() => {
      setPlaying(false);
    });
  }, [audioSrc, playing]);

  const togglePlay = () => {
    if (!activated) {
      setActivated(true);
      setPlaying(true);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      audio.play().catch(() => setPlaying(false));
    }
  };

  const seekToRatio = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    setProgress(clamped);
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = audio.duration * clamped;
      setElapsedMs(audio.currentTime * 1000);
    }
  };

  const displayMs = playing
    ? elapsedMs
    : measuredDurationMs || attachment.durationMs || 0;

  return (
    <StyledVoicePlayer>
      <StyledVoicePlayBtn
        type="button"
        aria-label={playing ? t`Pause voice message` : t`Play voice message`}
        disabled={fetched.loading}
        onClick={togglePlay}
      >
        {playing ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
      </StyledVoicePlayBtn>

      <StyledWaveformBars
        role="slider"
        tabIndex={0}
        aria-label={t`Voice message playback progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width > 0) {
            seekToRatio((event.clientX - rect.left) / rect.width);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') seekToRatio(progress + 0.1);
          if (event.key === 'ArrowLeft') seekToRatio(progress - 0.1);
        }}
      >
        {bars.map((height, index) => {
          const ratio = (index + 1) / bars.length;
          return (
            <StyledWaveformBar
              key={`${attachment.id}-bar-${index}`}
              data-played={ratio <= progress}
              style={{ height: `${Math.max(18, Math.min(100, height))}%` }}
            />
          );
        })}
      </StyledWaveformBars>

      <StyledVoiceMeta>
        <small>
          {fetched.error ? t`Error` : formatVoiceDuration(displayMs)}
        </small>
        <StyledSpeedButton
          type="button"
          aria-label={t`Change voice playback speed`}
          onClick={() =>
            setRateIndex((current) => (current + 1) % PLAYBACK_RATES.length)
          }
        >
          {PLAYBACK_RATES[rateIndex]}x
        </StyledSpeedButton>
      </StyledVoiceMeta>

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const dur = event.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setMeasuredDurationMs(Math.round(dur * 1000));
            }
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget;
            if (Number.isFinite(el.duration) && el.duration > 0) {
              setProgress(el.currentTime / el.duration);
              setElapsedMs(el.currentTime * 1000);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setElapsedMs(0);
          }}
        />
      )}
    </StyledVoicePlayer>
  );
};
