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
import {
  type StudioAssetDTO,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';

const MIN_CLIP_SEC = 0.5;
const MAX_CLIPS = 8;
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
  max-width: 720px;
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
  height: 264px;
  justify-content: center;
  overflow: hidden;
  position: relative;
  width: 100%;

  video {
    height: 100%;
    max-height: 264px;
    object-fit: contain;
    width: 100%;
  }
`;

const StyledStageTopRow = styled.div`
  display: flex;
  justify-content: space-between;
  left: 8px;
  pointer-events: none;
  position: absolute;
  right: 8px;
  top: 8px;
`;

const StyledStageBottomRow = styled.div`
  align-items: center;
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

const StyledStageActionButton = styled.button`
  background: ${themeCssVariables.background.transparent.strong};
  border: none;
  border-radius: 6px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
  pointer-events: auto;
`;

const StyledSectionLabelRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    font-weight: 600;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledClipStrip = styled.div`
  align-items: stretch;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
`;

const StyledClipCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1.5px solid ${themeCssVariables.border.color.light};
  border-radius: 9px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 6px;
  padding: 7px 8px;
  transition: border-color 120ms ease;
  width: 152px;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }

  &[data-active='true'] {
    background: ${themeCssVariables.color.transparent.blue2};
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledClipCardTop = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
  justify-content: space-between;
`;

const StyledClipThumb = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border-radius: 5px;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  height: 30px;
  justify-content: center;
  overflow: hidden;
  width: 30px;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledClipMeta = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
`;

const StyledClipCardActions = styled.div`
  align-items: center;
  display: flex;
  gap: 4px;
  justify-content: space-between;
`;

const StyledMiniIconBtn = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 5px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
`;

const StyledAddClipColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 5px;
  justify-content: center;
  min-width: 124px;
`;

const StyledAddUploadButton = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px dashed ${themeCssVariables.border.color.strong};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 11px;
  font-weight: 600;
  gap: 4px;
  justify-content: center;
  padding: 7px 10px;
  text-align: center;

  &:hover {
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.color.blue};
  }

  input {
    display: none;
  }
`;

const StyledAddStudioButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-size: 11px;
  font-weight: 600;
  justify-content: center;
  padding: 6px 10px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledStudioPickerPanel = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
`;

const StyledStudioPickerGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 120px;
  overflow-y: auto;
`;

const StyledStudioPickerChip = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  padding: 5px 9px;

  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 10px;
  }
`;

const StyledTrimmerBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
`;

const StyledTimelineTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  height: 46px;
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

const StyledControlsGroup = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledSmallButton = styled.button`
  background: ${themeCssVariables.background.primary};
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

  &[data-active='true'] {
    background: ${themeCssVariables.font.color.primary};
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.inverted};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledTimeField = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    padding: 4px 6px;
    width: 56px;
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

const StyledTitleInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-family: inherit;
  font-size: 12px;
  min-width: 180px;
  padding: 7px 10px;
