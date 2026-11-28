import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type StudioReferenceVideoDTO } from '@/delivery/studio/delivery-studio.types';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';

const MIN_CLIP_SEC = 0.5;
const RECOMMENDED_MAX_SEC = 15;
const FILMSTRIP_FRAME_COUNT = 8;

const StyledBackdrop = styled.div`
  align-items: center;
  backdrop-filter: blur(5px);
  background: ${themeCssVariables.background.transparent.strong};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: 1300;
`;

const StyledModal = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  max-height: 92vh;
  max-width: 560px;
  overflow: hidden;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
`;

const StyledHeaderTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledCloseButton = styled.button`
  background: transparent;
  border: none;
  border-radius: 6px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.tertiary};
    color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 14px 16px;
`;

const StyledVideoStage = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  height: 260px;
  justify-content: center;
  overflow: hidden;
  position: relative;
  width: 100%;

  video {
    height: 100%;
    max-height: 260px;
    object-fit: contain;
    width: 100%;
  }
`;

const StyledStageBadgeRow = styled.div`
  bottom: 8px;
  display: flex;
  justify-content: space-between;
  left: 8px;
  pointer-events: none;
  position: absolute;
  right: 8px;
`;

const StyledStageBadge = styled.span`
  background: ${themeCssVariables.background.transparent.strong};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.inverted};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding: 3px 8px;
`;

const StyledStageMuteButton = styled.button`
  background: ${themeCssVariables.background.transparent.strong};
  border: none;
  border-radius: 6px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  pointer-events: auto;
`;

const StyledTimelineSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledTimelineTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  height: 48px;
  overflow: hidden;
  position: relative;
  touch-action: none;
  user-select: none;
  width: 100%;
`;

const StyledFilmstrip = styled.div`
  display: flex;
  height: 100%;
  inset: 0;
  pointer-events: none;
  position: absolute;
  width: 100%;

  img {
    flex: 1;
    height: 100%;
    min-width: 0;
    object-fit: cover;
    opacity: 0.9;
  }
`;

const StyledTrimShade = styled.div`
  background: ${themeCssVariables.background.transparent.strong};
  bottom: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  z-index: 2;
`;

const StyledSelectionWindow = styled.div`
  background: ${themeCssVariables.color.transparent.blue2};
  border-bottom: 3px solid ${themeCssVariables.color.blue};
  border-top: 3px solid ${themeCssVariables.color.blue};
  bottom: 0;
  box-sizing: border-box;
  cursor: grab;
  position: absolute;
  top: 0;
  z-index: 3;

  &:active {
    cursor: grabbing;
  }
`;

const StyledHandle = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.blue};
  bottom: 0;
  color: ${themeCssVariables.font.color.inverted};
  cursor: ew-resize;
  display: flex;
  justify-content: center;
  position: absolute;
  top: 0;
  width: 14px;
  z-index: 5;

  &::after {
    background: ${themeCssVariables.font.color.inverted};
    border-radius: 2px;
    content: '';
    height: 18px;
    width: 3px;
  }
`;

const StyledPlayhead = styled.div`
  background: ${themeCssVariables.font.color.inverted};
  border-left: 1px solid ${themeCssVariables.font.color.primary};
  bottom: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  transform: translateX(-1px);
  width: 2px;
  z-index: 4;
`;

const StyledControlsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
`;

const StyledControlsLeft = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const StyledControlsRight = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledSmallButton = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledHintPillButton = styled.button`
  background: ${themeCssVariables.color.amber3};
  border: 1px solid ${themeCssVariables.color.amber11};
  border-radius: 7px;
  color: ${themeCssVariables.color.amber11};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`;

const StyledTimeInputs = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
`;

const StyledTimeField = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;

  input {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    padding: 4px 6px;
    width: 58px;
  }
`;

const StyledDurationPill = styled.span`
  background: ${themeCssVariables.color.transparent.blue2};
  border: 1px solid ${themeCssVariables.color.blue};
  border-radius: 999px;
  color: ${themeCssVariables.color.blue};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding: 3px 9px;
`;

const StyledMetaForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledMetaRow = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StyledFieldLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;

  input[type='text'] {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 12px;
    padding: 7px 10px;
  }
`;

