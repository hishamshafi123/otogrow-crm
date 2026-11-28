/* oxlint-disable twenty/no-hardcoded-colors */
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS,
  GET_DELIVERY_STUDIO_HOOK_PROJECT,
  RENDER_DELIVERY_STUDIO_VIDEO_HOOKS,
  SAVE_DELIVERY_STUDIO_HOOK_DEFAULT,
  SAVE_DELIVERY_STUDIO_VIDEO_TO_DRIVE,
  SUGGEST_DELIVERY_STUDIO_VIDEO_HOOKS,
  UPSERT_DELIVERY_STUDIO_PRESET,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  DEFAULT_TEXT_HOOK_MASTER_PROMPT,
  type StudioAssetDTO,
  type StudioDriveFoldersResponseDTO,
  type StudioHookDefaultSettingDTO,
  type StudioHookProjectDTO,
  type StudioPresetDTO,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { DeliveryStudioVideoEditorModal } from '@/delivery/studio/DeliveryStudioVideoEditorModal';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';

const StyledStageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const StyledSourceBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 12px 16px;
`;

const StyledSourceSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: 13px;
  max-width: 440px;
  min-width: 220px;
  padding: 7px 10px;
`;

const StyledUploadLabel = styled.label<{ disabled?: boolean }>`
  align-items: center;
  background: ${themeCssVariables.font.color.primary};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  padding: 7px 13px;

  &:hover {
    opacity: ${({ disabled }) => (disabled ? 0.5 : 0.9)};
  }

  input {
    display: none;
  }
`;

const StyledStageGrid = styled.div`
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const StyledPreviewColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 12px;
`;

const StyledVideoFrame = styled.div`
  aspect-ratio: 9 / 16;
  background: #0b0c10;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  user-select: none;
  width: 100%;

  video {
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledOverlayAnchor = styled.div`
  left: 0;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, -50%);
  transition: opacity 120ms ease;
  z-index: 4;
`;

const StyledPreviewCaption = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 11px;
  justify-content: space-between;
  padding: 0 2px;
`;

const StyledRightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const StyledPanel = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`;

const StyledPanelHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;

  h4 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
  }
`;

const StyledSubtleButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
  padding: 6px 11px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledPrimaryButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.font.color.primary};
  border: none;
  border-radius: 10px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
  justify-content: center;
  padding: 11px 18px;
  width: 100%;

  &:hover:not(:disabled) {
    opacity: 0.92;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledHookList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledHookRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 9px;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 9px 11px;
  transition: border-color 120ms ease;

  &[data-selected='true'] {
    background: ${themeCssVariables.color.transparent.blue2};
    border-color: ${themeCssVariables.color.blue};
  }

  &[data-previewing='true'] {
    box-shadow: 0 0 0 1px ${themeCssVariables.font.color.primary};
  }

  input[type='checkbox'] {
    cursor: pointer;
    flex-shrink: 0;
    height: 15px;
    width: 15px;
  }

  input[type='text'] {
    background: transparent;
    border: none;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-family: inherit;
    font-size: 13px;
    min-width: 0;
    outline: none;
  }
`;

const StyledAnglePill = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
`;

const StyledAddHookForm = styled.form`
  display: flex;
  gap: 8px;

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-size: 12px;
    padding: 8px 10px;
  }
`;

const StyledToggleHeader = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  justify-content: space-between;
  padding: 0;
  width: 100%;

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
    font-weight: 400;
  }
`;

const StyledStyleGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledMiniField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;

  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    padding: 6px 8px;
  }
`;

const StyledPresetRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledPresetChip = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;

  &[data-active='true'] {
    background: ${themeCssVariables.font.color.primary};
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.inverted};
  }
`;

const StyledDriveRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  select,
  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-size: 12px;
    min-width: 160px;
    padding: 7px 10px;
  }
`;

const StyledStatusBanner = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;

  a {
    color: ${themeCssVariables.color.blue};
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
  }
`;

const StyledErrorText = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: 12px;
`;

const StyledSuccessText = styled.div`
  color: ${themeCssVariables.color.green};
  font-size: 12px;
  font-weight: 500;
`;

const StyledEmptyCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;
  padding: 40px 20px;
  text-align: center;
`;

type HookDraftItem = {
  id: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  selected: boolean;
};

type OverlayVisualStyle = {
  presetKey: 'TIKTOK_PILL' | 'IG_SHADOW' | 'AD_BOX' | 'EDITORIAL' | 'BRAND_KIT';
  fontFamily: string;
  fontSizePct: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  backgroundRadiusPx: number;
  strokeWidthPx: number;
  strokeColor: string;
};

const STYLE_PRESET_MAP: Record<
  OverlayVisualStyle['presetKey'],
  { label: string; style: Partial<OverlayVisualStyle> }
> = {
  TIKTOK_PILL: {
    label: 'TikTok Pill',
    style: {
      textColor: '#111111',
      backgroundColor: '#FFFFFF',
      backgroundOpacity: 0.96,
      backgroundRadiusPx: 14,
      strokeWidthPx: 0,
    },
  },
  IG_SHADOW: {
    label: 'Clean Shadow',
    style: {
      textColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      backgroundRadiusPx: 0,
      strokeWidthPx: 0,
    },
  },
  AD_BOX: {
    label: 'Bold Ad Box',
    style: {
      textColor: '#FFFFFF',
      backgroundColor: '#111111',
      backgroundOpacity: 0.72,
      backgroundRadiusPx: 12,
      strokeWidthPx: 0,
    },
  },
  EDITORIAL: {
    label: 'Editorial Outline',
    style: {
      textColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      backgroundRadiusPx: 0,
      strokeWidthPx: 3,
      strokeColor: '#000000',
    },
  },
  BRAND_KIT: {
    label: 'Brand Kit',
    style: {
      textColor: '#111111',
      backgroundColor: '#F6E05E',
      backgroundOpacity: 0.94,
      backgroundRadiusPx: 14,
      strokeWidthPx: 0,
    },
  },
};

const DEFAULT_VISUAL_STYLE: OverlayVisualStyle = {
  presetKey: 'TIKTOK_PILL',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSizePct: 4.4,
  textColor: '#111111',
  backgroundColor: '#FFFFFF',
  backgroundOpacity: 0.96,
  xPct: 50,
  yPct: 24,
  maxWidthPct: 82,
  backgroundRadiusPx: 14,
  strokeWidthPx: 0,
  strokeColor: '#000000',
};

const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

const probeBrowserVideoMeta = (
  file: File,
): Promise<{ durationSec?: number; width?: number; height?: number }> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (meta: {
      durationSec?: number;
      width?: number;
      height?: number;
    }) => {
      URL.revokeObjectURL(objectUrl);
      resolve(meta);
    };
    const timeout = window.setTimeout(() => done({}), 4000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      done({
        durationSec:
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.round(video.duration * 100) / 100
            : undefined,
        width: video.videoWidth > 0 ? video.videoWidth : undefined,
        height: video.videoHeight > 0 ? video.videoHeight : undefined,
      });
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      done({});
    };
    video.src = objectUrl;
  });

const StyledPromptDrawer = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 11px;
`;

