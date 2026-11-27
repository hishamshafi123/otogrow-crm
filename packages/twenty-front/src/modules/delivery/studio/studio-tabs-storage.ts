import {
  type StudioClientOption,
  type StudioRoutingMode,
  type StudioStageKey,
} from '@/delivery/studio/delivery-studio.types';

export type StudioBatchDraftRow = {
  id: string;
  title: string;
  referenceVideoId: string;
  characterAssetId: string;
  productKitId: string;
  environmentOverride: string;
};

export type StudioTabDraft = {
  id: string;
  companyId: string | null;
  projectId: string | null;
  label: string;
  stage: StudioStageKey;
  // Shared selections
  selectedProductKitId: string | null;
  selectedProductAssetIds: string[];
  selectedAvatarPresetId: string | null;
  selectedEnvironmentPresetId: string | null;
  selectedReferenceVideoId: string | null;
  selectedCharacterAssetId: string | null;
  selectedVideoAssetId: string | null;
  layoutModeOverride: 'AUTO' | 'CLOTHING' | 'GENERAL';
  // Character Sheet settings
  characterPresetId: string | null;
  characterMasterPrompt: string;
  characterAngles: string[];
  characterAngleLayout: 'GRID_SHEET' | 'SEPARATE_FRAMES' | 'SINGLE_HERO';
  characterTalent: string;
  characterEnvironment: string;
  characterCustomNotes: string;
  imageModelKey: string;
  imageResolution: string;
  imageAspectRatio: string;
  imageCandidateCount: number;
  // Video Generation settings
  videoPresetId: string | null;
  videoMasterPrompt: string;
  videoEnvironmentOverride: string;
  videoCustomNotes: string;
  videoModelKey: string;
  compareMode: boolean;
  compareModelKey: string;
  videoResolution: string;
  videoAspectRatio: string;
  videoDurationSec: number;
  videoDurationAutoMatched: boolean;
  autoPromptWithGemini: boolean;
  geminiPromptMeta?: {
    source: string;
    modelId: string | null;
    summary: string;
    key: string;
  } | null;
  generateAudio: boolean;
  // Routing
  routingMode: StudioRoutingMode;
  // Batch Matrix rows
  batchRows: StudioBatchDraftRow[];
};

export type StudioTabsState = {
  activeTabId: string;
  tabs: StudioTabDraft[];
};

const STORAGE_KEY = 'otogrow.aiStudio.tabs.v1';
const MAX_TABS = 12;