const StyledError = styled.div`
  background: ${themeCssVariables.color.transparent.red1};
  border: 1px solid ${themeCssVariables.color.red};
  border-radius: 8px;
  color: ${themeCssVariables.color.red};
  font-size: 12px;
  padding: 8px 10px;
`;

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 12px 16px;
`;

const StyledCheckboxLabel = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
`;

const StyledFooterActions = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

const StyledCancelButton = styled.button`
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  padding: 7px 12px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledPrimaryButton = styled.button`
  background: ${themeCssVariables.font.color.primary};
  border: none;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 14px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const formatSec = (sec: number): string => {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped - mins * 60;
  const remStr = rem.toFixed(1).padStart(4, '0');
  return mins > 0 ? `${mins}:${remStr}` : `${rem.toFixed(1)}s`;
};

const roundTenth = (val: number): number => Math.round(val * 10) / 10;

type DragMode =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'range'; anchorClientX: number; initStart: number; initEnd: number }
  | { kind: 'scrub' };

export type DeliveryStudioVideoTrimmerModalProps = {
  file: File;
  companyId: string | null;
  projectId: string | null;
  initialTitle?: string;
  initialNotes?: string;
  initialClientOnly?: boolean;
  onSaved: (video: StudioReferenceVideoDTO) => Promise<void> | void;
  onCancel: () => void;
};