const StyledPromptField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 11px;
  font-weight: 600;
  gap: 4px;

  select,
  input,
  textarea {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 12px;
    font-weight: 400;
    padding: 6px 8px;
  }

  textarea {
    line-height: 1.4;
    min-height: 70px;
    resize: vertical;
  }
`;

const StyledPromptActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
`;

const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledDriveSummaryBox = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 11px;
  gap: 4px;
  padding: 8px 10px;

  strong {
    color: ${themeCssVariables.font.color.primary};
  }

  a {
    color: ${themeCssVariables.color.blue};
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const StyledDriveSummaryRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
`;

const StyledDriveSearchInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 12px;
  padding: 6px 9px;
  width: 100%;
`;

const StyledDriveFolderList = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: 170px;
  overflow-y: auto;
`;

const StyledDriveFolderOption = styled.button<{ $active?: boolean }>`
  align-items: center;
  background: ${({ $active }) =>
    $active
      ? themeCssVariables.background.transparent.blue
      : 'transparent'};
  border: none;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${({ $active }) =>
    $active
      ? themeCssVariables.color.blue
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  gap: 6px;
  justify-content: space-between;
  padding: 7px 9px;
  text-align: left;
  width: 100%;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ $active }) =>
      $active
        ? themeCssVariables.background.transparent.blue
        : themeCssVariables.background.secondary};
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 500;
  }
`;

const StyledSavingPathLine = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 11px;

  strong {
    color: ${themeCssVariables.font.color.primary};
  }
`;

type DeliveryStudioHooksStageProps = {
  companyId: string | null;
  clientName?: string | null;
  projectId?: string | null;
  selectedVideo: StudioAssetDTO | null;
  videos?: StudioAssetDTO[];
  onSelectVideo?: (video: StudioAssetDTO) => void;
  hookPresets: StudioPresetDTO[];
  hookDefault: StudioHookDefaultSettingDTO | null;
  hasClientHookDefault: boolean;
  onRefreshWorkspace: () => Promise<void> | void;
};

