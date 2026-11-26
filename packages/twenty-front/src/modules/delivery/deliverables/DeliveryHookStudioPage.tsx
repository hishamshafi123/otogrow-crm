import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  ANALYZE_DELIVERY_HOOK_CONTEXT,
  GENERATE_DELIVERY_HOOK_SUGGESTIONS,
  GET_DELIVERY_DELIVERABLES,
  GET_DELIVERY_HOOK_PROJECT,
  PUBLISH_DELIVERY_HOOK_VARIATIONS,
  QUEUE_DELIVERY_HOOK_RENDER,
  SAVE_DELIVERY_HOOK_PROJECT,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import {
  DEFAULT_HOOK_STYLE_CLIENT,
  formatBytesHuman,
  formatDurationHuman,
  HOOK_STYLE_PRESET_LABELS,
  type CreativeHookDirectionInput,
  type DeliverableItem,
  type DeliverableListResponse,
  type HookProjectData,
  type HookSafeZoneGuide,
  type HookStyleConfig,
} from '@/delivery/deliverables/delivery-deliverables.types';
import {
  checkSafeZoneOverlap,
  renderHookOverlayToPngBlob,
  resolveEffectiveHookStyleClient,
  SAFE_ZONE_SPECS,
} from '@/delivery/deliverables/renderHookOverlayCanvas';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';

type DraftVariation = {
  localKey: string;
  id?: string;
  variationNumber: number;
  hookText: string;
  angleTag: string;
  rationale: string;
  startSec: number;
  endSec: number;
  styleOverride: Partial<HookStyleConfig> | null;
  renderStatus: string;
  renderProgress: number;
  renderError: string | null;
  streamPath: string | null;
  thumbnailPath: string | null;
  outputSizeBytes: number;
  driveSyncStatus: string;
  driveWebUrl: string | null;
  clientVisibility: string;
};

const StyledStudioGrid = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(270px, 320px) minmax(340px, 1fr) minmax(
      290px,
      340px
    );

  @media (max-width: 1220px) {
    grid-template-columns: 1fr;
  }
`;

const StyledPanelCard = styled(StyledDeliveryCard)`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledSectionTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};

  input[type='text'],
  input[type='url'],
  input[type='number'],
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.sm};
    padding: ${themeCssVariables.spacing[2]};
    width: 100%;
  }

  textarea {
    min-height: 64px;
    resize: vertical;
  }
`;

const StyledVideoPickerGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
`;