export const DeliveryStudioVideoTrimmerModal = ({
  file,
  companyId,
  projectId,
  initialTitle,
  initialNotes,
  initialClientOnly = false,
  onSaved,
  onCancel,
}: DeliveryStudioVideoTrimmerModalProps) => {
  const store = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number | undefined>(undefined);
  const [videoHeight, setVideoHeight] = useState<number | undefined>(undefined);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(true);
  const [filmstrip, setFilmstrip] = useState<string[]>([]);

  const [title, setTitle] = useState<string>(
    initialTitle?.trim() || file.name.replace(/\.[^.]+$/, ''),
  );
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [clientOnly, setClientOnly] = useState<boolean>(initialClientOnly);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setVideoUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Generate lightweight filmstrip preview frames from the local file
  useEffect(() => {
    if (!videoUrl || duration <= 0) {
      setFilmstrip([]);
      return;
    }

    let cancelled = false;
    const offscreen = document.createElement('video');
    offscreen.muted = true;
    offscreen.playsInline = true;
    offscreen.preload = 'auto';
    offscreen.src = videoUrl;

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const ctx = canvas.getContext('2d');

    const generate = async () => {
      if (!ctx) return;
      await new Promise<void>((resolve) => {
        if (offscreen.readyState >= 1) {
          resolve();
          return;
        }
        const onReady = () => {
          offscreen.removeEventListener('loadeddata', onReady);
          offscreen.removeEventListener('error', onReady);
          resolve();
        };
        offscreen.addEventListener('loadeddata', onReady, { once: true });
        offscreen.addEventListener('error', onReady, { once: true });
      });

      const frames: string[] = [];
      for (let i = 0; i < FILMSTRIP_FRAME_COUNT; i += 1) {
        if (cancelled) return;
        const target = Math.min(
          Math.max(0, duration - 0.05),
          ((i + 0.5) / FILMSTRIP_FRAME_COUNT) * duration,
        );
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 900);
          const onSeeked = () => {
            window.clearTimeout(timer);
            resolve();
          };
          offscreen.addEventListener('seeked', onSeeked, { once: true });
          try {
            offscreen.currentTime = target;
          } catch {
            window.clearTimeout(timer);
            resolve();
          }
        });
        if (cancelled) return;
        try {
          ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.6));
        } catch {
          // Ignore canvas read error for unsupported codecs
        }
      }
      if (!cancelled && frames.length > 0) {
        setFilmstrip(frames);
      }
    };

    void generate();

    return () => {
      cancelled = true;
      offscreen.pause();
      offscreen.removeAttribute('src');
      try {
        offscreen.load();
      } catch {
        // ignore
      }
    };
  }, [videoUrl, duration]);

  const minGap = useMemo(
    () => (duration > 0 ? Math.min(MIN_CLIP_SEC, duration) : MIN_CLIP_SEC),
    [duration],
  );

  const selectedDuration = Math.max(0, endSec - startSec);
  const isTrimmed =
    duration > 0 && (startSec > 0.05 || endSec < duration - 0.05);

  const seekTo = useCallback((sec: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const clamped = Math.max(0, sec);
    vid.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const togglePlayback = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || duration <= 0) return;
    if (vid.paused) {
      if (vid.currentTime < startSec || vid.currentTime >= endSec - 0.04) {
        vid.currentTime = startSec;
      }
      void vid.play().catch(() => undefined);
    } else {
      vid.pause();
    }
  }, [duration, startSec, endSec]);

  // Keep playhead silky smooth and looped strictly inside [startSec, endSec]
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    const tick = () => {
      const vid = videoRef.current;
      if (vid && !vid.paused) {
        if (vid.currentTime >= endSec - 0.03 || vid.currentTime < startSec - 0.05) {
          vid.currentTime = startSec;
          setCurrentTime(startSec);
        } else {
          setCurrentTime(vid.currentTime);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, startSec, endSec]);

  // Keyboard shortcuts: Space for play/pause, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onCancel();
      } else if (event.key === ' ' && !isTextInput) {
        event.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, onCancel, togglePlayback]);

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleTrackPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'start' | 'end' | 'range' | 'scrub',
  ) => {
    if (duration <= 0 || saving) return;
    event.stopPropagation();
    const vid = videoRef.current;
    if (vid && !vid.paused) {
      vid.pause();
    }

    if (kind === 'range') {
      setDragMode({
        kind: 'range',
        anchorClientX: event.clientX,
        initStart: startSec,
        initEnd: endSec,
      });
    } else {
      setDragMode({ kind });
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (kind === 'scrub') {
      const t = timeFromClientX(event.clientX);
      const clamped = Math.max(startSec, Math.min(endSec, t));
      seekTo(clamped);
    }
  };

  const handleTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragMode || duration <= 0) return;

    if (dragMode.kind === 'start') {
      const raw = timeFromClientX(event.clientX);
      const next = Math.max(0, Math.min(raw, endSec - minGap));
      const rounded = roundTenth(next);
      setStartSec(rounded);
      seekTo(rounded);
      return;
    }

    if (dragMode.kind === 'end') {
      const raw = timeFromClientX(event.clientX);
      const next = Math.min(duration, Math.max(raw, startSec + minGap));
      const rounded = roundTenth(next);
      setEndSec(rounded);
      seekTo(rounded);
      return;
    }

    if (dragMode.kind === 'range') {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const deltaSec =
        ((event.clientX - dragMode.anchorClientX) / rect.width) * duration;
      const span = dragMode.initEnd - dragMode.initStart;
      let nextStart = dragMode.initStart + deltaSec;
      if (nextStart < 0) nextStart = 0;
      if (nextStart + span > duration) nextStart = duration - span;
      const roundedStart = roundTenth(nextStart);
      const roundedEnd = roundTenth(Math.min(duration, roundedStart + span));
      setStartSec(roundedStart);
      setEndSec(roundedEnd);
      seekTo(roundedStart);
      return;
    }

    if (dragMode.kind === 'scrub') {
      const raw = timeFromClientX(event.clientX);
      const clamped = Math.max(startSec, Math.min(endSec, raw));
      seekTo(clamped);
    }
  };

  const handleTrackPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragMode) {
      setDragMode(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleFitRecommended = () => {
    if (duration <= 0) return;
    const nextEnd = roundTenth(
      Math.min(duration, startSec + RECOMMENDED_MAX_SEC),
    );
    setEndSec(nextEnd);
    seekTo(startSec);
  };

  const handleReset = () => {
    if (duration <= 0) return;
    setStartSec(0);
    setEndSec(duration);
    seekTo(0);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    setUploadPct(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'title',
        title.trim() || file.name.replace(/\.[^.]+$/, ''),
      );
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }
      if (duration > 0) {
        formData.append('durationSec', String(roundTenth(duration)));
      }
      if (videoWidth) {
        formData.append('width', String(videoWidth));
      }
      if (videoHeight) {
        formData.append('height', String(videoHeight));
      }
      if (isTrimmed) {
        formData.append('trimStartSec', startSec.toFixed(3));
        formData.append('trimEndSec', endSec.toFixed(3));
      }
      if (clientOnly && companyId) {
        formData.append('companyId', companyId);
        if (projectId) {
          formData.append('projectId', projectId);
        }
      }

      const uploaded = await uploadStudioMultipart<StudioReferenceVideoDTO>({
        store,
        endpointPath: '/portal/delivery-studio/reference-videos/upload',
        formData,
        onProgress: (pct) => setUploadPct(pct),
      });

      await onSaved(uploaded);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save reference video.',
      );
      setSaving(false);
      setUploadPct(null);
    }
  };

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 100;
  const playheadPct =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  const ctaLabel = saving
    ? uploadPct !== null && uploadPct < 100
      ? `Uploading ${uploadPct}%…`
      : isTrimmed
        ? 'Trimming & saving…'
        : 'Saving…'
    : duration > 0
      ? isTrimmed
        ? `Trim & Save (${selectedDuration.toFixed(1)}s)`
        : `Save Full Video (${duration.toFixed(1)}s)`
      : 'Save Video';

  return (
    <StyledBackdrop
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <StyledModal onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <StyledHeaderTitle>
            <h3>Trim Reference Video</h3>
            <span>
              Drag the blue handles to keep just the motion you want ·{' '}
              {file.name}
            </span>
          </StyledHeaderTitle>
          <StyledCloseButton
            type="button"
            disabled={saving}
            onClick={onCancel}
            aria-label="Cancel trim"
          >
            ×
          </StyledCloseButton>
        </StyledHeader>

        <StyledBody>
          {error && <StyledError>{error}</StyledError>}

          <StyledVideoStage onClick={togglePlayback}>
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                muted={muted}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  const dur =
                    Number.isFinite(vid.duration) && vid.duration > 0
                      ? vid.duration
                      : 0;
                  setDuration(dur);
                  setStartSec(0);
                  setEndSec(dur);
                  setCurrentTime(0);
                  if (vid.videoWidth > 0) setVideoWidth(vid.videoWidth);
                  if (vid.videoHeight > 0) setVideoHeight(vid.videoHeight);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  if (duration > 0 && vid.currentTime >= endSec - 0.03) {
                    vid.currentTime = startSec;
                    setCurrentTime(startSec);
                  } else {
                    setCurrentTime(vid.currentTime);
                  }
                }}
              />
            )}
            <StyledStageBadgeRow>
              <StyledStageBadge>
                {isPlaying ? '⏸' : '▶'} {formatSec(currentTime)}
                {duration > 0 ? ` / ${formatSec(duration)}` : ''}
              </StyledStageBadge>
              <StyledStageMuteButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((prev) => !prev);
                }}
              >
                {muted ? 'Muted' : 'Sound on'}
              </StyledStageMuteButton>
            </StyledStageBadgeRow>
          </StyledVideoStage>

          <StyledTimelineSection>
            <StyledTimelineTrack
              ref={trackRef}
              onPointerDown={(e) => handleTrackPointerDown(e, 'scrub')}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              onPointerCancel={handleTrackPointerUp}
            >
              {filmstrip.length > 0 && (
                <StyledFilmstrip>
                  {filmstrip.map((frame, index) => (
                    <img key={index} src={frame} alt="" draggable={false} />
                  ))}
                </StyledFilmstrip>
              )}

              {/* Left dimmed region */}
              <StyledTrimShade
                style={{ left: 0, width: `${startPct}%` }}
              />
              {/* Right dimmed region */}
              <StyledTrimShade
                style={{ left: `${endPct}%`, right: 0 }}
              />

              {/* Active selection window (drag to shift entire clip) */}
              <StyledSelectionWindow
                style={{
                  left: `${startPct}%`,
                  width: `${Math.max(0, endPct - startPct)}%`,
                }}
                onPointerDown={(e) => handleTrackPointerDown(e, 'range')}
                onPointerMove={handleTrackPointerMove}
                onPointerUp={handleTrackPointerUp}
                onPointerCancel={handleTrackPointerUp}
                title="Drag to move selection"
              />

              {/* Left start trim handle */}
              <StyledHandle
                style={{
                  left: `calc(${startPct}% - 1px)`,
                  borderRadius: '6px 0 0 6px',
                }}
                onPointerDown={(e) => handleTrackPointerDown(e, 'start')}
                onPointerMove={handleTrackPointerMove}
                onPointerUp={handleTrackPointerUp}
                onPointerCancel={handleTrackPointerUp}
                title="Drag to set start time"
              />

              {/* Right end trim handle */}
              <StyledHandle
                style={{
                  left: `calc(${endPct}% - 13px)`,
                  borderRadius: '0 6px 6px 0',
                }}
                onPointerDown={(e) => handleTrackPointerDown(e, 'end')}
                onPointerMove={handleTrackPointerMove}
                onPointerUp={handleTrackPointerUp}
                onPointerCancel={handleTrackPointerUp}
                title="Drag to set end time"
              />

              {/* Playhead */}
              <StyledPlayhead style={{ left: `${playheadPct}%` }} />
            </StyledTimelineTrack>

            <StyledControlsRow>
              <StyledControlsLeft>
                <StyledSmallButton
                  type="button"
                  disabled={duration <= 0 || saving}
                  onClick={togglePlayback}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Preview clip'}
                </StyledSmallButton>

                <StyledTimeInputs>
                  <StyledTimeField>
                    In
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, roundTenth(endSec - minGap))}
                      step={0.1}
                      disabled={duration <= 0 || saving}
                      value={roundTenth(startSec)}
                      onChange={(e) => {
                        if (e.target.value.trim() === '') return;
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const clamped = Math.max(
                          0,
                          Math.min(val, endSec - minGap),
                        );
                        setStartSec(roundTenth(clamped));
                        seekTo(clamped);
                      }}
                    />
                  </StyledTimeField>
                  <StyledTimeField>
                    Out
                    <input
                      type="number"
                      min={roundTenth(startSec + minGap)}
                      max={roundTenth(duration)}
                      step={0.1}
                      disabled={duration <= 0 || saving}
                      value={roundTenth(endSec)}
                      onChange={(e) => {
                        if (e.target.value.trim() === '') return;
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const clamped = Math.min(
                          duration,
                          Math.max(val, startSec + minGap),
                        );
                        setEndSec(roundTenth(clamped));
                        seekTo(clamped);
                      }}
                    />
                  </StyledTimeField>
                </StyledTimeInputs>
              </StyledControlsLeft>

              <StyledControlsRight>
                {duration > 0 && (
                  <StyledDurationPill>
                    {selectedDuration.toFixed(1)}s
                  </StyledDurationPill>
                )}
                {selectedDuration > RECOMMENDED_MAX_SEC && (
                  <StyledHintPillButton
                    type="button"
                    disabled={saving}
                    onClick={handleFitRecommended}
                    title="Reference clips up to 15s match Seedance's max length cleanly"
                  >
                    Fit 15s
                  </StyledHintPillButton>
                )}
                {isTrimmed && (
                  <StyledSmallButton
                    type="button"
                    disabled={saving}
                    onClick={handleReset}
                  >
                    Reset
                  </StyledSmallButton>
                )}
              </StyledControlsRight>
            </StyledControlsRow>
          </StyledTimelineSection>

          <StyledMetaForm>
            <StyledMetaRow>
              <StyledFieldLabel>
                Title
                <input
                  type="text"
                  placeholder="e.g. Walking Fit Check Ref"
                  disabled={saving}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </StyledFieldLabel>
              <StyledFieldLabel>
                Notes (optional)
                <input
                  type="text"
                  placeholder="Camera movement, pacing…"
                  disabled={saving}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </StyledFieldLabel>
            </StyledMetaRow>
          </StyledMetaForm>
        </StyledBody>

        <StyledFooter>
          {companyId && (
            <StyledCheckboxLabel>
              <input
                type="checkbox"
                checked={clientOnly}
                disabled={saving}
                onChange={(e) => setClientOnly(e.target.checked)}
              />
              This client only
            </StyledCheckboxLabel>
          )}
          <StyledFooterActions>
            <StyledCancelButton
              type="button"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </StyledCancelButton>
            <StyledPrimaryButton
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {ctaLabel}
            </StyledPrimaryButton>
          </StyledFooterActions>
        </StyledFooter>
      </StyledModal>
    </StyledBackdrop>
  );
};