export const DeliveryStudioHooksStage = ({
  companyId,
  clientName,
  projectId,
  selectedVideo,
  videos = [],
  onSelectVideo,
  hookPresets,
  hookDefault,
  hasClientHookDefault,
  onRefreshWorkspace,
}: DeliveryStudioHooksStageProps) => {
  const store = useStore();
  const [hooks, setHooks] = useState<HookDraftItem[]>([]);
  const [previewHookId, setPreviewHookId] = useState<string | null>(null);
  const [customHookInput, setCustomHookInput] = useState('');
  const [styleOpen, setStyleOpen] = useState(false);
  const [draggingOverlay, setDraggingOverlay] = useState(false);

  // Editable AI Text-Hook Master Prompt & Brand Examples
  const sortedHookPresets = useMemo(() => {
    return [...hookPresets].sort((a, b) => {
      const aBrand = a.companyId && a.companyId === companyId ? 1 : 0;
      const bBrand = b.companyId && b.companyId === companyId ? 1 : 0;
      if (aBrand !== bBrand) return bBrand - aBrand;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [companyId, hookPresets]);

  const brandHookPreset = useMemo(
    () =>
      sortedHookPresets.find((p) => p.companyId && p.companyId === companyId) ??
      null,
    [companyId, sortedHookPresets],
  );

  const [promptOpen, setPromptOpen] = useState(false);
  const [selectedHookPresetId, setSelectedHookPresetId] = useState<string>('');
  const [hookMasterPrompt, setHookMasterPrompt] = useState(
    DEFAULT_TEXT_HOOK_MASTER_PROMPT,
  );
  const [hookExamplesText, setHookExamplesText] = useState('');
  const [hookCustomDirection, setHookCustomDirection] = useState('');
  const [busySavePrompt, setBusySavePrompt] = useState(false);

  useEffect(() => {
    const initial = brandHookPreset ?? sortedHookPresets[0] ?? null;
    setSelectedHookPresetId(initial?.id ?? '');
    setHookMasterPrompt(
      initial?.masterPrompt?.trim() || DEFAULT_TEXT_HOOK_MASTER_PROMPT,
    );
    setHookExamplesText(
      (initial?.examplesJson ?? []).filter(Boolean).join('\n'),
    );
  }, [brandHookPreset, companyId, sortedHookPresets]);

  const [visualStyle, setVisualStyle] =
    useState<OverlayVisualStyle>(DEFAULT_VISUAL_STYLE);
  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(3.5);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Drive folder selection + live search
  const [driveMode, setDriveMode] = useState<'AUTO' | 'EXISTING' | 'CUSTOM'>(
    'AUTO',
  );
  const [selectedDriveFolderId, setSelectedDriveFolderId] = useState('');
  const [selectedDriveFolderName, setSelectedDriveFolderName] = useState('');
  const [customSubfolderName, setCustomSubfolderName] = useState('');
  const [driveSearchInput, setDriveSearchInput] = useState('');
  const [debouncedDriveSearch, setDebouncedDriveSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDriveSearch(driveSearchInput.trim());
    }, 240);
    return () => window.clearTimeout(timer);
  }, [driveSearchInput]);

  useEffect(() => {
    setDriveMode('AUTO');
    setSelectedDriveFolderId('');
    setSelectedDriveFolderName('');
    setCustomSubfolderName('');
    setDriveSearchInput('');
    setDebouncedDriveSearch('');
  }, [companyId]);

  const [busySuggest, setBusySuggest] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busySaveDefault, setBusySaveDefault] = useState(false);
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Apply client/workspace default style when switching clients
  useEffect(() => {
    if (!hookDefault) return;
    const cfg = hookDefault.styleConfig ?? {};
    setVisualStyle((prev) => ({
      ...prev,
      fontSizePct:
        typeof cfg.fontSizePct === 'number' ? cfg.fontSizePct : prev.fontSizePct,
      textColor:
        typeof cfg.textColor === 'string' ? cfg.textColor : prev.textColor,
      backgroundColor:
        typeof cfg.backgroundColor === 'string'
          ? cfg.backgroundColor
          : prev.backgroundColor,
      backgroundOpacity:
        typeof cfg.backgroundOpacity === 'number'
          ? cfg.backgroundOpacity
          : prev.backgroundOpacity,
      xPct: typeof cfg.xPct === 'number' ? cfg.xPct : prev.xPct,
      yPct: typeof cfg.yPct === 'number' ? cfg.yPct : prev.yPct,
      maxWidthPct:
        typeof cfg.maxWidthPct === 'number' ? cfg.maxWidthPct : prev.maxWidthPct,
      backgroundRadiusPx:
        typeof cfg.backgroundRadiusPx === 'number'
          ? cfg.backgroundRadiusPx
          : typeof cfg.borderRadiusPx === 'number'
            ? cfg.borderRadiusPx
            : prev.backgroundRadiusPx,
      strokeWidthPx:
        typeof cfg.strokeWidthPx === 'number'
          ? cfg.strokeWidthPx
          : prev.strokeWidthPx,
    }));
    if (typeof hookDefault.startSec === 'number') {
      setStartSec(hookDefault.startSec);
    }
    if (typeof hookDefault.durationSec === 'number') {
      setDurationSec(hookDefault.durationSec);
    }
  }, [hookDefault]);

  const hookProjectQuery = useQuery<{
    deliveryStudioHookProject: StudioHookProjectDTO | null;
  }>(GET_DELIVERY_STUDIO_HOOK_PROJECT, {
    variables: { assetId: selectedVideo?.id ?? '' },
    skip: !selectedVideo?.id,
    fetchPolicy: 'network-only',
  });

  const driveFoldersQuery = useQuery<{
    deliveryStudioClientDriveFolders: StudioDriveFoldersResponseDTO;
  }>(GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS, {
    variables: {
      companyId: companyId ?? '',
      search: debouncedDriveSearch || null,
    },
    skip: !companyId,
    fetchPolicy: 'cache-and-network',
  });

  const [suggestHooksMutation] = useMutation<{
    suggestDeliveryStudioVideoHooks: { hookProject: StudioHookProjectDTO };
  }>(SUGGEST_DELIVERY_STUDIO_VIDEO_HOOKS);

  const [renderHooksMutation] = useMutation<{
    renderDeliveryStudioVideoHooks: { hookProject: StudioHookProjectDTO };
  }>(RENDER_DELIVERY_STUDIO_VIDEO_HOOKS);

  const [saveVideoToDriveMutation] = useMutation<{
    saveDeliveryStudioVideoToDrive: {
      deliverableId: string;
      queuedDriveSync: boolean;
    };
  }>(SAVE_DELIVERY_STUDIO_VIDEO_TO_DRIVE);

  const [saveHookDefaultMutation] = useMutation(
    SAVE_DELIVERY_STUDIO_HOOK_DEFAULT,
  );

  const [upsertPresetMutation] = useMutation(UPSERT_DELIVERY_STUDIO_PRESET);

  const hookProject = hookProjectQuery.data?.deliveryStudioHookProject ?? null;
  const driveInfo = driveFoldersQuery.data?.deliveryStudioClientDriveFolders;
  const driveRootSubfolders = driveInfo?.subfolders ?? driveInfo?.folders ?? [];
  const driveMonthSubfolders = driveInfo?.monthSubfolders ?? [];

  // Reset hook list when switching to a different generated video
  useEffect(() => {
    setHooks([]);
    setPreviewHookId(null);
    setError(null);
    setFeedback(null);
  }, [selectedVideo?.id]);

  // Hydrate suggestions from existing hook project for the active video
  useEffect(() => {
    if (!hookProject) {
      return;
    }
    const existingSuggestions = hookProject.aiSuggestions ?? [];
    if (existingSuggestions.length > 0) {
      const mapped: HookDraftItem[] = existingSuggestions.map((s, idx) => ({
        id: `sug-${hookProject.id}-${idx}`,
        hookText: s.hookText,
        angleTag: s.angleTag ?? '',
        rationale: s.rationale ?? '',
        selected: false,
      }));
      setHooks((prev) => (prev.length === 0 ? mapped : prev));
      setPreviewHookId((prev) => prev ?? mapped[0]?.id ?? null);
    }
  }, [hookProject]);

  // Poll while rendering variations
  const isRendering = Boolean(
    hookProject?.variations.some((v) =>
      ['QUEUED', 'RENDERING'].includes(v.renderStatus),
    ),
  );
  useEffect(() => {
    if (!isRendering) return;
    const timer = window.setInterval(() => {
      void hookProjectQuery.refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isRendering, hookProjectQuery]);

  const selectedHooks = useMemo(
    () => hooks.filter((h) => h.selected && h.hookText.trim().length > 0),
    [hooks],
  );

  const activePreviewHook = useMemo(() => {
    const byId = hooks.find((h) => h.id === previewHookId);
    if (byId) return byId;
    if (selectedHooks.length > 0) return selectedHooks[0];
    return hooks[0] ?? null;
  }, [hooks, previewHookId, selectedHooks]);

  const productNameFromMeta =
    typeof selectedVideo?.metadata?.productName === 'string'
      ? selectedVideo.metadata.productName
      : '';

  const handleUploadVideos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!companyId) {
      setError('Select a client in the top bar before uploading a video.');
      return;
    }
    setError(null);
    setFeedback(null);
    setUploadingVideos(true);
    const list = Array.from(files);
    let lastUploaded: StudioAssetDTO | null = null;
    try {
      for (let idx = 0; idx < list.length; idx += 1) {
        const file = list[idx];
        setUploadProgressText(
          `Uploading ${idx + 1}/${list.length}: ${file.name} (0%)`,
        );
        const meta = await probeBrowserVideoMeta(file);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('companyId', companyId);
        if (projectId) formData.append('projectId', projectId);
        formData.append('title', file.name.replace(/\.[^.]+$/, ''));
        if (meta.durationSec) {
          formData.append('durationSec', String(meta.durationSec));
        }
        if (meta.width) formData.append('width', String(meta.width));
        if (meta.height) formData.append('height', String(meta.height));

        const uploaded = await uploadStudioMultipart<StudioAssetDTO>({
          store,
          endpointPath: '/portal/delivery-studio/videos/upload',
          formData,
          onProgress: (pct) => {
            setUploadProgressText(
              `Uploading ${idx + 1}/${list.length}: ${file.name} (${pct}%)`,
            );
          },
        });
        if (uploaded) {
          lastUploaded = uploaded;
        }
      }
      await onRefreshWorkspace();
      if (lastUploaded && onSelectVideo) {
        onSelectVideo(lastUploaded);
      }
      setFeedback(
        list.length === 1
          ? `Uploaded "${lastUploaded?.title || list[0].name}" — ready for text hooks & variations.`
          : `Uploaded ${list.length} videos — ready for text hooks & variations.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload video for hook variations.',
      );
    } finally {
      setUploadingVideos(false);
      setUploadProgressText(null);
    }
  };

  const renderSourceBar = () => (
    <StyledSourceBar>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flex: 1,
          flexWrap: 'wrap',
          gap: 10,
          minWidth: 240,
        }}
      >
        <strong style={{ fontSize: 13 }}>Source Video</strong>
        {videos.length > 0 ? (
          <StyledSourceSelect
            value={selectedVideo?.id ?? ''}
            onChange={(e) => {
              const found = videos.find((v) => v.id === e.target.value);
              if (found && onSelectVideo) onSelectVideo(found);
            }}
          >
            {videos.map((v) => {
              const sourceTag =
                v.providerUsed === 'editor'
                  ? 'Edited'
                  : v.providerUsed === 'upload'
                    ? 'Uploaded'
                    : 'AI';
              const dur = v.mediaMeta?.durationSec
                ? ` · ${Math.round(v.mediaMeta.durationSec)}s`
                : '';
              return (
                <option key={v.id} value={v.id}>
                  [{sourceTag}] {v.title}
                  {dur}
                </option>
              );
            })}
          </StyledSourceSelect>
        ) : (
          <span
            style={{
              color: themeCssVariables.font.color.tertiary,
              fontSize: 12,
            }}
          >
            Upload your own MP4/MOV/WebM video or generate one in Step 2.
          </span>
        )}
      </div>

      <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
        {selectedVideo && companyId && (
          <StyledSubtleButton
            type="button"
            disabled={uploadingVideos}
            onClick={() => setEditorOpen(true)}
            title="Trim this video or stitch another clip onto it before rendering text hook variations"
          >
            ✂ Edit / Add Clips
          </StyledSubtleButton>
        )}

        <StyledUploadLabel disabled={!companyId || uploadingVideos}>
          {uploadingVideos
            ? uploadProgressText || 'Uploading…'
            : '+ Upload Video(s)'}
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            multiple
            disabled={!companyId || uploadingVideos}
            onChange={(e) => {
              void handleUploadVideos(e.target.files);
              e.target.value = '';
            }}
          />
        </StyledUploadLabel>
      </div>
    </StyledSourceBar>
  );

  if (!selectedVideo) {
    return (
      <StyledStageWrapper>
        {renderSourceBar()}
        {error && (
          <StyledStatusBanner
            style={{
              borderColor: themeCssVariables.color.red,
              color: themeCssVariables.color.red11,
            }}
          >
            {error}
          </StyledStatusBanner>
        )}
        {feedback && <StyledStatusBanner>{feedback}</StyledStatusBanner>}
        <StyledEmptyCard>
          Upload an MP4, MOV, or WebM video using{' '}
          <strong>+ Upload Video(s)</strong> above, or approve an AI video from
          Step 2 to create text hook variations and save directly to Google
          Drive.
        </StyledEmptyCard>
      </StyledStageWrapper>
    );
  }

  const parsedExampleHooks = hookExamplesText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);

  const hasCustomPromptOrExamples = Boolean(
    brandHookPreset ||
      hookMasterPrompt.trim() !== DEFAULT_TEXT_HOOK_MASTER_PROMPT.trim() ||
      parsedExampleHooks.length > 0 ||
      hookCustomDirection.trim().length > 0,
  );

  const handleSaveBrandHookPrompt = async () => {
    setError(null);
    setFeedback(null);
    const cleaned = hookMasterPrompt.trim();
    if (!cleaned) {
      setError('Master prompt cannot be empty.');
      return;
    }
    setBusySavePrompt(true);
    try {
      const targetBrandPreset =
        sortedHookPresets.find(
          (p) => p.id === selectedHookPresetId && p.companyId === companyId,
        ) ?? brandHookPreset;
      await upsertPresetMutation({
        variables: {
          input: {
            ...(targetBrandPreset ? { id: targetBrandPreset.id } : {}),
            companyId: companyId ?? null,
            projectId: projectId ?? null,
            kind: 'TEXT_HOOK',
            name:
              targetBrandPreset?.name ||
              (clientName
                ? `${clientName} Text Hooks`
                : 'Brand Text Hooks'),
            description: clientName
              ? `Brand text-hook master prompt for ${clientName}`
              : 'Brand text-hook master prompt',
            masterPrompt: cleaned,
            examplesJson: parsedExampleHooks,
            isDefault: true,
          },
        },
      });
      await onRefreshWorkspace();
      setFeedback(
        `Saved text-hook prompt & ${parsedExampleHooks.length} example${parsedExampleHooks.length === 1 ? '' : 's'} for ${clientName || 'this brand'}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save brand text-hook prompt.',
      );
    } finally {
      setBusySavePrompt(false);
    }
  };

  const handleSuggestHooks = async () => {
    setError(null);
    setFeedback(null);
    setBusySuggest(true);
    try {
      const activePreset =
        sortedHookPresets.find((p) => p.id === selectedHookPresetId) ??
        sortedHookPresets[0];
      const res = await suggestHooksMutation({
        variables: {
          input: {
            assetId: selectedVideo.id,
            hookPresetId: activePreset?.id ?? undefined,
            masterPrompt: hookMasterPrompt.trim() || undefined,
            exampleHooks:
              parsedExampleHooks.length > 0 ? parsedExampleHooks : undefined,
            customDirection: hookCustomDirection.trim() || undefined,
            suggestionCount: 6,
          },
        },
      });
      const suggestions =
        res.data?.suggestDeliveryStudioVideoHooks?.hookProject?.aiSuggestions ??
        [];
      const mapped: HookDraftItem[] = suggestions.map((s, idx) => ({
        id: `ai-${Date.now()}-${idx}`,
        hookText: s.hookText,
        angleTag: s.angleTag ?? '',
        rationale: s.rationale ?? '',
        selected: idx < 3,
      }));
      setHooks(mapped);
      setPreviewHookId(mapped[0]?.id ?? null);
      void hookProjectQuery.refetch();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to suggest text hooks.',
      );
    } finally {
      setBusySuggest(false);
    }
  };

  const handleAddCustomHook = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customHookInput.trim();
    if (!cleaned) return;
    const item: HookDraftItem = {
      id: `custom-${Date.now()}`,
      hookText: cleaned,
      angleTag: 'Custom',
      rationale: '',
      selected: true,
    };
    setHooks((prev) => [...prev, item]);
    setPreviewHookId(item.id);
    setCustomHookInput('');
  };

  const applyStylePreset = (presetKey: OverlayVisualStyle['presetKey']) => {
    const preset = STYLE_PRESET_MAP[presetKey];
    setVisualStyle((prev) => ({
      ...prev,
      presetKey,
      ...preset.style,
    }));
  };

  const buildStylePayload = () => ({
    fontFamily: visualStyle.fontFamily,
    fontSizePct: visualStyle.fontSizePct,
    textColor: visualStyle.textColor,
    backgroundColor: visualStyle.backgroundColor,
    backgroundOpacity: visualStyle.backgroundOpacity,
    xPct: visualStyle.xPct,
    yPct: visualStyle.yPct,
    maxWidthPct: visualStyle.maxWidthPct,
    backgroundRadiusPx: visualStyle.backgroundRadiusPx,
    strokeWidthPx: visualStyle.strokeWidthPx,
    strokeColor: visualStyle.strokeColor,
  });

  const handleSaveClientDefault = async () => {
    setError(null);
    setFeedback(null);
    setBusySaveDefault(true);
    try {
      await saveHookDefaultMutation({
        variables: {
          input: {
            companyId: companyId ?? null,
            styleConfig: buildStylePayload(),
            startSec,
            durationSec,
          },
        },
      });
      setFeedback('Saved as client default for future videos.');
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save client default.',
      );
    } finally {
      setBusySaveDefault(false);
    }
  };

  const resolveDriveRoutingInput = () => {
    if (driveMode === 'EXISTING' && selectedDriveFolderId) {
      return {
        driveTargetFolderId: selectedDriveFolderId,
        driveSubfolderName: null,
      };
    }
    if (driveMode === 'CUSTOM' && customSubfolderName.trim()) {
      return {
        driveTargetFolderId: null,
        driveSubfolderName: customSubfolderName.trim(),
      };
    }
    return {
      driveTargetFolderId: null,
      driveSubfolderName: productNameFromMeta || null,
    };
  };

  const handleSaveOrRender = async () => {
    setError(null);
    setFeedback(null);
    setBusySave(true);
    const driveRouting = resolveDriveRoutingInput();

    try {
      if (selectedHooks.length === 0) {
        // 0 hooks selected -> save clean approved raw video straight to Drive
        const res = await saveVideoToDriveMutation({
          variables: {
            input: {
              assetId: selectedVideo.id,
              ...driveRouting,
            },
          },
        });
        const synced = res.data?.saveDeliveryStudioVideoToDrive?.queuedDriveSync;
        setFeedback(
          synced
            ? 'Approved video queued for Google Drive sync.'
            : 'Video saved to Deliverables (connect Google Drive to auto-sync).',
        );
        await onRefreshWorkspace();
        return;
      }

      // N hooks selected -> render N variations via FFmpeg & sync all to Drive
      await renderHooksMutation({
        variables: {
          input: {
            assetId: selectedVideo.id,
            stylePreset: visualStyle.presetKey,
            styleConfig: buildStylePayload(),
            syncToDrive: true,
            ...driveRouting,
            hooks: selectedHooks.map((h) => ({
              hookText: h.hookText.trim(),
              angleTag: h.angleTag,
              rationale: h.rationale,
              startSec,
              endSec: Number((startSec + durationSec).toFixed(2)),
            })),
          },
        },
      });
      setFeedback(
        `Rendering ${selectedHooks.length} variation${selectedHooks.length === 1 ? '' : 's'} & syncing to Google Drive…`,
      );
      await hookProjectQuery.refetch();
      await onRefreshWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save video to Drive.',
      );
    } finally {
      setBusySave(false);
    }
  };

  const updateOverlayPositionFromPointer = (
    rect: DOMRect,
    clientX: number,
    clientY: number,
  ) => {
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.round(
      Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100)),
    );
    const yPct = Math.round(
      Math.max(12, Math.min(88, ((clientY - rect.top) / rect.height) * 100)),
    );
    setVisualStyle((prev) => ({ ...prev, xPct, yPct }));
  };

  const showOverlayNow =
    Boolean(activePreviewHook?.hookText.trim()) &&
    (!isPlaying ||
      (currentVideoTime >= startSec &&
        currentVideoTime <= startSec + durationSec));

  const previewFontPx = Math.max(12, Math.round(visualStyle.fontSizePct * 3.8));

  return (
    <StyledStageWrapper>
      {renderSourceBar()}
      <StyledStageGrid>
      <StyledPreviewColumn>
        <StyledVideoFrame
          style={{ cursor: styleOpen ? 'crosshair' : 'default' }}
          onPointerDown={(e) => {
            if (!styleOpen) return;
            setDraggingOverlay(true);
            updateOverlayPositionFromPointer(
              e.currentTarget.getBoundingClientRect(),
              e.clientX,
              e.clientY,
            );
          }}
          onPointerMove={(e) => {
            if (!draggingOverlay) return;
            updateOverlayPositionFromPointer(
              e.currentTarget.getBoundingClientRect(),
              e.clientX,
              e.clientY,
            );
          }}
          onPointerUp={() => setDraggingOverlay(false)}
          onPointerLeave={() => setDraggingOverlay(false)}
        >
          <video
            src={studioMediaUrl(selectedVideo.mediaPath)}
            poster={studioMediaUrl(selectedVideo.thumbnailPath)}
            controls
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) =>
              setCurrentVideoTime(e.currentTarget.currentTime)
            }
          />

          {showOverlayNow && activePreviewHook && (
            <StyledOverlayAnchor
              style={{
                left: `${visualStyle.xPct}%`,
                top: `${visualStyle.yPct}%`,
                maxWidth: `${visualStyle.maxWidthPct}%`,
              }}
            >
              <div
                style={{
                  background:
                    visualStyle.backgroundOpacity > 0.01
                      ? hexToRgba(
                          visualStyle.backgroundColor,
                          visualStyle.backgroundOpacity,
                        )
                      : 'transparent',
                  borderRadius: `${visualStyle.backgroundRadiusPx}px`,
                  color: visualStyle.textColor,
                  fontFamily: visualStyle.fontFamily,
                  fontSize: `${previewFontPx}px`,
                  fontWeight: 700,
                  lineHeight: 1.24,
                  padding:
                    visualStyle.backgroundOpacity > 0.01
                      ? '7px 12px'
                      : '2px 4px',
                  textAlign: 'center',
                  textShadow:
                    visualStyle.strokeWidthPx > 0
                      ? `0 0 2px ${visualStyle.strokeColor}, 0 2px 6px rgba(0,0,0,0.75)`
                      : visualStyle.backgroundOpacity <= 0.01
                        ? '0 2px 8px rgba(0,0,0,0.75)'
                        : 'none',
                  wordBreak: 'break-word',
                }}
              >
                {activePreviewHook.hookText}
              </div>
            </StyledOverlayAnchor>
          )}
        </StyledVideoFrame>

        <StyledPreviewCaption>
          <span>{selectedVideo.title}</span>
          <span>
            {styleOpen
              ? 'Click video to reposition'
              : activePreviewHook
                ? `Previewing hook · ${startSec}s–${(startSec + durationSec).toFixed(1)}s`
                : 'Clean video (no hook)'}
          </span>
        </StyledPreviewCaption>
      </StyledPreviewColumn>

      <StyledRightColumn>
        <StyledPanel>
          <StyledPanelHeader>
            <div>
              <h4>Text Hooks</h4>
              <span>
                Select 0 to save raw video, or check hooks to render variations
              </span>
            </div>
            <StyledHeaderActions>
              <StyledSubtleButton
                type="button"
                onClick={() => setPromptOpen((prev) => !prev)}
                title="View & edit the AI Text-Hook master prompt and working examples for this brand"
              >
                {promptOpen
                  ? 'Hide Prompt'
                  : hasCustomPromptOrExamples
                    ? 'Prompt ⚙ · Custom'
                    : 'Prompt ⚙'}
              </StyledSubtleButton>
              <StyledSubtleButton
                type="button"
                disabled={busySuggest}
                onClick={() => void handleSuggestHooks()}
              >
                {busySuggest ? 'Analyzing video…' : '✦ Suggest with AI'}
              </StyledSubtleButton>
            </StyledHeaderActions>
          </StyledPanelHeader>

          {promptOpen && (
            <StyledPromptDrawer>
              {sortedHookPresets.length > 0 && (
                <StyledPromptField>
                  Hook Prompt Preset
                  <select
                    value={selectedHookPresetId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedHookPresetId(nextId);
                      const picked = sortedHookPresets.find(
                        (p) => p.id === nextId,
                      );
                      if (picked) {
                        setHookMasterPrompt(
                          picked.masterPrompt?.trim() ||
                            DEFAULT_TEXT_HOOK_MASTER_PROMPT,
                        );
                        setHookExamplesText(
                          (picked.examplesJson ?? [])
                            .filter(Boolean)
                            .join('\n'),
                        );
                      } else {
                        setHookMasterPrompt(DEFAULT_TEXT_HOOK_MASTER_PROMPT);
                        setHookExamplesText('');
                      }
                    }}
                  >
                    <option value="">Workspace Default Prompt</option>
                    {sortedHookPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.companyId === companyId ? '[Brand] ' : ''}
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </StyledPromptField>
              )}

              <StyledPromptField>
                AI Master Prompt ({clientName || 'Active Brand'})
                <textarea
                  value={hookMasterPrompt}
                  onChange={(e) => setHookMasterPrompt(e.target.value)}
                  placeholder="Describe voice, hook structure, angles, and rules for this brand…"
                />
              </StyledPromptField>

              <StyledPromptField>
                Working Example Hooks (one per line)
                <textarea
                  style={{ minHeight: 62 }}
                  value={hookExamplesText}
                  onChange={(e) => setHookExamplesText(e.target.value)}
                  placeholder="Paste hooks that already worked for this brand (one per line)…"
                />
              </StyledPromptField>

              <StyledPromptField>
                One-off direction for this video (optional)
                <input
                  type="text"
                  value={hookCustomDirection}
                  onChange={(e) => setHookCustomDirection(e.target.value)}
                  placeholder="e.g. Focus on winter drop urgency or oversized fit"
                />
              </StyledPromptField>

              <StyledPromptActions>
                <StyledHeaderActions>
                  <StyledSubtleButton
                    type="button"
                    disabled={busySavePrompt}
                    onClick={() => void handleSaveBrandHookPrompt()}
                  >
                    {busySavePrompt
                      ? 'Saving…'
                      : clientName
                        ? `Save for ${clientName}`
                        : 'Save Brand Prompt'}
                  </StyledSubtleButton>
                  <StyledSubtleButton
                    type="button"
                    disabled={busySavePrompt}
                    onClick={() =>
                      setHookMasterPrompt(DEFAULT_TEXT_HOOK_MASTER_PROMPT)
                    }
                  >
                    Reset
                  </StyledSubtleButton>
                </StyledHeaderActions>
                <span
                  style={{
                    color: themeCssVariables.font.color.tertiary,
                    fontSize: 11,
                  }}
                >
                  {parsedExampleHooks.length} example
                  {parsedExampleHooks.length === 1 ? '' : 's'} active
                </span>
              </StyledPromptActions>
            </StyledPromptDrawer>
          )}

          {hooks.length > 0 && (
            <StyledHookList>
              {hooks.map((item) => (
                <StyledHookRow
                  key={item.id}
                  data-selected={item.selected}
                  data-previewing={activePreviewHook?.id === item.id}
                  onClick={() => setPreviewHookId(item.id)}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHooks((prev) =>
                        prev.map((h) =>
                          h.id === item.id ? { ...h, selected: checked } : h,
                        ),
                      );
                      setPreviewHookId(item.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="text"
                    value={item.hookText}
                    onChange={(e) => {
                      const text = e.target.value;
                      setHooks((prev) =>
                        prev.map((h) =>
                          h.id === item.id ? { ...h, hookText: text } : h,
                        ),
                      );
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewHookId(item.id);
                    }}
                  />
                  {item.angleTag && (
                    <StyledAnglePill>{item.angleTag}</StyledAnglePill>
                  )}
                </StyledHookRow>
              ))}
            </StyledHookList>
          )}

          <StyledAddHookForm onSubmit={handleAddCustomHook}>
            <input
              type="text"
              placeholder="Write a custom text hook and press Enter…"
              value={customHookInput}
              onChange={(e) => setCustomHookInput(e.target.value)}
            />
            <StyledSubtleButton
              type="submit"
              disabled={!customHookInput.trim()}
            >
              + Add
            </StyledSubtleButton>
          </StyledAddHookForm>
        </StyledPanel>

        <StyledPanel>
          <StyledToggleHeader
            type="button"
            onClick={() => setStyleOpen((prev) => !prev)}
          >
            <span>
              Style &amp; timing ⚙{' '}
              {hasClientHookDefault && <small>· Client default</small>}
            </span>
            <small>{styleOpen ? 'Hide' : 'Customize'}</small>
          </StyledToggleHeader>

          {styleOpen && (
            <>
              <StyledPresetRow>
                {(
                  Object.keys(
                    STYLE_PRESET_MAP,
                  ) as OverlayVisualStyle['presetKey'][]
                ).map((key) => (
                  <StyledPresetChip
                    key={key}
                    type="button"
                    data-active={visualStyle.presetKey === key}
                    onClick={() => applyStylePreset(key)}
                  >
                    {STYLE_PRESET_MAP[key].label}
                  </StyledPresetChip>
                ))}
              </StyledPresetRow>

              <StyledStyleGrid>
                <StyledMiniField>
                  Font size ({visualStyle.fontSizePct.toFixed(1)}%)
                  <input
                    type="range"
                    min={2.8}
                    max={6.8}
                    step={0.2}
                    value={visualStyle.fontSizePct}
                    onChange={(e) =>
                      setVisualStyle((prev) => ({
                        ...prev,
                        fontSizePct: Number(e.target.value),
                      }))
                    }
                  />
                </StyledMiniField>
                <StyledMiniField>
                  Vertical position ({visualStyle.yPct}%)
                  <input
                    type="range"
                    min={12}
                    max={85}
                    step={1}
                    value={visualStyle.yPct}
                    onChange={(e) =>
                      setVisualStyle((prev) => ({
                        ...prev,
                        yPct: Number(e.target.value),
                      }))
                    }
                  />
                </StyledMiniField>
                <StyledMiniField>
                  Start time (sec)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={startSec}
                    onChange={(e) =>
                      setStartSec(Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </StyledMiniField>
                <StyledMiniField>
                  Duration (sec)
                  <input
                    type="number"
                    min={0.5}
                    max={20}
                    step={0.1}
                    value={durationSec}
                    onChange={(e) =>
                      setDurationSec(
                        Math.max(0.5, Number(e.target.value) || 3.5),
                      )
                    }
                  />
                </StyledMiniField>
                <StyledMiniField>
                  Text color
                  <input
                    type="color"
                    value={visualStyle.textColor}
                    onChange={(e) =>
                      setVisualStyle((prev) => ({
                        ...prev,
                        textColor: e.target.value,
                      }))
                    }
                  />
                </StyledMiniField>
                <StyledMiniField>
                  Background color
                  <input
                    type="color"
                    value={visualStyle.backgroundColor}
                    onChange={(e) =>
                      setVisualStyle((prev) => ({
                        ...prev,
                        backgroundColor: e.target.value,
                      }))
                    }
                  />
                </StyledMiniField>
              </StyledStyleGrid>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <StyledSubtleButton
                  type="button"
                  disabled={busySaveDefault}
                  onClick={() => void handleSaveClientDefault()}
                >
                  {busySaveDefault ? 'Saving…' : 'Save as client default'}
                </StyledSubtleButton>
              </div>
            </>
          )}
        </StyledPanel>

        <StyledPanel>
          <StyledPanelHeader>
            <div>
              <h4>Google Drive Folder</h4>
              <span>
                {driveInfo?.connected
                  ? driveInfo.clientMapped && driveInfo.rootFolderName
                    ? `Linked · ${driveInfo.rootFolderName}`
                    : 'Drive connected — link a client folder for smart month routing'
                  : 'Connect Drive in Deliverables to auto-sync'}
              </span>
            </div>
            {companyId && (
              <Link
                to={`/delivery?view=clients&clientCompany=${companyId}&clientSection=services`}
                style={{
                  color: themeCssVariables.color.blue,
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {driveInfo?.clientMapped ? 'Change folder ⚙' : 'Set up folder ⚙'}
              </Link>
            )}
          </StyledPanelHeader>

          {driveInfo?.connected && (
            <StyledDriveSummaryBox>
              <StyledDriveSummaryRow>
                <span>
                  Client folder:{' '}
                  {driveInfo.clientMapped && driveInfo.rootFolderName ? (
                    <a
                      href={
                        driveInfo.rootFolderWebUrl ||
                        (driveInfo.rootFolderId
                          ? `https://drive.google.com/drive/folders/${driveInfo.rootFolderId}`
                          : '#')
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      📁 {driveInfo.rootFolderName} ↗
                    </a>
                  ) : (
                    <strong>Not linked yet</strong>
                  )}
                </span>
                <span>
                  Cycle: <strong>Day {driveInfo.monthStartDay ?? 1}</strong>
                  {driveInfo.activeCycleLabel
                    ? ` · ${driveInfo.activeCycleLabel}`
                    : ''}
                </span>
              </StyledDriveSummaryRow>

              {driveInfo.clientMapped && (
                <div>
                  Active month folder:{' '}
                  {driveInfo.matchedMonthFolder ? (
                    <a
                      href={
                        driveInfo.matchedMonthFolder.webViewLink ||
                        `https://drive.google.com/drive/folders/${driveInfo.matchedMonthFolder.id}`
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      ✓ 📁 {driveInfo.matchedMonthFolder.name} ↗
                    </a>
                  ) : (
                    <strong>
                      Auto-creates 📁 {driveInfo.expectedMonthFolderName}
                    </strong>
                  )}
                </div>
              )}
            </StyledDriveSummaryBox>
          )}

          {driveInfo?.connected && driveInfo.clientMapped && (
            <>
              <StyledDriveSearchInput
                type="text"
                placeholder="Search folders inside this client’s Drive…"
                value={driveSearchInput}
                onChange={(e) => setDriveSearchInput(e.target.value)}
              />

              <StyledDriveFolderList>
                <StyledDriveFolderOption
                  type="button"
                  $active={driveMode === 'AUTO'}
                  onClick={() => {
                    setDriveMode('AUTO');
                    setSelectedDriveFolderId('');
                    setSelectedDriveFolderName('');
                  }}
                >
                  <span>
                    ✦ Auto ({driveInfo.matchedMonthFolder?.name || driveInfo.expectedMonthFolderName || 'Active Month'}
                    {productNameFromMeta ? ` / ${productNameFromMeta}` : ''})
                  </span>
                  <small>Recommended</small>
                </StyledDriveFolderOption>

                {driveMonthSubfolders.map((folder) => {
                  const isActive =
                    driveMode === 'EXISTING' &&
                    selectedDriveFolderId === folder.id;
                  return (
                    <StyledDriveFolderOption
                      key={`month:${folder.id}`}
                      type="button"
                      $active={isActive}
                      onClick={() => {
                        setDriveMode('EXISTING');
                        setSelectedDriveFolderId(folder.id);
                        setSelectedDriveFolderName(
                          `${driveInfo.matchedMonthFolder?.name ?? 'Month'} / ${folder.name}`,
                        );
                      }}
                    >
                      <span>📁 {folder.name}</span>
                      <small>
                        In {driveInfo.matchedMonthFolder?.name ?? 'Month'}
                      </small>
                    </StyledDriveFolderOption>
                  );
                })}

                {driveRootSubfolders.map((folder) => {
                  const isActive =
                    driveMode === 'EXISTING' &&
                    selectedDriveFolderId === folder.id;
                  const isMatchedMonth =
                    driveInfo.matchedMonthFolder?.id === folder.id;
                  return (
                    <StyledDriveFolderOption
                      key={`root:${folder.id}`}
                      type="button"
                      $active={isActive}
                      onClick={() => {
                        setDriveMode('EXISTING');
                        setSelectedDriveFolderId(folder.id);
                        setSelectedDriveFolderName(folder.name);
                      }}
                    >
                      <span>📁 {folder.name}</span>
                      <small>
                        {isMatchedMonth ? 'Active month' : 'Client root'}
                      </small>
                    </StyledDriveFolderOption>
                  );
                })}

                <StyledDriveFolderOption
                  type="button"
                  $active={driveMode === 'CUSTOM'}
                  onClick={() => {
                    setDriveMode('CUSTOM');
                    setSelectedDriveFolderId('');
                    setSelectedDriveFolderName('');
                  }}
                >
                  <span>+ New subfolder inside active month…</span>
                  <small>Create</small>
                </StyledDriveFolderOption>
              </StyledDriveFolderList>

              {driveMode === 'CUSTOM' && (
                <StyledDriveSearchInput
                  type="text"
                  placeholder="Subfolder name (e.g. Winter Drop)"
                  value={customSubfolderName}
                  onChange={(e) => setCustomSubfolderName(e.target.value)}
                />
              )}

              <StyledSavingPathLine>
                Saving to:{' '}
                <strong>
                  {driveInfo.rootFolderName || 'Client Drive'}
                  {' / '}
                  {driveMode === 'EXISTING' && selectedDriveFolderName
                    ? selectedDriveFolderName
                    : `${driveInfo.matchedMonthFolder?.name || driveInfo.expectedMonthFolderName || 'Active Month'}${
                        driveMode === 'CUSTOM' && customSubfolderName.trim()
                          ? ` / ${customSubfolderName.trim()}`
                          : productNameFromMeta
                            ? ` / ${productNameFromMeta}`
                            : ''
                      }`}
                </strong>
              </StyledSavingPathLine>
            </>
          )}

          {(!driveInfo?.connected || !driveInfo.clientMapped) && (
            <StyledDriveRow>
              <input
                type="text"
                placeholder="Optional subfolder name (e.g. Winter Drop)"
                value={customSubfolderName}
                onChange={(e) => {
                  setCustomSubfolderName(e.target.value);
                  setDriveMode(e.target.value.trim() ? 'CUSTOM' : 'AUTO');
                }}
              />
            </StyledDriveRow>
          )}

          <StyledPrimaryButton
            type="button"
            disabled={busySave}
            onClick={() => void handleSaveOrRender()}
          >
            {busySave
              ? 'Processing…'
              : selectedHooks.length === 0
                ? 'Save Video to Drive'
                : `Render ${selectedHooks.length} Variation${selectedHooks.length === 1 ? '' : 's'} & Save to Drive`}
          </StyledPrimaryButton>

          {error && <StyledErrorText>{error}</StyledErrorText>}
          {feedback && <StyledSuccessText>{feedback}</StyledSuccessText>}

          {hookProject && hookProject.variations.length > 0 && (
            <StyledStatusBanner>
              {hookProject.variations.map((v) => (
                <div
                  key={v.id}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    fontSize: 12,
                    gap: 8,
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    #{v.variationNumber} · {v.hookText.slice(0, 44)}
                  </span>
                  <span>
                    {v.driveWebUrl ? (
                      <a
                        href={v.driveWebUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Drive ↗
                      </a>
                    ) : (
                      v.renderStatus
                    )}
                  </span>
                </div>
              ))}
            </StyledStatusBanner>
          )}
        </StyledPanel>
      </StyledRightColumn>
      </StyledStageGrid>

      {editorOpen && companyId && (
        <DeliveryStudioVideoEditorModal
          companyId={companyId}
          projectId={projectId ?? null}
          initialVideo={selectedVideo}
          availableVideos={videos}
          primaryCtaLabel="Save Edited Cut"
          onSaved={async (savedVideo) => {
            await onRefreshWorkspace();
            if (onSelectVideo) {
              onSelectVideo(savedVideo);
            }
            setEditorOpen(false);
            setFeedback(
              `Saved edited cut "${savedVideo.title}" — ready for text hook variations.`,
            );
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </StyledStageWrapper>
  );
};