const StyledVideoPickerTile = styled.button`
  align-items: stretch;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  text-align: left;
  transition: border-color 120ms ease;

  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledStageWrapper = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledVideoViewport = styled.div<{
  aspectRatio: string;
  isPortrait: boolean;
}>`
  aspect-ratio: ${({ aspectRatio }) => aspectRatio};
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: ${themeCssVariables.border.radius.sm};
  height: ${({ isPortrait }) => (isPortrait ? 'min(64vh, 620px)' : 'auto')};
  margin: 0 auto;
  max-height: 64vh;
  max-width: 100%;
  overflow: hidden;
  position: relative;
  touch-action: none;
  user-select: none;
  width: ${({ isPortrait }) => (isPortrait ? 'auto' : '100%')};

  video {
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledSafeZoneMask = styled.div`
  background: ${themeCssVariables.color.red};
  border: 1px dashed ${themeCssVariables.color.red};
  opacity: 0.22;
  pointer-events: none;
  position: absolute;
`;

const StyledCenterSnapLine = styled.div`
  background: ${themeCssVariables.color.blue};
  bottom: 0;
  left: 50%;
  pointer-events: none;
  position: absolute;
  top: 0;
  width: 1px;
  z-index: 6;
`;

const StyledHookOverlayBox = styled.div`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  box-sizing: border-box;
  cursor: grab;
  display: -webkit-box;
  overflow: hidden;
  paint-order: stroke fill;
  position: absolute;
  transform: translate(-50%, -50%);
  user-select: none;
  white-space: pre-wrap;
  word-break: break-word;
  z-index: 8;

  &:active {
    cursor: grabbing;
  }
`;

const StyledVariationPill = styled.button<{ active: boolean }>`
  align-items: flex-start;
  background: ${({ active }) =>
    active
      ? themeCssVariables.background.tertiary
      : themeCssVariables.background.primary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 210px;
  min-width: 140px;
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
`;

const StyledPresetGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledPresetButton = styled.button<{ active: boolean }>`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
`;

const StyledSuggestionCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledNotice = styled.div<{ tone: 'info' | 'warning' | 'error' | 'success' }>`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ tone }) =>
      tone === 'error'
        ? themeCssVariables.color.red
        : tone === 'warning'
          ? themeCssVariables.color.orange
          : tone === 'success'
            ? themeCssVariables.color.green
            : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledBackLink = styled(Link)`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-decoration: none;
`;

/* oxlint-disable twenty/no-hardcoded-colors */
const hexToRgbaCss = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
};
/* oxlint-enable twenty/no-hardcoded-colors */

const toAbsoluteServerUrl = (relativePath: string | null): string | null => {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${REACT_APP_SERVER_BASE_URL}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

const hydrateDraftVariations = (project: HookProjectData): DraftVariation[] =>
  project.variations.map((v) => ({
    localKey: v.id,
    id: v.id,
    variationNumber: v.variationNumber,
    hookText: v.hookText,
    angleTag: v.angleTag,
    rationale: v.rationale,
    startSec: Number(v.startSec),
    endSec: Number(v.endSec),
    styleOverride: v.styleOverride ?? null,
    renderStatus: v.renderStatus,
    renderProgress: v.renderProgress,
    renderError: v.renderError,
    streamPath: v.streamPath,
    thumbnailPath: v.thumbnailPath,
    outputSizeBytes: v.outputSizeBytes,
    driveSyncStatus: v.driveSyncStatus,
    driveWebUrl: v.driveWebUrl,
    clientVisibility: v.clientVisibility,
  }));

export const DeliveryHookStudioPage = () => {
  const [params, setParams] = useSearchParams();
  const store = useStore();
  const access = useWorkflowAccess();

  const deliverableId = params.get('deliverableId') ?? '';

  const {
    data: deliverablesListData,
    loading: loadingList,
    error: deliverablesListError,
  } = useQuery<{
    deliveryDeliverables: DeliverableListResponse;
  }>(GET_DELIVERY_DELIVERABLES, {
    variables: { filter: { assetKind: 'VIDEO', limit: 60 } },
    fetchPolicy: 'cache-and-network',
  });

  const videoDeliverables: DeliverableItem[] = useMemo(
    () =>
      (deliverablesListData?.deliveryDeliverables?.deliverables ?? []).filter(
        (d) => d.assetKind === 'VIDEO',
      ),
    [deliverablesListData],
  );

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of deliverablesListData?.deliveryDeliverables?.clients ?? []) {
      map.set(c.id, c.name);
    }
    return map;
  }, [deliverablesListData]);

  const {
    data: projectData,
    loading: loadingProject,
    error: projectError,
    refetch: refetchProject,
  } = useQuery<{ deliveryHookProject: HookProjectData }>(
    GET_DELIVERY_HOOK_PROJECT,
    {
      variables: { deliverableId },
      skip: !deliverableId,
      fetchPolicy: 'network-only',
    },
  );

  const [analyzeContextMutation, { loading: analyzing }] = useMutation<{
    analyzeDeliveryHookContext: HookProjectData;
  }>(ANALYZE_DELIVERY_HOOK_CONTEXT);
  const [generateSuggestionsMutation, { loading: generating }] = useMutation<{
    generateDeliveryHookSuggestions: HookProjectData;
  }>(GENERATE_DELIVERY_HOOK_SUGGESTIONS);
  const [saveProjectMutation, { loading: saving }] = useMutation<{
    saveDeliveryHookProject: HookProjectData;
  }>(SAVE_DELIVERY_HOOK_PROJECT);
  const [queueRenderMutation, { loading: queueing }] = useMutation<{
    queueDeliveryHookRender: HookProjectData;
  }>(QUEUE_DELIVERY_HOOK_RENDER);
  const [publishMutation, { loading: publishing }] = useMutation<{
    publishDeliveryHookVariations: HookProjectData;
  }>(PUBLISH_DELIVERY_HOOK_VARIATIONS);

  const [project, setProject] = useState<HookProjectData | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [creativeInput, setCreativeInput] = useState<CreativeHookDirectionInput>(
    {
      platform: 'TIKTOK',
      funnelStage: 'COLD',
      variationCount: 10,
    },
  );
  const [defaultStyle, setDefaultStyle] = useState<HookStyleConfig>(
    DEFAULT_HOOK_STYLE_CLIENT,
  );
  const [draftVariations, setDraftVariations] = useState<DraftVariation[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [styleScope, setStyleScope] = useState<'default' | 'override'>(
    'default',
  );
  const [previewMode, setPreviewMode] = useState<'editor' | 'rendered'>(
    'editor',
  );
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'info' | 'warning' | 'error' | 'success';
    text: string;
  } | null>(null);
  const [isPreparingRender, setIsPreparingRender] = useState(false);

  // Video player & stage element state (callback refs avoid useRef state lint)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState({ width: 360, height: 640 });
  const [detectedVideoMeta, setDetectedVideoMeta] = useState<{
    width?: number;
    height?: number;
    duration?: number;
  }>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [snappedCenter, setSnappedCenter] = useState(false);
  const [hydratedDeliverableId, setHydratedDeliverableId] = useState<
    string | null
  >(null);

  const applyServerProject = useCallback(
    (
      incoming: HookProjectData,
      preserveDraftEdits = false,
      preferredVariationNumber?: number | null,
    ) => {
      setProject((prev) => {
        // Keep existing master streamPath stable across render-status polls so <video> does not reload
        if (
          preserveDraftEdits &&
          prev &&
          prev.deliverable.id === incoming.deliverable.id &&
          prev.deliverable.streamPath
        ) {
          return {
            ...incoming,
            deliverable: {
              ...incoming.deliverable,
              streamPath: prev.deliverable.streamPath,
            },
          };
        }
        return incoming;
      });
      if (!preserveDraftEdits) {
        setWebsiteUrl(incoming.websiteUrl ?? '');
        setCreativeInput(incoming.creativeInput ?? {});
        setDefaultStyle(
          resolveEffectiveHookStyleClient(incoming.defaultStyleConfig),
        );
        const hydrated = hydrateDraftVariations(incoming);
        setDraftVariations(hydrated);
        setActiveKey((prev) => {
          if (prev && hydrated.some((item) => item.localKey === prev)) {
            return prev;
          }
          if (preferredVariationNumber) {
            const byNumber = hydrated.find(
              (item) => item.variationNumber === preferredVariationNumber,
            );
            if (byNumber) return byNumber.localKey;
          }
          return hydrated[0]?.localKey ?? null;
        });
      } else {
        // Merge render progress/outputs without clobbering unsaved text/style edits
        const byId = new Map(incoming.variations.map((v) => [v.id, v]));
        setDraftVariations((prev) =>
          prev.map((item) => {
            const remote = item.id ? byId.get(item.id) : undefined;
            if (!remote) return item;
            return {
              ...item,
              renderStatus: remote.renderStatus,
              renderProgress: remote.renderProgress,
              renderError: remote.renderError,
              // Only refresh rendered streamPath when output actually changed or became ready
              streamPath:
                item.streamPath &&
                item.outputSizeBytes === remote.outputSizeBytes &&
                item.renderStatus === remote.renderStatus
                  ? item.streamPath
                  : remote.streamPath,
              thumbnailPath: remote.thumbnailPath,
              outputSizeBytes: remote.outputSizeBytes,
              driveSyncStatus: remote.driveSyncStatus,
              driveWebUrl: remote.driveWebUrl,
              clientVisibility: remote.clientVisibility,
            };
          }),
        );
      }
    },
    [],
  );

  // Immediately clear stale project state whenever deliverableId changes
  useEffect(() => {
    setHydratedDeliverableId(null);
    setProject(null);
    setDraftVariations([]);
    setActiveKey(null);
    setPreviewMode('editor');
    setDetectedVideoMeta({});
    setCurrentTime(0);
    setIsPlaying(false);
    setStatusMessage(null);
  }, [deliverableId]);

  useEffect(() => {
    if (!deliverableId) return;
    const incoming = projectData?.deliveryHookProject;
    if (!incoming || incoming.deliverableId !== deliverableId) return;
    const isFreshDeliverable = hydratedDeliverableId !== deliverableId;
    setHydratedDeliverableId(deliverableId);
    applyServerProject(incoming, !isFreshDeliverable);
  }, [deliverableId, projectData, hydratedDeliverableId, applyServerProject]);

  // Poll render status while any variation is QUEUED or RENDERING
  const hasActiveRender = useMemo(
    () =>
      draftVariations.some(
        (v) => v.renderStatus === 'QUEUED' || v.renderStatus === 'RENDERING',
      ),
    [draftVariations],
  );

  useEffect(() => {
    if (!deliverableId || !hasActiveRender) return;
    let active = true;
    const interval = window.setInterval(() => {
      void refetchProject()
        .then((res) => {
          if (!active) return;
          const next = res.data?.deliveryHookProject;
          if (next && next.deliverableId === deliverableId) {
            applyServerProject(next, true);
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [deliverableId, hasActiveRender, refetchProject, applyServerProject]);

  // Track video viewport size so live preview scales identically to native render
  useEffect(() => {
    if (!stageEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setStageDims({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  const activeVariation = useMemo(
    () => draftVariations.find((v) => v.localKey === activeKey) ?? null,
    [draftVariations, activeKey],
  );

  const effectiveStyle = useMemo(
    () =>
      resolveEffectiveHookStyleClient(
        defaultStyle,
        activeVariation?.styleOverride,
      ),
    [defaultStyle, activeVariation],
  );

  const videoDuration =
    project?.deliverable.mediaMeta?.durationSec ??
    detectedVideoMeta.duration ??
    15;
  const nativeWidth =
    project?.deliverable.mediaMeta?.width ?? detectedVideoMeta.width ?? 1080;
  const nativeHeight =
    project?.deliverable.mediaMeta?.height ?? detectedVideoMeta.height ?? 1920;
  const isPortrait = nativeHeight > nativeWidth;
  const aspectRatioCss = `${nativeWidth} / ${nativeHeight}`;

  const safeZoneWarning = useMemo(
    () =>
      checkSafeZoneOverlap(effectiveStyle, effectiveStyle.safeZoneGuide, {
        hookText: activeVariation?.hookText ?? '',
        width: nativeWidth,
        height: nativeHeight,
      }),
    [effectiveStyle, activeVariation?.hookText, nativeWidth, nativeHeight],
  );

  const updateActiveStyle = useCallback(
    (patch: Partial<HookStyleConfig>) => {
      if (styleScope === 'override' && activeVariation) {
        setDraftVariations((prev) =>
          prev.map((item) =>
            item.localKey === activeVariation.localKey
              ? {
                  ...item,
                  styleOverride: {
                    ...(item.styleOverride ?? {}),
                    ...patch,
                  },
                }
              : item,
          ),
        );
      } else {
        setDefaultStyle((prev) => ({ ...prev, ...patch }));
      }
    },
    [styleScope, activeVariation],
  );

  const updateActiveVariation = useCallback(
    (patch: Partial<DraftVariation>) => {
      if (!activeVariation) return;
      setDraftVariations((prev) =>
        prev.map((item) =>
          item.localKey === activeVariation.localKey
            ? { ...item, ...patch }
            : item,
        ),
      );
    },
    [activeVariation],
  );

  const addVariation = (seed?: {
    hookText: string;
    angleTag?: string;
    rationale?: string;
    startSec?: number;
    endSec?: number;
  }) => {
    if (draftVariations.length >= 15) {
      setStatusMessage({
        tone: 'warning',
        text: 'Maximum of 15 hook variations per video reached.',
      });
      return;
    }
    const nextNum =
      draftVariations.reduce(
        (max, v) => Math.max(max, v.variationNumber),
        0,
      ) + 1;
    const localKey = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newVar: DraftVariation = {
      localKey,
      variationNumber: nextNum,
      hookText: seed?.hookText ?? 'Stop scrolling — watch this',
      angleTag: seed?.angleTag ?? 'Custom',
      rationale: seed?.rationale ?? '',
      startSec: seed?.startSec ?? 0,
      endSec: Math.min(
        videoDuration,
        Math.max(1.2, seed?.endSec ?? Math.min(3.5, videoDuration)),
      ),
      styleOverride: null,
      renderStatus: 'PENDING',
      renderProgress: 0,
      renderError: null,
      streamPath: null,
      thumbnailPath: null,
      outputSizeBytes: 0,
      driveSyncStatus: 'NOT_SYNCED',
      driveWebUrl: null,
      clientVisibility: 'INTERNAL',
    };
    setDraftVariations((prev) => [...prev, newVar]);
    setActiveKey(localKey);
    setPreviewMode('editor');
  };

  const removeVariation = (localKey: string) => {
    setDraftVariations((prev) => {
      const remaining = prev
        .filter((item) => item.localKey !== localKey)
        .map((item, idx) => ({ ...item, variationNumber: idx + 1 }));
      if (activeKey === localKey) {
        setActiveKey(remaining[0]?.localKey ?? null);
      }
      return remaining;
    });
  };

  const handleAnalyzeContext = async () => {
    if (!deliverableId) return;
    setStatusMessage({
      tone: 'info',
      text: 'Analyzing client website and video visuals with AI…',
    });
    try {
      const res = await analyzeContextMutation({
        variables: {
          input: {
            deliverableId,
            websiteUrl: websiteUrl.trim() || null,
            refreshWebsite: true,
            refreshVideo: true,
          },
        },
      });
      const updated = res.data?.analyzeDeliveryHookContext;
      if (updated) {
        applyServerProject(updated, true);
        setProject(updated);
        setStatusMessage({
          tone: updated.lastError ? 'warning' : 'success',
          text: updated.lastError
            ? `Analysis finished with notes: ${updated.lastError}`
            : 'Website profile, Brand Knowledge, and Video Analysis synced!',
        });
      }
    } catch (error) {
      setStatusMessage({
        tone: 'error',
        text:
          error instanceof Error ? error.message : 'Context analysis failed.',
      });
    }
  };

  const handleGenerateHooks = async () => {
    if (!deliverableId) return;
    setStatusMessage({
      tone: 'info',
      text: 'Generating ranked scroll-stopping text hooks…',
    });
    try {
      const res = await generateSuggestionsMutation({
        variables: {
          input: {
            deliverableId,
            websiteUrl: websiteUrl.trim() || null,
            creativeInput,
          },
        },
      });
      const updated = res.data?.generateDeliveryHookSuggestions;
      if (updated) {
        setProject(updated);
        setStatusMessage({
          tone: 'success',
          text: `Generated ${updated.aiSuggestions.length} ranked text hooks. Click "+ Add" on any hook to test it.`,
        });
      }
    } catch (error) {
      setStatusMessage({
        tone: 'error',
        text:
          error instanceof Error ? error.message : 'Hook generation failed.',
      });
    }
  };

  const saveDraftProject = async (): Promise<HookProjectData | null> => {
    if (!deliverableId) return null;
    const activeIndex = draftVariations.findIndex(
      (v) => v.localKey === activeKey,
    );
    const preferredVariationNumber = activeIndex >= 0 ? activeIndex + 1 : null;
    const res = await saveProjectMutation({
      variables: {
        input: {
          deliverableId,
          websiteUrl: websiteUrl.trim() || null,
          creativeInput,
          defaultStyleConfig: defaultStyle,
          variations: draftVariations.map((v, idx) => ({
            ...(v.id ? { id: v.id } : {}),
            variationNumber: idx + 1,
            hookText: v.hookText.trim() || 'Watch this',
            angleTag: v.angleTag,
            rationale: v.rationale,
            startSec: Number(v.startSec),
            endSec: Math.max(Number(v.startSec) + 0.2, Number(v.endSec)),
            styleOverride: v.styleOverride,
          })),
        },
      },
    });
    const saved = res.data?.saveDeliveryHookProject ?? null;
    if (saved) {
      applyServerProject(saved, false, preferredVariationNumber);
    }
    return saved;
  };

  const uploadOverlayPngForVariation = async (
    variationId: string,
    pngBlob: Blob,
  ) => {
    const formData = new FormData();
    formData.append('file', pngBlob, `overlay-${variationId}.png`);
    const tokenPair = store.get(tokenPairState.atom);
    const isCookieAuth = store.get(isCookieAuthActiveState.atom);
    const headers: Record<string, string> = {};
    if (!isCookieAuth && tokenPair?.accessOrWorkspaceAgnosticToken?.token) {
      headers.Authorization = `Bearer ${tokenPair.accessOrWorkspaceAgnosticToken.token}`;
    }

    const response = await fetch(
      `${REACT_APP_SERVER_BASE_URL}/portal/delivery-deliverables/variations/${variationId}/overlay`,
      {
        method: 'POST',
        headers,
        body: formData,
        credentials: isCookieAuth ? 'include' : 'same-origin',
      },
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `Failed to upload WYSIWYG overlay PNG (${response.status}): ${errText.slice(0, 140)}`,
      );
    }
  };

  const handleSaveAndRender = async (options?: {
    onlyVariationId?: string;
    renderAll?: boolean;
  }) => {
    if (!deliverableId) return;
    if (draftVariations.length === 0) {
      setStatusMessage({
        tone: 'warning',
        text: 'Add at least one text-hook variation before rendering.',
      });
      return;
    }

    setIsPreparingRender(true);
    setStatusMessage({
      tone: 'info',
      text: 'Saving project and generating native-resolution WYSIWYG overlay PNGs…',
    });

    try {
      const saved = await saveDraftProject();
      if (!saved || saved.variations.length === 0) {
        throw new Error('Could not save hook variations.');
      }

      const eligible = saved.variations.filter(
        (v) => v.renderStatus !== 'QUEUED' && v.renderStatus !== 'RENDERING',
      );
      const targets = options?.onlyVariationId
        ? eligible.filter((v) => v.id === options.onlyVariationId)
        : options?.renderAll
          ? eligible
          : eligible.filter((v) => v.renderStatus !== 'READY');

      if (targets.length === 0) {
        setStatusMessage({
          tone: 'info',
          text: 'All variations are already rendered or currently rendering.',
        });
        return;
      }

      const width =
        saved.deliverable.mediaMeta?.width ??
        videoEl?.videoWidth ??
        detectedVideoMeta.width ??
        1080;
      const height =
        saved.deliverable.mediaMeta?.height ??
        videoEl?.videoHeight ??
        detectedVideoMeta.height ??
        1920;

      for (const variation of targets) {
        const pngBlob = await renderHookOverlayToPngBlob({
          width,
          height,
          hookText: variation.hookText,
          style: variation.effectiveStyle,
        });
        await uploadOverlayPngForVariation(variation.id, pngBlob);
      }

      const queuedRes = await queueRenderMutation({
        variables: {
          input: {
            deliverableId,
            variationIds: targets.map((v) => v.id),
          },
        },
      });
      const queuedProject = queuedRes.data?.queueDeliveryHookRender;
      if (queuedProject) {
        applyServerProject(queuedProject, true);
      }
      setStatusMessage({
        tone: 'success',
        text: `Queued ${targets.length} zero-quality-loss variation render(s). Videos auto-sync to Google Drive when finished.`,
      });
    } catch (error) {
      setStatusMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to queue render.',
      });
    } finally {
      setIsPreparingRender(false);
    }
  };

  const handlePublish = async () => {
    if (!deliverableId) return;
    try {
      const res = await publishMutation({
        variables: {
          input: {
            deliverableId,
            publishDeliverable: true,
          },
        },
      });
      const updated = res.data?.publishDeliveryHookVariations;
      if (updated) {
        applyServerProject(updated, true);
        setStatusMessage({
          tone: 'success',
          text: 'Published all rendered hook variations to the Client Dashboard and queued Google Drive sync!',
        });
      }
    } catch (error) {
      setStatusMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not publish variations.',
      });
    }
  };

  // Dragging handler for WYSIWYG placement
  const handleOverlayPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingOverlay(true);
  };

  const handleOverlayPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isDraggingOverlay || !stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    let nextX = ((event.clientX - rect.left) / rect.width) * 100;
    const nextY = Math.min(
      95,
      Math.max(5, ((event.clientY - rect.top) / rect.height) * 100),
    );
    if (Math.abs(nextX - 50) <= 1.8) {
      nextX = 50;
      setSnappedCenter(true);
    } else {
      setSnappedCenter(false);
      nextX = Math.min(95, Math.max(5, nextX));
    }

    updateActiveStyle({
      xPct: Number(nextX.toFixed(1)),
      yPct: Number(nextY.toFixed(1)),
    });
  };

  const handleOverlayPointerUp = () => {
    setIsDraggingOverlay(false);
    setSnappedCenter(false);
  };

  // Compute live preview opacity for fade-in/fade-out
  const previewOverlayOpacity = useMemo(() => {
    if (!activeVariation) return 0;
    if (!isPlaying) return 1;
    const start = activeVariation.startSec;
    const end = activeVariation.endSec;
    if (currentTime < start || currentTime > end) return 0;
    const fadeIn = effectiveStyle.fadeInSec;
    const fadeOut = effectiveStyle.fadeOutSec;
    if (fadeIn > 0.01 && currentTime < start + fadeIn) {
      return Math.max(0, Math.min(1, (currentTime - start) / fadeIn));
    }
    if (fadeOut > 0.01 && currentTime > end - fadeOut) {
      return Math.max(0, Math.min(1, (end - currentTime) / fadeOut));
    }
    return 1;
  }, [activeVariation, isPlaying, currentTime, effectiveStyle]);

  // Scale preview typography identically to canvas render
  const stageRefDim = Math.min(stageDims.width, stageDims.height);
  const stageScale = stageRefDim / 1080;
  const previewFontSizePx = Math.max(
    11,
    Math.round((stageRefDim * effectiveStyle.fontSizePct) / 100),
  );

  const safeZoneSpec =
    effectiveStyle.safeZoneGuide && effectiveStyle.safeZoneGuide !== 'NONE'
      ? SAFE_ZONE_SPECS[effectiveStyle.safeZoneGuide]
      : null;

  const readyCount = draftVariations.filter(
    (v) => v.renderStatus === 'READY',
  ).length;
  const pendingCount = draftVariations.filter(
    (v) =>
      v.renderStatus !== 'READY' &&
      v.renderStatus !== 'QUEUED' &&
      v.renderStatus !== 'RENDERING',
  ).length;

  const currentProject =
    project && project.deliverableId === deliverableId ? project : null;

  const activeVideoUrl =
    previewMode === 'rendered' && activeVariation?.streamPath
      ? toAbsoluteServerUrl(activeVariation.streamPath)
      : toAbsoluteServerUrl(currentProject?.deliverable.streamPath ?? null);

  const stableVideoKey =
    previewMode === 'rendered'
      ? `rendered:${activeVariation?.id ?? 'none'}:${activeVariation?.outputSizeBytes ?? 0}`
      : `editor:${currentProject?.deliverable.id ?? 'none'}`;

  return (
    <DeliveryOperationalPage view="creative">
      <StyledDeliveryCard>
        <StyledDeliveryRow
          style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Visual Text-Hook Variation Studio
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.78 }}>
              Generate AI-powered text hooks from Brand Knowledge, client
              website, and video visuals — drag to place inside platform safe
              zones and render zero-quality-loss v1 / v2 / v3 variations.
            </p>
          </div>
          <StyledDeliveryRow>
            <StyledBackLink to="/delivery?view=deliverables">
              Back to Deliverable Hub
            </StyledBackLink>
            {deliverableId && (
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('deliverableId');
                  setParams(next);
                }}
              >
                Switch Video
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryRow>
      </StyledDeliveryCard>
      {statusMessage && (
        <StyledNotice tone={statusMessage.tone}>
          {statusMessage.text}
        </StyledNotice>
      )}

      {!deliverableId ? (
        <StyledPanelCard>
          <StyledSectionTitle>
            Choose a Video Deliverable to Create Hook Variations
          </StyledSectionTitle>
          {deliverablesListError ? (
            <StyledNotice tone="error">
              Could not load video deliverables:{' '}
              {deliverablesListError.message || 'Unknown error'}
            </StyledNotice>
          ) : loadingList ? (
            <div>Loading uploaded videos…</div>
          ) : videoDeliverables.length === 0 ? (
            <StyledNotice tone="info">
              No video deliverables uploaded yet. Upload a master video in the
              Deliverable Hub first, then open it here to build text-hook
              variations.
            </StyledNotice>
          ) : (
            <StyledVideoPickerGrid>
              {videoDeliverables.map((video) => {
                const thumbUrl = toAbsoluteServerUrl(video.thumbnailPath);
                return (
                  <StyledVideoPickerTile
                    key={video.id}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set('view', 'creative');
                      next.set('creativeView', 'hooks');
                      next.set('deliverableId', video.id);
                      setParams(next);
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: '16 / 9',
                        background: themeCssVariables.background.invertedPrimary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={video.title}
                          style={{
                            height: '100%',
                            objectFit: 'cover',
                            width: '100%',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: themeCssVariables.font.color.tertiary,
                            fontSize: 12,
                          }}
                        >
                          VIDEO #{video.sequenceNumber}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: 10,
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>
                        #{video.sequenceNumber} — {video.title}
                      </strong>
                      <span style={{ fontSize: 12, opacity: 0.72 }}>
                        {clientNameMap.get(video.companyId) ?? 'Client'} •{' '}
                        {video.monthKey}
                        {video.mediaMeta?.durationSec
                          ? ` • ${formatDurationHuman(video.mediaMeta.durationSec)}`
                          : ''}
                      </span>
                      <StyledDeliveryRow>
                        <StyledDeliveryBadge>
                          {video.variations.length} variation(s)
                        </StyledDeliveryBadge>
                        {video.mediaMeta?.width && video.mediaMeta?.height && (
                          <StyledDeliveryBadge>
                            {video.mediaMeta.width}×{video.mediaMeta.height}
                          </StyledDeliveryBadge>
                        )}
                      </StyledDeliveryRow>
                    </div>
                  </StyledVideoPickerTile>
                );
              })}
            </StyledVideoPickerGrid>
          )}
        </StyledPanelCard>
      ) : loadingProject && !currentProject ? (
        <StyledPanelCard>Loading Text-Hook Studio…</StyledPanelCard>
      ) : projectError ? (
        <StyledNotice tone="error">
          {projectError.message || 'Could not load Text-Hook Studio project.'}
        </StyledNotice>
      ) : currentProject ? (
        <StyledDeliveryStack>
          {/* Header summary bar */}
          <StyledDeliveryCard>
            <StyledDeliveryRow
              style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
            >
              <div>
                <strong>
                  #{currentProject.deliverable.sequenceNumber} —{' '}
                  {currentProject.deliverable.title}
                </strong>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  {currentProject.companyName ?? 'Client'} •{' '}
                  {currentProject.deliverable.monthKey} • {nativeWidth}×
                  {nativeHeight}
                  {currentProject.deliverable.mediaMeta?.fps
                    ? ` @ ${Math.round(currentProject.deliverable.mediaMeta.fps)}fps`
                    : ''}
                  {videoDuration
                    ? ` • ${formatDurationHuman(videoDuration)}`
                    : ''}
                </div>
              </div>
              <StyledDeliveryRow>
                <StyledDeliveryBadge>
                  Brand Knowledge: {currentProject.brandKnowledgeCount} doc(s)
                </StyledDeliveryBadge>
                <StyledDeliveryBadge>
                  Drive: {currentProject.deliverable.driveSyncStatus}
                </StyledDeliveryBadge>
                <StyledDeliveryBadge>
                  Ready: {readyCount}/{draftVariations.length}
                </StyledDeliveryBadge>
              </StyledDeliveryRow>
            </StyledDeliveryRow>
          </StyledDeliveryCard>

          <StyledStudioGrid>
            {/* LEFT PANEL: AI Context + Ranked Hook Suggestions */}
            <StyledPanelCard>
              <StyledSectionTitle>
                1. AI Brand & Video Context
              </StyledSectionTitle>

              <StyledField>
                Client Website URL
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://clientwebsite.com"
                />
              </StyledField>

              <StyledDeliveryButton
                type="button"
                disabled={analyzing}
                onClick={handleAnalyzeContext}
              >
                {analyzing
                  ? 'Analyzing Website & Video…'
                  : 'Analyze Website & Video'}
              </StyledDeliveryButton>

              {currentProject.websiteProfileSnapshot && (
                <StyledNotice tone="info">
                  <strong>
                    {currentProject.websiteProfileSnapshot.brandName}
                    {currentProject.websiteProfileSnapshot.source === 'FALLBACK'
                      ? ' (Basic Metadata)'
                      : ''}
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    {currentProject.websiteProfileSnapshot.coreOffer ||
                      currentProject.websiteProfileSnapshot.summary}
                  </div>
                </StyledNotice>
              )}

              {currentProject.videoAnalysis && (
                <StyledNotice
                  tone={
                    currentProject.videoAnalysis.source === 'FALLBACK'
                      ? 'warning'
                      : 'info'
                  }
                >
                  <strong>
                    {currentProject.videoAnalysis.source === 'FALLBACK'
                      ? 'Aspect-Ratio Placement Fallback (Gemini unavailable)'
                      : 'Gemini Video Analysis'}
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    {currentProject.videoAnalysis.openingVisualSummary}
                  </div>
                  {currentProject.videoAnalysis.spokenTranscript && (
                    <div style={{ marginTop: 4, opacity: 0.85 }}>
                      “{currentProject.videoAnalysis.spokenTranscript.slice(0, 140)}”
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        updateActiveStyle({
                          yPct: currentProject.videoAnalysis?.suggestedYPct ?? 22,
                        })
                      }
                    >
                      Apply Safe Y ({currentProject.videoAnalysis.suggestedYPct}%)
                    </StyledDeliveryButton>
                  </div>
                </StyledNotice>
              )}

              <StyledSectionTitle>2. Creative Direction</StyledSectionTitle>

              <StyledDeliveryRow>
                <StyledField style={{ flex: 1 }}>
                  Platform
                  <select
                    value={creativeInput.platform ?? 'TIKTOK'}
                    onChange={(e) =>
                      setCreativeInput((prev) => ({
                        ...prev,
                        platform: e.target
                          .value as CreativeHookDirectionInput['platform'],
                      }))
                    }
                  >
                    <option value="TIKTOK">TikTok</option>
                    <option value="INSTAGRAM_REELS">IG Reels</option>
                    <option value="META_ADS">Meta Ads</option>
                    <option value="YOUTUBE_SHORTS">YT Shorts</option>
                    <option value="ALL">All Platforms</option>
                  </select>
                </StyledField>

                <StyledField style={{ flex: 1 }}>
                  Funnel
                  <select
                    value={creativeInput.funnelStage ?? 'COLD'}
                    onChange={(e) =>
                      setCreativeInput((prev) => ({
                        ...prev,
                        funnelStage: e.target
                          .value as CreativeHookDirectionInput['funnelStage'],
                      }))
                    }
                  >
                    <option value="COLD">Cold Traffic</option>
                    <option value="WARM">Warm</option>
                    <option value="RETARGETING">Retargeting</option>
                    <option value="ORGANIC">Organic</option>
                  </select>
                </StyledField>
              </StyledDeliveryRow>

              <StyledField>
                Offer / Angle Focus
                <input
                  type="text"
                  value={creativeInput.offerAngle ?? ''}
                  onChange={(e) =>
                    setCreativeInput((prev) => ({
                      ...prev,
                      offerAngle: e.target.value,
                    }))
                  }
                  placeholder="e.g. Free 14-day trial, 3x faster delivery…"
                />
              </StyledField>

              <StyledField>
                Custom Team Direction
                <textarea
                  value={creativeInput.customDirection ?? ''}
                  onChange={(e) =>
                    setCreativeInput((prev) => ({
                      ...prev,
                      customDirection: e.target.value,
                    }))
                  }
                  placeholder="Optional notes on audience objections, tone, or specific callouts…"
                />
              </StyledField>

              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="button"
                  disabled={generating}
                  onClick={handleGenerateHooks}
                >
                  {generating ? 'Generating Hooks…' : 'Generate 10 AI Hooks'}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => addVariation()}
                >
                  + Custom Hook
                </StyledDeliveryButton>
              </StyledDeliveryRow>

              {currentProject.aiSuggestions.length > 0 && (
                <StyledDeliveryStack style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {currentProject.aiSuggestions[0]?.source === 'FALLBACK' && (
                    <StyledNotice tone="warning">
                      Showing template fallback hooks (AI model unavailable).
                    </StyledNotice>
                  )}
                  {currentProject.aiSuggestions.map((hook, idx) => (
                    <StyledSuggestionCard key={hook.id}>
                      <StyledDeliveryRow
                        style={{ justifyContent: 'space-between' }}
                      >
                        <StyledDeliveryBadge>
                          #{idx + 1} • {hook.angleTag}
                        </StyledDeliveryBadge>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>
                          ~{hook.estimatedReadSec}s
                        </span>
                      </StyledDeliveryRow>
                      <strong style={{ fontSize: 13 }}>{hook.hookText}</strong>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>
                        {hook.rationale}
                      </span>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          addVariation({
                            hookText: hook.hookText,
                            angleTag: hook.angleTag,
                            rationale: hook.rationale,
                            startSec: hook.suggestedStartSec,
                            endSec: hook.suggestedEndSec,
                          })
                        }
                      >
                        + Add as Variation
                      </StyledDeliveryButton>
                    </StyledSuggestionCard>
                  ))}
                </StyledDeliveryStack>
              )}
            </StyledPanelCard>

            {/* CENTER STAGE: Live WYSIWYG Video + Drag Overlay + Variation Strip */}
            <StyledPanelCard>
              <StyledDeliveryRow
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setPreviewMode('editor')}
                  >
                    {previewMode === 'editor' ? '● Live Editor' : 'Live Editor'}
                  </StyledDeliveryButton>
                  {activeVariation?.renderStatus === 'READY' &&
                    activeVariation.streamPath && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => setPreviewMode('rendered')}
                      >
                        {previewMode === 'rendered'
                          ? `● Rendered v${activeVariation.variationNumber}`
                          : `Play Rendered v${activeVariation.variationNumber}`}
                      </StyledDeliveryButton>
                    )}
                </StyledDeliveryRow>

                <StyledDeliveryRow>
                  {(
                    [
                      'NONE',
                      'TIKTOK',
                      'INSTAGRAM_REELS',
                      'META_ADS',
                      'SHORTS',
                    ] as HookSafeZoneGuide[]
                  ).map((guide) => (
                    <StyledDeliveryButton
                      key={guide}
                      type="button"
                      onClick={() => updateActiveStyle({ safeZoneGuide: guide })}
                    >
                      {effectiveStyle.safeZoneGuide === guide ? '✓ ' : ''}
                      {SAFE_ZONE_SPECS[guide].label}
                    </StyledDeliveryButton>
                  ))}
                </StyledDeliveryRow>
              </StyledDeliveryRow>

              {safeZoneWarning && previewMode === 'editor' && (
                <StyledNotice tone="warning">{safeZoneWarning}</StyledNotice>
              )}

              <StyledStageWrapper>
                <StyledVideoViewport
                  ref={setStageEl}
                  aspectRatio={aspectRatioCss}
                  isPortrait={isPortrait}
                >
                  {activeVideoUrl ? (
                    <video
                      key={stableVideoKey}
                      ref={setVideoEl}
                      src={activeVideoUrl}
                      playsInline
                      preload="metadata"
                      controls={previewMode === 'rendered'}
                      onLoadedMetadata={(e) => {
                        const vid = e.currentTarget;
                        if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                          setDetectedVideoMeta({
                            width: vid.videoWidth,
                            height: vid.videoHeight,
                            duration:
                              Number.isFinite(vid.duration) && vid.duration > 0
                                ? vid.duration
                                : undefined,
                          });
                        }
                      }}
                      onTimeUpdate={(e) =>
                        setCurrentTime(e.currentTarget.currentTime)
                      }
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  ) : (
                    <div
                      style={{
                        color: themeCssVariables.font.color.tertiary,
                        display: 'flex',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                      }}
                    >
                      Source video unavailable
                    </div>
                  )}

                  {/* Platform Safe-Zone Guides */}
                  {previewMode === 'editor' && safeZoneSpec && (
                    <>
                      <StyledSafeZoneMask
                        style={{
                          top: 0,
                          left: 0,
                          right: 0,
                          height: `${safeZoneSpec.topPct}%`,
                        }}
                      />
                      <StyledSafeZoneMask
                        style={{
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: `${safeZoneSpec.bottomPct}%`,
                        }}
                      />
                      <StyledSafeZoneMask
                        style={{
                          top: `${safeZoneSpec.topPct}%`,
                          bottom: `${safeZoneSpec.bottomPct}%`,
                          right: 0,
                          width: `${safeZoneSpec.rightPct}%`,
                        }}
                      />
                      {safeZoneSpec.leftPct > 0 && (
                        <StyledSafeZoneMask
                          style={{
                            top: `${safeZoneSpec.topPct}%`,
                            bottom: `${safeZoneSpec.bottomPct}%`,
                            left: 0,
                            width: `${safeZoneSpec.leftPct}%`,
                          }}
                        />
                      )}
                    </>
                  )}

                  {previewMode === 'editor' && snappedCenter && (
                    <StyledCenterSnapLine />
                  )}

                  {/* Draggable WYSIWYG Hook Overlay */}
                  {previewMode === 'editor' && activeVariation && (
                    <StyledHookOverlayBox
                      onPointerDown={handleOverlayPointerDown}
                      onPointerMove={handleOverlayPointerMove}
                      onPointerUp={handleOverlayPointerUp}
                      onPointerCancel={handleOverlayPointerUp}
                      style={{
                        left: `${Math.min(97, Math.max(3, effectiveStyle.xPct))}%`,
                        top: `${Math.min(97, Math.max(3, effectiveStyle.yPct))}%`,
                        maxWidth: `${Math.min(94, effectiveStyle.maxWidthPct)}%`,
                        opacity: previewOverlayOpacity,
                        fontFamily: effectiveStyle.fontFamily,
                        fontSize: `${previewFontSizePx}px`,
                        fontWeight: effectiveStyle.fontWeight,
                        lineHeight: effectiveStyle.lineHeight,
                        textAlign: effectiveStyle.textAlign,
                        textTransform: effectiveStyle.uppercase
                          ? 'uppercase'
                          : 'none',
                        color: effectiveStyle.textColor,
                        backgroundColor:
                          effectiveStyle.backgroundOpacity > 0.01
                            ? hexToRgbaCss(
                                effectiveStyle.backgroundColor,
                                effectiveStyle.backgroundOpacity,
                              )
                            : 'transparent',
                        borderRadius: `${Math.round(effectiveStyle.backgroundRadiusPx * stageScale)}px`,
                        padding: `${Math.round(effectiveStyle.paddingYPx * stageScale)}px ${Math.round(effectiveStyle.paddingXPx * stageScale)}px`,
                        boxShadow:
                          effectiveStyle.shadowEnabled &&
                          effectiveStyle.backgroundOpacity > 0.01
                            ? themeCssVariables.boxShadow.strong
                            : 'none',
                        textShadow:
                          effectiveStyle.shadowEnabled &&
                          effectiveStyle.backgroundOpacity <= 0.01
                            ? `0 2px 10px ${themeCssVariables.background.invertedPrimary}`
                            : 'none',
                        WebkitTextStroke:
                          effectiveStyle.strokeWidthPx > 0
                            ? `${Math.max(1, effectiveStyle.strokeWidthPx * stageScale)}px ${effectiveStyle.strokeColor}`
                            : undefined,
                        outline: isDraggingOverlay
                          ? `2px dashed ${themeCssVariables.color.blue}`
                          : `1px dashed ${themeCssVariables.border.color.medium}`,
                      }}
                    >
                      {activeVariation.hookText}
                    </StyledHookOverlayBox>
                  )}
                </StyledVideoViewport>

                {/* Live Editor Transport Controls */}
                {previewMode === 'editor' && (
                  <div style={{ width: '100%' }}>
                    <StyledDeliveryRow
                      style={{ justifyContent: 'space-between', marginBottom: 6 }}
                    >
                      <StyledDeliveryRow>
                        <StyledDeliveryButton
                          type="button"
                          onClick={() => {
                            if (!videoEl) return;
                            if (videoEl.paused) {
                              void videoEl.play();
                            } else {
                              videoEl.pause();
                            }
                          }}
                        >
                          {isPlaying ? 'Pause' : 'Play'}
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          type="button"
                          onClick={() => {
                            if (!videoEl) return;
                            videoEl.currentTime = activeVariation?.startSec ?? 0;
                            setCurrentTime(videoEl.currentTime);
                          }}
                        >
                          Jump to Hook Start
                        </StyledDeliveryButton>
                      </StyledDeliveryRow>
                      <span
                        style={{
                          color: themeCssVariables.font.color.inverted,
                          fontSize: 12,
                        }}
                      >
                        {currentTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
                      </span>
                    </StyledDeliveryRow>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, videoDuration)}
                      step={0.05}
                      value={Math.min(currentTime, videoDuration)}
                      onChange={(e) => {
                        const nextTime = Number(e.target.value);
                        if (videoEl) {
                          videoEl.currentTime = nextTime;
                        }
                        setCurrentTime(nextTime);
                      }}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </StyledStageWrapper>

              {/* Variation Switcher Strip */}
              <StyledDeliveryRow
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <StyledSectionTitle>
                  Variations ({draftVariations.length})
                </StyledSectionTitle>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => addVariation()}
                >
                  + Add Variation
                </StyledDeliveryButton>
              </StyledDeliveryRow>

              {draftVariations.length === 0 ? (
                <StyledNotice tone="info">
                  Click “+ Add as Variation” on any AI hook or click “+ Add
                  Variation” to start creating v1, v2, v3…
                </StyledNotice>
              ) : (
                <StyledDeliveryRow style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  {draftVariations.map((v, idx) => (
                    <StyledVariationPill
                      key={v.localKey}
                      type="button"
                      active={v.localKey === activeKey}
                      onClick={() => setActiveKey(v.localKey)}
                    >
                      <StyledDeliveryRow
                        style={{
                          justifyContent: 'space-between',
                          width: '100%',
                        }}
                      >
                        <strong>v{idx + 1}</strong>
                        <StyledDeliveryBadge>
                          {v.renderStatus === 'RENDERING'
                            ? `${v.renderProgress}%`
                            : v.renderStatus}
                        </StyledDeliveryBadge>
                      </StyledDeliveryRow>
                      <span
                        style={{
                          fontSize: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {v.hookText}
                      </span>
                      {v.outputSizeBytes > 0 && (
                        <span style={{ fontSize: 10, opacity: 0.68 }}>
                          {formatBytesHuman(v.outputSizeBytes)} •{' '}
                          {v.clientVisibility}
                        </span>
                      )}
                    </StyledVariationPill>
                  ))}
                </StyledDeliveryRow>
              )}
            </StyledPanelCard>

            {/* RIGHT PANEL: Style Presets, Inspector & Render/Publish */}
            <StyledPanelCard>
              <StyledSectionTitle>
                3. Hook Editor & Visual Styling
              </StyledSectionTitle>

              {activeVariation ? (
                <>
                  <StyledField>
                    Hook Text (v{activeVariation.variationNumber})
                    <textarea
                      value={activeVariation.hookText}
                      onChange={(e) =>
                        updateActiveVariation({ hookText: e.target.value })
                      }
                      maxLength={240}
                    />
                  </StyledField>

                  <StyledDeliveryRow>
                    <StyledField style={{ flex: 1 }}>
                      Start (sec)
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0.5, videoDuration - 0.2)}
                        step={0.1}
                        value={activeVariation.startSec}
                        onChange={(e) =>
                          updateActiveVariation({
                            startSec: Math.max(0, Number(e.target.value)),
                          })
                        }
                      />
                    </StyledField>
                    <StyledField style={{ flex: 1 }}>
                      End (sec)
                      <input
                        type="number"
                        min={0.2}
                        max={videoDuration}
                        step={0.1}
                        value={activeVariation.endSec}
                        onChange={(e) =>
                          updateActiveVariation({
                            endSec: Math.min(
                              videoDuration,
                              Math.max(
                                activeVariation.startSec + 0.2,
                                Number(e.target.value),
                              ),
                            ),
                          })
                        }
                      />
                    </StyledField>
                  </StyledDeliveryRow>

                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setStyleScope('default')}
                    >
                      {styleScope === 'default' ? '● All Variations' : 'All Variations'}
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setStyleScope('override')}
                    >
                      {styleScope === 'override'
                        ? `● Only v${activeVariation.variationNumber}`
                        : `Only v${activeVariation.variationNumber}`}
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => removeVariation(activeVariation.localKey)}
                    >
                      Remove
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>

                  {activeVariation.renderError && (
                    <StyledNotice tone="error">
                      Render error: {activeVariation.renderError}
                    </StyledNotice>
                  )}
                </>
              ) : (
                <StyledNotice tone="info">
                  Select or add a variation to edit its text and timing.
                </StyledNotice>
              )}

              <StyledSectionTitle>Style Presets</StyledSectionTitle>
              <StyledPresetGrid>
                {HOOK_STYLE_PRESET_LABELS.map((preset) => (
                  <StyledPresetButton
                    key={preset.id}
                    type="button"
                    active={effectiveStyle.preset === preset.id}
                    onClick={() => {
                      const presetValues = currentProject.presets?.[preset.id];
                      if (presetValues) {
                        updateActiveStyle(presetValues as Partial<HookStyleConfig>);
                      }
                    }}
                  >
                    <span
                      style={{
                        background: preset.swatchBg,
                        color: preset.swatchFg,
                        border: `1px solid ${themeCssVariables.border.color.medium}`,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 5px',
                      }}
                    >
                      Aa
                    </span>
                    {preset.label}
                  </StyledPresetButton>
                ))}
              </StyledPresetGrid>

              <StyledDeliveryRow>
                <StyledField style={{ flex: 1 }}>
                  Font Size ({effectiveStyle.fontSizePct.toFixed(1)}%)
                  <input
                    type="range"
                    min={2.5}
                    max={9}
                    step={0.1}
                    value={effectiveStyle.fontSizePct}
                    onChange={(e) =>
                      updateActiveStyle({ fontSizePct: Number(e.target.value) })
                    }
                  />
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Max Width ({effectiveStyle.maxWidthPct}%)
                  <input
                    type="range"
                    min={40}
                    max={94}
                    step={1}
                    value={effectiveStyle.maxWidthPct}
                    onChange={(e) =>
                      updateActiveStyle({ maxWidthPct: Number(e.target.value) })
                    }
                  />
                </StyledField>
              </StyledDeliveryRow>

              <StyledDeliveryRow>
                <StyledField style={{ flex: 1 }}>
                  X ({effectiveStyle.xPct}%)
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={0.5}
                    value={effectiveStyle.xPct}
                    onChange={(e) =>
                      updateActiveStyle({ xPct: Number(e.target.value) })
                    }
                  />
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Y ({effectiveStyle.yPct}%)
                  <input
                    type="range"
                    min={8}
                    max={92}
                    step={0.5}
                    value={effectiveStyle.yPct}
                    onChange={(e) =>
                      updateActiveStyle({ yPct: Number(e.target.value) })
                    }
                  />
                </StyledField>
              </StyledDeliveryRow>

              <StyledDeliveryRow>
                <StyledField style={{ flex: 1 }}>
                  Text Color
                  <input
                    type="color"
                    value={effectiveStyle.textColor}
                    onChange={(e) =>
                      updateActiveStyle({ textColor: e.target.value })
                    }
                  />
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Box Color
                  <input
                    type="color"
                    value={effectiveStyle.backgroundColor}
                    onChange={(e) =>
                      updateActiveStyle({ backgroundColor: e.target.value })
                    }
                  />
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Box Opacity ({Math.round(effectiveStyle.backgroundOpacity * 100)}%)
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={effectiveStyle.backgroundOpacity}
                    onChange={(e) =>
                      updateActiveStyle({
                        backgroundOpacity: Number(e.target.value),
                      })
                    }
                  />
                </StyledField>
              </StyledDeliveryRow>

              <StyledDeliveryRow>
                <StyledField style={{ flex: 1 }}>
                  Align
                  <select
                    value={effectiveStyle.textAlign}
                    onChange={(e) =>
                      updateActiveStyle({
                        textAlign: e.target
                          .value as HookStyleConfig['textAlign'],
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Stroke ({effectiveStyle.strokeWidthPx}px)
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={1}
                    value={effectiveStyle.strokeWidthPx}
                    onChange={(e) =>
                      updateActiveStyle({
                        strokeWidthPx: Number(e.target.value),
                      })
                    }
                  />
                </StyledField>
              </StyledDeliveryRow>

              <StyledDeliveryRow>
                <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={effectiveStyle.uppercase}
                    onChange={(e) =>
                      updateActiveStyle({ uppercase: e.target.checked })
                    }
                  />
                  Uppercase
                </label>
                <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={effectiveStyle.shadowEnabled}
                    onChange={(e) =>
                      updateActiveStyle({ shadowEnabled: e.target.checked })
                    }
                  />
                  Drop Shadow
                </label>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => updateActiveStyle({ xPct: 50 })}
                >
                  Center X
                </StyledDeliveryButton>
              </StyledDeliveryRow>

              <StyledDeliveryStack style={{ marginTop: 8 }}>
                <StyledDeliveryButton
                  type="button"
                  disabled={saving || isPreparingRender}
                  onClick={async () => {
                    try {
                      await saveDraftProject();
                      setStatusMessage({
                        tone: 'success',
                        text: 'Draft hook variations saved.',
                      });
                    } catch (error) {
                      setStatusMessage({
                        tone: 'error',
                        text:
                          error instanceof Error
                            ? error.message
                            : 'Save failed.',
                      });
                    }
                  }}
                >
                  {saving ? 'Saving…' : 'Save Draft'}
                </StyledDeliveryButton>

                <StyledDeliveryButton
                  type="button"
                  disabled={
                    saving ||
                    queueing ||
                    isPreparingRender ||
                    draftVariations.length === 0
                  }
                  onClick={() =>
                    void handleSaveAndRender({ renderAll: pendingCount === 0 })
                  }
                >
                  {isPreparingRender || queueing
                    ? 'Preparing & Queueing Renders…'
                    : hasActiveRender
                      ? 'Rendering Variations…'
                      : pendingCount > 0
                        ? `Render ${pendingCount} Pending Variation(s) (Zero Quality Loss)`
                        : `Re-render All ${draftVariations.length} Variation(s) (Zero Quality Loss)`}
                </StyledDeliveryButton>

                {readyCount > 0 && pendingCount > 0 && (
                  <StyledDeliveryButton
                    type="button"
                    disabled={saving || queueing || isPreparingRender}
                    onClick={() =>
                      void handleSaveAndRender({ renderAll: true })
                    }
                  >
                    Re-render All {draftVariations.length} Variation(s)
                  </StyledDeliveryButton>
                )}

                {access.manager && (
                  <StyledDeliveryButton
                    type="button"
                    disabled={publishing || readyCount === 0}
                    onClick={() => void handlePublish()}
                  >
                    {publishing
                      ? 'Publishing…'
                      : `Publish ${readyCount} Ready Variation(s) to Client + Sync Drive`}
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            </StyledPanelCard>
          </StyledStudioGrid>
        </StyledDeliveryStack>
      ) : null}
    </DeliveryOperationalPage>
  );
};