`;

const StyledFooterActions = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
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
  white-space: nowrap;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

type EditorClipItem = {
  uid: string;
  sourceType: 'ASSET' | 'UPLOAD';
  assetId?: string;
  file?: File;
  title: string;
  srcUrl: string;
  thumbnailUrl?: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  muted: boolean;
  objectUrl?: string;
};

type DragMode =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'range'; anchorClientX: number; initStart: number; initEnd: number }
  | { kind: 'scrub' };

const roundTenth = (val: number): number => Math.round(val * 10) / 10;

const formatSec = (sec: number): string => {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped - mins * 60;
  const remStr = rem.toFixed(1).padStart(4, '0');
  return mins > 0 ? `${mins}:${remStr}` : `${rem.toFixed(1)}s`;
};

const probeVideoDuration = (srcUrl: string): Promise<number> =>
  new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.muted = true;
    const finish = (dur: number) => {
      vid.removeAttribute('src');
      try {
        vid.load();
      } catch {
        // ignore
      }
      resolve(dur);
    };
    const timer = window.setTimeout(() => finish(0), 5000);
    vid.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(
        Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0,
      );
    };
    vid.onerror = () => {
      window.clearTimeout(timer);
      finish(0);
    };
    vid.src = srcUrl;
  });

const buildClipFromAsset = (asset: StudioAssetDTO, uid: string): EditorClipItem => {
  const knownDur =
    typeof asset.mediaMeta?.durationSec === 'number' &&
    Number.isFinite(asset.mediaMeta.durationSec) &&
    asset.mediaMeta.durationSec > 0
      ? asset.mediaMeta.durationSec
      : 0;
  return {
    uid,
    sourceType: 'ASSET',
    assetId: asset.id,
    title: asset.title,
    srcUrl: studioMediaUrl(asset.mediaPath) ?? '',
    thumbnailUrl: studioMediaUrl(asset.thumbnailPath),
    duration: knownDur,
    trimStart: 0,
    trimEnd: knownDur,
    muted: false,
  };
};

export type DeliveryStudioVideoEditorModalProps = {
  companyId: string;
  projectId: string | null;
  initialVideo: StudioAssetDTO;
  availableVideos: StudioAssetDTO[];
  primaryCtaLabel?: string;
  onSaved: (video: StudioAssetDTO) => Promise<void> | void;
  onClose: () => void;
};

export const DeliveryStudioVideoEditorModal = ({
  companyId,
  projectId,
  initialVideo,
  availableVideos,
  primaryCtaLabel = 'Save & Open Text Hooks →',
  onSaved,
  onClose,
}: DeliveryStudioVideoEditorModalProps) => {
  const store = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const initialClip = useMemo(
    () => buildClipFromAsset(initialVideo, `clip-init-${initialVideo.id}`),
    [initialVideo],
  );

  const [clips, setClips] = useState<EditorClipItem[]>([initialClip]);
  const [activeClipUid, setActiveClipUid] = useState<string>(initialClip.uid);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [playMode, setPlayMode] = useState<'NONE' | 'CLIP' | 'SEQUENCE'>('NONE');
  const [pendingAutoPlay, setPendingAutoPlay] = useState<boolean>(false);
  const [previewMuted, setPreviewMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [filmstripByClip, setFilmstripByClip] = useState<
    Record<string, string[]>
  >({});
  const [showStudioPicker, setShowStudioPicker] = useState<boolean>(false);

  const [title, setTitle] = useState<string>(`${initialVideo.title} (Edited)`);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revokeClipUrls = useCallback((items: EditorClipItem[]) => {
    items.forEach((item) => {
      if (item.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
      }
    });
  }, []);

  const handleClose = useCallback(() => {
    revokeClipUrls(clips);
    onClose();
  }, [clips, onClose, revokeClipUrls]);

  const activeClipIndex = useMemo(() => {
    const idx = clips.findIndex((c) => c.uid === activeClipUid);
    return idx >= 0 ? idx : 0;
  }, [clips, activeClipUid]);

  const activeClip = clips[activeClipIndex] ?? clips[0];
  const activeDuration = activeClip?.duration ?? 0;
  const activeStart = activeClip?.trimStart ?? 0;
  const activeEnd = activeClip?.trimEnd ?? activeDuration;
  const activeMinGap =
    activeDuration > 0 ? Math.min(MIN_CLIP_SEC, activeDuration) : MIN_CLIP_SEC;

  const totalEditedDuration = useMemo(
    () =>
      clips.reduce((acc, clip) => {
        if (clip.duration <= 0) return acc;
        return acc + Math.max(0, clip.trimEnd - clip.trimStart);
      }, 0),
    [clips],
  );

  const updateClip = useCallback(
    (uid: string, updater: (clip: EditorClipItem) => EditorClipItem) => {
      setClips((prev) =>
        prev.map((clip) => (clip.uid === uid ? updater(clip) : clip)),
      );
    },
    [],
  );

  // Probe duration for any clip that starts at duration 0
  useEffect(() => {
    const missing = clips.filter((c) => c.duration <= 0 && Boolean(c.srcUrl));
    if (missing.length === 0) return;

    let cancelled = false;
    missing.forEach((clip) => {
      void probeVideoDuration(clip.srcUrl).then((dur) => {
        if (cancelled || dur <= 0) return;
        setClips((prev) =>
          prev.map((item) =>
            item.uid === clip.uid && item.duration <= 0
              ? { ...item, duration: dur, trimStart: 0, trimEnd: dur }
              : item,
          ),
        );
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clips]);

  // Generate lightweight filmstrip thumbnails for the active clip (cached per clip uid)
  useEffect(() => {
    if (!activeClip || activeClip.duration <= 0 || !activeClip.srcUrl) return;
    if (filmstripByClip[activeClip.uid]?.length) return;

    let cancelled = false;
    const offscreen = document.createElement('video');
    if (!activeClip.srcUrl.startsWith('blob:')) {
      offscreen.crossOrigin = 'anonymous';
    }
    offscreen.muted = true;
    offscreen.playsInline = true;
    offscreen.preload = 'auto';
    offscreen.src = activeClip.srcUrl;

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
        const timer = window.setTimeout(resolve, 3500);
        const onReady = () => {
          window.clearTimeout(timer);
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
          Math.max(0, activeClip.duration - 0.05),
          ((i + 0.5) / FILMSTRIP_FRAME_COUNT) * activeClip.duration,
        );
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 800);
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
          frames.push(canvas.toDataURL('image/jpeg', 0.58));
        } catch {
          return;
        }
      }
      if (!cancelled && frames.length > 0) {
        setFilmstripByClip((prev) => ({
          ...prev,
          [activeClip.uid]: frames,
        }));
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
  }, [activeClip, filmstripByClip]);

  const seekTo = useCallback((sec: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const clamped = Math.max(0, sec);
    vid.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const stopPlayback = useCallback(() => {
    const vid = videoRef.current;
    if (vid && !vid.paused) {
      vid.pause();
    }
    setPlayMode('NONE');
    setPendingAutoPlay(false);
  }, []);

  const handleToggleClipPlayback = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !activeClip || activeDuration <= 0) return;

    if (playMode !== 'NONE' && !vid.paused) {
      stopPlayback();
      return;
    }

    if (vid.currentTime < activeStart || vid.currentTime >= activeEnd - 0.04) {
      vid.currentTime = activeStart;
      setCurrentTime(activeStart);
    }
    setPlayMode('CLIP');
    void vid.play().catch(() => setPlayMode('NONE'));
  }, [activeClip, activeDuration, activeStart, activeEnd, playMode, stopPlayback]);

  const handleToggleSequencePlayback = useCallback(() => {
    const vid = videoRef.current;
    if (clips.length === 0) return;

    if (playMode === 'SEQUENCE') {
      stopPlayback();
      return;
    }

    const firstClip = clips[0];
    setPlayMode('SEQUENCE');
    if (firstClip.uid !== activeClipUid) {
      setActiveClipUid(firstClip.uid);
      setPendingAutoPlay(true);
      setCurrentTime(firstClip.trimStart);
      return;
    }

    if (vid) {
      vid.currentTime = firstClip.trimStart;
      setCurrentTime(firstClip.trimStart);
      void vid.play().catch(() => setPlayMode('NONE'));
    }
  }, [clips, playMode, activeClipUid, stopPlayback]);

  // Smooth playhead tracking + clip loop / sequence auto-advance
  useEffect(() => {
    if (playMode === 'NONE' || !activeClip || activeDuration <= 0) return;

    let rafId = 0;
    const tick = () => {
      const vid = videoRef.current;
      if (vid && !vid.paused) {
        if (vid.currentTime >= activeEnd - 0.04) {
          if (playMode === 'SEQUENCE') {
            const nextClip = clips[activeClipIndex + 1];
            if (nextClip) {
              vid.pause();
              setActiveClipUid(nextClip.uid);
              setPendingAutoPlay(true);
              setCurrentTime(nextClip.trimStart);
              return;
            }
            vid.pause();
            vid.currentTime = activeEnd;
            setCurrentTime(activeEnd);
            setPlayMode('NONE');
            return;
          }
          vid.currentTime = activeStart;
          setCurrentTime(activeStart);
        } else {
          setCurrentTime(vid.currentTime);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    playMode,
    activeClip,
    activeClipIndex,
    activeDuration,
    activeStart,
    activeEnd,
    clips,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        handleClose();
      } else if (event.key === ' ' && !isTextInput) {
        event.preventDefault();
        handleToggleClipPlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, handleClose, handleToggleClipPlayback]);

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || activeDuration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * activeDuration;
    },
    [activeDuration],
  );

  const handleTrackPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'start' | 'end' | 'range' | 'scrub',
  ) => {
    if (!activeClip || activeDuration <= 0 || saving) return;
    event.stopPropagation();
    stopPlayback();

    if (kind === 'range') {
      setDragMode({
        kind: 'range',
        anchorClientX: event.clientX,
        initStart: activeStart,
        initEnd: activeEnd,
      });
    } else {
      setDragMode({ kind });
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (kind === 'scrub') {
      const t = timeFromClientX(event.clientX);
      const clamped = Math.max(activeStart, Math.min(activeEnd, t));
      seekTo(clamped);
    }
  };

  const handleTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragMode || !activeClip || activeDuration <= 0) return;

    if (dragMode.kind === 'start') {
      const raw = timeFromClientX(event.clientX);
      const next = roundTenth(
        Math.max(0, Math.min(raw, activeEnd - activeMinGap)),
      );
      updateClip(activeClip.uid, (c) => ({ ...c, trimStart: next }));
      seekTo(next);
      return;
    }

    if (dragMode.kind === 'end') {
      const raw = timeFromClientX(event.clientX);
      const next = roundTenth(
        Math.min(activeDuration, Math.max(raw, activeStart + activeMinGap)),
      );
      updateClip(activeClip.uid, (c) => ({ ...c, trimEnd: next }));
      seekTo(next);
      return;
    }

    if (dragMode.kind === 'range') {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const deltaSec =
        ((event.clientX - dragMode.anchorClientX) / rect.width) * activeDuration;
      const span = dragMode.initEnd - dragMode.initStart;
      let nextStart = dragMode.initStart + deltaSec;
      if (nextStart < 0) nextStart = 0;
      if (nextStart + span > activeDuration) {
        nextStart = activeDuration - span;
      }
      const roundedStart = roundTenth(nextStart);
      const roundedEnd = roundTenth(
        Math.min(activeDuration, roundedStart + span),
      );
      updateClip(activeClip.uid, (c) => ({
        ...c,
        trimStart: roundedStart,
        trimEnd: roundedEnd,
      }));
      seekTo(roundedStart);
      return;
    }

    if (dragMode.kind === 'scrub') {
      const raw = timeFromClientX(event.clientX);
      const clamped = Math.max(activeStart, Math.min(activeEnd, raw));
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

  const handleUploadExtraClips = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    stopPlayback();

    const remainingSlots = MAX_CLIPS - clips.length;
    if (remainingSlots <= 0) {
      setError(`Maximum of ${MAX_CLIPS} clips reached.`);
      return;
    }

    const picked = Array.from(files).slice(0, remainingSlots);
    const added: EditorClipItem[] = picked.map((file, idx) => {
      const objUrl = URL.createObjectURL(file);
      return {
        uid: `clip-upload-${Date.now()}-${idx}`,
        sourceType: 'UPLOAD',
        file,
        title: file.name.replace(/\.[^.]+$/, '') || `Clip ${clips.length + idx + 1}`,
        srcUrl: objUrl,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
        muted: false,
        objectUrl: objUrl,
      };
    });

    setClips((prev) => [...prev, ...added]);
    if (added[0]) {
      setActiveClipUid(added[0].uid);
      setCurrentTime(0);
    }
  };

  const handleAddStudioAssetClip = (asset: StudioAssetDTO) => {
    setError(null);
    stopPlayback();
    if (clips.length >= MAX_CLIPS) {
      setError(`Maximum of ${MAX_CLIPS} clips reached.`);
      return;
    }
    const uid = `clip-asset-${Date.now()}-${asset.id}`;
    const newClip = buildClipFromAsset(asset, uid);
    setClips((prev) => [...prev, newClip]);
    setActiveClipUid(uid);
    setCurrentTime(0);
    setShowStudioPicker(false);
  };

  const handleMoveClip = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= clips.length) return;
    stopPlayback();
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleRemoveClip = (uid: string) => {
    if (clips.length <= 1) return;
    stopPlayback();
    const removed = clips.find((c) => c.uid === uid);
    if (removed?.objectUrl) {
      URL.revokeObjectURL(removed.objectUrl);
    }
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.uid === uid);
      const next = prev.filter((c) => c.uid !== uid);
      if (uid === activeClipUid && next.length > 0) {
        const fallback = next[Math.min(idx, next.length - 1)];
        setActiveClipUid(fallback.uid);
        setCurrentTime(fallback.trimStart);
      }
      return next;
    });
  };

  const handleSelectClip = (clip: EditorClipItem) => {
    if (clip.uid === activeClipUid) return;
    stopPlayback();
    setActiveClipUid(clip.uid);
    setCurrentTime(clip.trimStart);
  };

  const handleSaveCut = async () => {
    setError(null);
    stopPlayback();
    setSaving(true);
    setUploadPct(0);

    try {
      const formData = new FormData();
      formData.append('companyId', companyId);
      if (projectId) {
        formData.append('projectId', projectId);
      }
      if (title.trim()) {
        formData.append('title', title.trim());
      }

      const uploadIndexByUid = new Map<string, number>();
      let nextUploadIdx = 0;

      const clipPayload = clips.map((clip) => {
        const isClipTrimmed =
          clip.duration > 0 &&
          (clip.trimStart > 0.05 || clip.trimEnd < clip.duration - 0.05);

        if (clip.sourceType === 'UPLOAD' && clip.file) {
          let uploadIdx = uploadIndexByUid.get(clip.uid);
          if (uploadIdx === undefined) {
            uploadIdx = nextUploadIdx;
            nextUploadIdx += 1;
            uploadIndexByUid.set(clip.uid, uploadIdx);
            formData.append('files', clip.file);
          }
          return {
            sourceType: 'UPLOAD' as const,
            uploadIndex: uploadIdx,
            ...(isClipTrimmed
              ? {
                  trimStartSec: Number(clip.trimStart.toFixed(3)),
                  trimEndSec: Number(clip.trimEnd.toFixed(3)),
                }
              : {}),
            muted: clip.muted,
          };
        }

        return {
          sourceType: 'ASSET' as const,
          assetId: clip.assetId,
          ...(isClipTrimmed
            ? {
                trimStartSec: Number(clip.trimStart.toFixed(3)),
                trimEndSec: Number(clip.trimEnd.toFixed(3)),
              }
            : {}),
          muted: clip.muted,
        };
      });

      formData.append('clipsJson', JSON.stringify(clipPayload));

      const hasUploads = nextUploadIdx > 0;
      const saved = await uploadStudioMultipart<StudioAssetDTO>({
        store,
        endpointPath: '/portal/delivery-studio/videos/compose',
        formData,
        onProgress: (pct) => setUploadPct(hasUploads ? pct : 100),
      });

      revokeClipUrls(clips);
      await onSaved(saved);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to render edited video cut.',
      );
      setSaving(false);
      setUploadPct(null);
    }
  };

  const activeStartPct =
    activeDuration > 0 ? (activeStart / activeDuration) * 100 : 0;
  const activeEndPct =
    activeDuration > 0 ? (activeEnd / activeDuration) * 100 : 100;
  const activePlayheadPct =
    activeDuration > 0
      ? Math.max(0, Math.min(100, (currentTime / activeDuration) * 100))
      : 0;
  const activeClipTrimmed =
    activeDuration > 0 &&
    (activeStart > 0.05 || activeEnd < activeDuration - 0.05);
  const activeFilmstrip = activeClip ? (filmstripByClip[activeClip.uid] ?? []) : [];

  const ctaLabel = saving
    ? uploadPct !== null && uploadPct < 100
      ? `Uploading clips ${uploadPct}%…`
      : clips.length > 1
        ? 'Stitching & rendering cut…'
        : 'Trimming & saving…'
    : primaryCtaLabel;

  return (
    <StyledBackdrop
      onClick={() => {
        if (!saving) handleClose();
      }}
    >
      <StyledModal onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <StyledHeaderTitle>
            <h3>Edit &amp; Stitch Video</h3>
            <span>
              Trim your AI clip, add more clips, trim each clip, then create
              text hook variations
            </span>
          </StyledHeaderTitle>
          <StyledCloseButton
            type="button"
            disabled={saving}
            onClick={handleClose}
            aria-label="Close video editor"
          >
            ×
          </StyledCloseButton>
        </StyledHeader>

        <StyledBody>
          {error && <StyledError>{error}</StyledError>}

          {/* Video Preview Stage */}
          <StyledVideoStage onClick={handleToggleClipPlayback}>
            {activeClip && (
              <video
                key={activeClip.uid}
                ref={videoRef}
                src={activeClip.srcUrl}
                poster={activeClip.thumbnailUrl}
                muted={previewMuted || activeClip.muted}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  const dur =
                    Number.isFinite(vid.duration) && vid.duration > 0
                      ? vid.duration
                      : 0;
                  if (dur > 0 && activeClip.duration <= 0) {
                    updateClip(activeClip.uid, (c) => ({
                      ...c,
                      duration: dur,
                      trimStart: 0,
                      trimEnd: dur,
                    }));
                  }
                  const targetStart = activeClip.trimStart;
                  if (targetStart > 0) {
                    vid.currentTime = targetStart;
                    setCurrentTime(targetStart);
                  } else {
                    setCurrentTime(0);
                  }
                  if (pendingAutoPlay) {
                    setPendingAutoPlay(false);
                    void vid.play().catch(() => setPlayMode('NONE'));
                  }
                }}
                onEnded={() => {
                  if (playMode === 'SEQUENCE') {
                    const nextClip = clips[activeClipIndex + 1];
                    if (nextClip) {
                      setActiveClipUid(nextClip.uid);
                      setPendingAutoPlay(true);
                      setCurrentTime(nextClip.trimStart);
                      return;
                    }
                  }
                  setPlayMode('NONE');
                }}
              />
            )}

            <StyledStageTopRow>
              <StyledStageBadge>
                Clip {activeClipIndex + 1} of {clips.length}
                {playMode === 'SEQUENCE' ? ' · Playing full cut' : ''}
                {activeClip?.muted ? ' · Muted' : ''}
              </StyledStageBadge>
              {totalEditedDuration > 0 && (
                <StyledStageBadge>
                  Total {totalEditedDuration.toFixed(1)}s
                </StyledStageBadge>
              )}
            </StyledStageTopRow>

            <StyledStageBottomRow>
              <StyledStageBadge>
                {playMode !== 'NONE' ? '⏸' : '▶'} {formatSec(currentTime)}
                {activeDuration > 0 ? ` / ${formatSec(activeDuration)}` : ''}
              </StyledStageBadge>
              <div style={{ display: 'flex', gap: 6 }}>
                {clips.length > 1 && (
                  <StyledStageActionButton
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSequencePlayback();
                    }}
                  >
                    {playMode === 'SEQUENCE' ? '■ Stop cut' : '▶ Play full cut'}
                  </StyledStageActionButton>
                )}
                <StyledStageActionButton
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewMuted((prev) => !prev);
                  }}
                >
                  {previewMuted ? 'Preview muted' : 'Sound on'}
                </StyledStageActionButton>
              </div>
            </StyledStageBottomRow>
          </StyledVideoStage>

          {/* Multi-Clip Storyboard Strip */}
          <div>
            <StyledSectionLabelRow style={{ marginBottom: 6 }}>
              <strong>
                Clip Sequence ({clips.length}/{MAX_CLIPS})
              </strong>
              <span>Click any clip to trim it · Use ← → to reorder</span>
            </StyledSectionLabelRow>

            <StyledClipStrip>
              {clips.map((clip, idx) => {
                const clipLen =
                  clip.duration > 0
                    ? Math.max(0, clip.trimEnd - clip.trimStart)
                    : 0;
                const isClipTrimmed =
                  clip.duration > 0 &&
                  (clip.trimStart > 0.05 || clip.trimEnd < clip.duration - 0.05);
                return (
                  <StyledClipCard
                    key={clip.uid}
                    data-active={clip.uid === activeClip?.uid}
                    onClick={() => handleSelectClip(clip)}
                  >
                    <StyledClipCardTop>
                      <StyledClipThumb>
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.title} />
                        ) : (
                          `#${idx + 1}`
                        )}
                      </StyledClipThumb>
                      <StyledClipMeta>
                        <strong>
                          #{idx + 1} {clip.title}
                        </strong>
                        <small>
                          {clipLen > 0 ? `${clipLen.toFixed(1)}s` : 'Loading…'}
                          {isClipTrimmed ? ' · trimmed' : ''}
                          {clip.muted ? ' · muted' : ''}
                        </small>
                      </StyledClipMeta>
                    </StyledClipCardTop>

                    <StyledClipCardActions
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: 'flex', gap: 3 }}>
                        <StyledMiniIconBtn
                          type="button"
                          disabled={idx === 0 || saving}
                          title="Move clip earlier"
                          onClick={() => handleMoveClip(idx, -1)}
                        >
                          ←
                        </StyledMiniIconBtn>
                        <StyledMiniIconBtn
                          type="button"
                          disabled={idx === clips.length - 1 || saving}
                          title="Move clip later"
                          onClick={() => handleMoveClip(idx, 1)}
                        >
                          →
                        </StyledMiniIconBtn>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <StyledMiniIconBtn
                          type="button"
                          disabled={saving}
                          title={
                            clip.muted
                              ? 'Unmute this clip in export'
                              : 'Mute this clip in export'
                          }
                          onClick={() =>
                            updateClip(clip.uid, (c) => ({
                              ...c,
                              muted: !c.muted,
                            }))
                          }
                        >
                          {clip.muted ? 'Muted' : 'Audio'}
                        </StyledMiniIconBtn>
                        {clips.length > 1 && (
                          <StyledMiniIconBtn
                            type="button"
                            disabled={saving}
                            title="Remove clip"
                            onClick={() => handleRemoveClip(clip.uid)}
                          >
                            ×
                          </StyledMiniIconBtn>
                        )}
                      </div>
                    </StyledClipCardActions>
                  </StyledClipCard>
                );
              })}

              {clips.length < MAX_CLIPS && (
                <StyledAddClipColumn>
                  <StyledAddUploadButton title="Upload an extra video clip (MP4, MOV, WebM) to stitch onto your video">
                    + Upload Clip
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                      multiple
                      disabled={saving}
                      onChange={(e) => {
                        handleUploadExtraClips(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </StyledAddUploadButton>
                  {availableVideos.length > 0 && (
                    <StyledAddStudioButton
                      type="button"
                      disabled={saving}
                      onClick={() => setShowStudioPicker((prev) => !prev)}
                    >
                      {showStudioPicker ? 'Close Library' : '+ From Studio'}
                    </StyledAddStudioButton>
                  )}
                </StyledAddClipColumn>
              )}
            </StyledClipStrip>
          </div>

          {/* Optional Inline Studio Library Picker */}
          {showStudioPicker && availableVideos.length > 0 && (
            <StyledStudioPickerPanel>
              <StyledSectionLabelRow>
                <strong>Add another clip from this client&apos;s Studio</strong>
                <span>Click any video to append it to your cut</span>
              </StyledSectionLabelRow>
              <StyledStudioPickerGrid>
                {availableVideos.map((vid) => (
                  <StyledStudioPickerChip
                    key={vid.id}
                    type="button"
                    onClick={() => handleAddStudioAssetClip(vid)}
                  >
                    <span>+ {vid.title}</span>
                    {vid.mediaMeta?.durationSec && (
                      <small>{Math.round(vid.mediaMeta.durationSec)}s</small>
                    )}
                  </StyledStudioPickerChip>
                ))}
              </StyledStudioPickerGrid>
            </StyledStudioPickerPanel>
          )}

          {/* Active Clip Trimmer */}
          {activeClip && (
            <StyledTrimmerBox>
              <StyledSectionLabelRow>
                <strong>
                  Trim Clip #{activeClipIndex + 1} · {activeClip.title}
                </strong>
                <span>Drag blue handles to trim · Drag blue bar to shift</span>
              </StyledSectionLabelRow>

              <StyledTimelineTrack
                ref={trackRef}
                onPointerDown={(e) => handleTrackPointerDown(e, 'scrub')}
                onPointerMove={handleTrackPointerMove}
                onPointerUp={handleTrackPointerUp}
                onPointerCancel={handleTrackPointerUp}
              >
                {activeFilmstrip.length > 0 && (
                  <StyledFilmstrip>
                    {activeFilmstrip.map((frame, i) => (
                      <img key={i} src={frame} alt="" draggable={false} />
                    ))}
                  </StyledFilmstrip>
                )}

                <StyledTrimShade
                  style={{ left: 0, width: `${activeStartPct}%` }}
                />
                <StyledTrimShade
                  style={{ left: `${activeEndPct}%`, right: 0 }}
                />

                <StyledSelectionWindow
                  style={{
                    left: `${activeStartPct}%`,
                    width: `${Math.max(0, activeEndPct - activeStartPct)}%`,
                  }}
                  onPointerDown={(e) => handleTrackPointerDown(e, 'range')}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerUp}
                  title="Drag to shift selection"
                />

                <StyledHandle
                  style={{
                    left: `calc(${activeStartPct}% - 1px)`,
                    borderRadius: '6px 0 0 6px',
                  }}
                  onPointerDown={(e) => handleTrackPointerDown(e, 'start')}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerUp}
                  title="Drag to set clip start"
                />

                <StyledHandle
                  style={{
                    left: `calc(${activeEndPct}% - 13px)`,
                    borderRadius: '0 6px 6px 0',
                  }}
                  onPointerDown={(e) => handleTrackPointerDown(e, 'end')}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerUp}
                  title="Drag to set clip end"
                />

                <StyledPlayhead style={{ left: `${activePlayheadPct}%` }} />
              </StyledTimelineTrack>

              <StyledControlsRow>
                <StyledControlsGroup>
                  <StyledSmallButton
                    type="button"
                    disabled={activeDuration <= 0 || saving}
                    onClick={handleToggleClipPlayback}
                  >
                    {playMode === 'CLIP'
                      ? '⏸ Pause'
                      : `▶ Preview #${activeClipIndex + 1}`}
                  </StyledSmallButton>

                  {clips.length > 1 && (
                    <StyledSmallButton
                      type="button"
                      data-active={playMode === 'SEQUENCE'}
                      disabled={saving}
                      onClick={handleToggleSequencePlayback}
                    >
                      {playMode === 'SEQUENCE'
                        ? '■ Stop Full Cut'
                        : `▶ Full Cut (${totalEditedDuration.toFixed(1)}s)`}
                    </StyledSmallButton>
                  )}

                  <StyledTimeField>
                    In
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, roundTenth(activeEnd - activeMinGap))}
                      step={0.1}
                      disabled={activeDuration <= 0 || saving}
                      value={roundTenth(activeStart)}
                      onChange={(e) => {
                        if (e.target.value.trim() === '') return;
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const clamped = roundTenth(
                          Math.max(0, Math.min(val, activeEnd - activeMinGap)),
                        );
                        updateClip(activeClip.uid, (c) => ({
                          ...c,
                          trimStart: clamped,
                        }));
                        seekTo(clamped);
                      }}
                    />
                  </StyledTimeField>

                  <StyledTimeField>
                    Out
                    <input
                      type="number"
                      min={roundTenth(activeStart + activeMinGap)}
                      max={roundTenth(activeDuration)}
                      step={0.1}
                      disabled={activeDuration <= 0 || saving}
                      value={roundTenth(activeEnd)}
                      onChange={(e) => {
                        if (e.target.value.trim() === '') return;
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const clamped = roundTenth(
                          Math.min(
                            activeDuration,
                            Math.max(val, activeStart + activeMinGap),
                          ),
                        );
                        updateClip(activeClip.uid, (c) => ({
                          ...c,
                          trimEnd: clamped,
                        }));
                        seekTo(clamped);
                      }}
                    />
                  </StyledTimeField>
                </StyledControlsGroup>

                <StyledControlsGroup>
                  {activeDuration > 0 && (
                    <StyledDurationPill>
                      {(activeEnd - activeStart).toFixed(1)}s
                    </StyledDurationPill>
                  )}
                  <StyledSmallButton
                    type="button"
                    data-active={activeClip.muted}
                    disabled={saving}
                    onClick={() =>
                      updateClip(activeClip.uid, (c) => ({
                        ...c,
                        muted: !c.muted,
                      }))
                    }
                  >
                    {activeClip.muted ? 'Audio Muted' : 'Audio On'}
                  </StyledSmallButton>
                  {activeClipTrimmed && (
                    <StyledSmallButton
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        updateClip(activeClip.uid, (c) => ({
                          ...c,
                          trimStart: 0,
                          trimEnd: c.duration,
                        }));
                        seekTo(0);
                      }}
                    >
                      Reset
                    </StyledSmallButton>
                  )}
                </StyledControlsGroup>
              </StyledControlsRow>
            </StyledTrimmerBox>
          )}
        </StyledBody>

        <StyledFooter>
          <StyledTitleInput
            type="text"
            value={title}
            disabled={saving}
            placeholder="Edited video title…"
            onChange={(e) => setTitle(e.target.value)}
          />
          <StyledFooterActions>
            <StyledCancelButton
              type="button"
              disabled={saving}
              onClick={handleClose}
            >
              Cancel
            </StyledCancelButton>
            <StyledPrimaryButton
              type="button"
              disabled={saving || clips.length === 0}
              onClick={() => void handleSaveCut()}
            >
              {ctaLabel}
            </StyledPrimaryButton>
          </StyledFooterActions>
        </StyledFooter>
      </StyledModal>
    </StyledBackdrop>
  );
};