export const createEmptyStudioTab = (
  overrides?: Partial<StudioTabDraft>,
): StudioTabDraft => ({
  id: `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  companyId: null,
  projectId: null,
  label: 'New Studio Tab',
  stage: 'CHARACTER_SHEET',
  selectedProductKitId: null,
  selectedProductAssetIds: [],
  selectedAvatarPresetId: null,
  selectedEnvironmentPresetId: null,
  selectedReferenceVideoId: null,
  selectedCharacterAssetId: null,
  selectedVideoAssetId: null,
  layoutModeOverride: 'AUTO',
  characterPresetId: null,
  characterMasterPrompt: '',
  characterAngles: [
    'Full-body Front View',
    'Full-body Back View showing back print',
    '3/4 Side Profile',
    'Upper Torso Close-up showing fabric & print detail',
  ],
  characterAngleLayout: 'GRID_SHEET',
  characterTalent: '',
  characterEnvironment: '',
  characterCustomNotes: '',
  imageModelKey: 'nano-banana-2.1',
  imageResolution: '2K',
  imageAspectRatio: '3:4',
  imageCandidateCount: 1,
  videoPresetId: null,
  videoMasterPrompt: '',
  videoEnvironmentOverride: '',
  videoCustomNotes: '',
  videoModelKey: 'seedance-2.5',
  compareMode: false,
  compareModelKey: 'wan-3.0-prime',
  videoResolution: '1080p',
  videoAspectRatio: '9:16',
  videoDurationSec: 8,
  videoDurationAutoMatched: true,
  autoPromptWithGemini: true,
  geminiPromptMeta: null,
  generateAudio: true,
  routingMode: 'AUTO_FAILOVER',
  batchRows: [],
  ...overrides,
});

export const formatStudioTabLabel = (
  clients: StudioClientOption[],
  companyId: string | null,
  projectId: string | null,
): string => {
  if (!companyId) return 'New Studio Tab';
  const client = clients.find((c) => c.id === companyId);
  if (!client) return 'Client Studio';
  if (projectId) {
    const project = client.projects.find((p) => p.id === projectId);
    if (project) return `${client.name} · ${project.name}`;
  }
  return client.name;
};

export const loadStudioTabsState = (
  storage?: Pick<Storage, 'getItem'>,
): StudioTabsState => {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (target) {
    try {
      const raw = target.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StudioTabsState>;
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          const hydrated = parsed.tabs
            .slice(0, MAX_TABS)
            .map((tab) => createEmptyStudioTab(tab));
          const activeTabId = hydrated.some((t) => t.id === parsed.activeTabId)
            ? (parsed.activeTabId as string)
            : hydrated[0].id;
          return { activeTabId, tabs: hydrated };
        }
      }
    } catch {
      // Ignore malformed storage and start clean
    }
  }
  const initial = createEmptyStudioTab();
  return { activeTabId: initial.id, tabs: [initial] };
};

export const saveStudioTabsState = (
  state: StudioTabsState,
  storage?: Pick<Storage, 'setItem'>,
): void => {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
};

/**
 * Focus an existing tab matching (companyId, projectId), or open a new tab if not open yet.
 * Used for deep links ("Open in AI Studio" from Client Workspace or Deliverables).
 */
export const focusOrCreateClientTab = (
  state: StudioTabsState,
  target: {
    companyId: string;
    projectId?: string | null;
    stage?: StudioStageKey;
    label?: string;
  },
): StudioTabsState => {
  const normalizedProjectId = target.projectId ?? null;
  const existing = state.tabs.find(
    (tab) =>
      tab.companyId === target.companyId &&
      (tab.projectId ?? null) === normalizedProjectId,
  );
  if (existing) {
    return {
      activeTabId: existing.id,
      tabs: state.tabs.map((tab) =>
        tab.id === existing.id
          ? {
              ...tab,
              ...(target.stage ? { stage: target.stage } : {}),
              ...(target.label ? { label: target.label } : {}),
            }
          : tab,
      ),
    };
  }

  // If the only open tab is blank, reuse it instead of cluttering the tab strip
  if (state.tabs.length === 1 && !state.tabs[0].companyId) {
    const reused: StudioTabDraft = {
      ...state.tabs[0],
      companyId: target.companyId,
      projectId: normalizedProjectId,
      label: target.label ?? state.tabs[0].label,
      ...(target.stage ? { stage: target.stage } : {}),
    };
    return { activeTabId: reused.id, tabs: [reused] };
  }

  const created = createEmptyStudioTab({
    companyId: target.companyId,
    projectId: normalizedProjectId,
    label: target.label ?? 'Client Studio',
    ...(target.stage ? { stage: target.stage } : {}),
  });
  const nextTabs = [...state.tabs, created].slice(-MAX_TABS);
  return { activeTabId: created.id, tabs: nextTabs };
};

export const closeStudioTab = (
  state: StudioTabsState,
  tabId: string,
): StudioTabsState => {
  const remaining = state.tabs.filter((t) => t.id !== tabId);
  if (remaining.length === 0) {
    const fresh = createEmptyStudioTab();
    return { activeTabId: fresh.id, tabs: [fresh] };
  }
  const activeTabId =
    state.activeTabId === tabId
      ? remaining[Math.max(0, remaining.length - 1)].id
      : state.activeTabId;
  return { activeTabId, tabs: remaining };
};
