import {
  estimateModelCostUsd,
  formatUsdEstimate,
  type StudioModelSpecDTO,
} from '@/delivery/studio/delivery-studio.types';
import {
  closeStudioTab,
  createEmptyStudioTab,
  focusOrCreateClientTab,
  formatStudioTabLabel,
  loadStudioTabsState,
  saveStudioTabsState,
} from '@/delivery/studio/studio-tabs-storage';

const createMemoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

const CLIENTS = [
  {
    id: 'comp-belfort',
    name: 'Belfort',
    projects: [
      { id: 'proj-hokuro', name: 'Hokuro', companyId: 'comp-belfort' },
      { id: 'proj-suku', name: 'Suku', companyId: 'comp-belfort' },
    ],
  },
  {
    id: 'comp-lumina',
    name: 'Lumina',
    projects: [],
  },
];

describe('studio-tabs-storage & cost helpers', () => {
  it('persists and restores multi-client tabs across reloads', () => {
    const storage = createMemoryStorage();
    const initial = loadStudioTabsState(storage);
    expect(initial.tabs).toHaveLength(1);

    const hokuro = focusOrCreateClientTab(initial, {
      companyId: 'comp-belfort',
      projectId: 'proj-hokuro',
      label: formatStudioTabLabel(CLIENTS, 'comp-belfort', 'proj-hokuro'),
      stage: 'VIDEO_GENERATION',
    });
    expect(hokuro.tabs).toHaveLength(1); // reused initial blank tab
    expect(hokuro.tabs[0].label).toBe('Belfort · Hokuro');

    const withSuku = focusOrCreateClientTab(hokuro, {
      companyId: 'comp-belfort',
      projectId: 'proj-suku',
      label: formatStudioTabLabel(CLIENTS, 'comp-belfort', 'proj-suku'),
    });
    expect(withSuku.tabs).toHaveLength(2);
    expect(withSuku.activeTabId).toBe(withSuku.tabs[1].id);

    saveStudioTabsState(withSuku, storage);
    const restored = loadStudioTabsState(storage);
    expect(restored.tabs).toHaveLength(2);
    expect(restored.tabs[0].label).toBe('Belfort · Hokuro');
    expect(restored.tabs[1].label).toBe('Belfort · Suku');
    expect(restored.activeTabId).toBe(withSuku.activeTabId);
  });

  it('focuses an existing client/project tab instead of duplicating on deep link', () => {
    const tab1 = createEmptyStudioTab({
      id: 'tab-1',
      companyId: 'comp-belfort',
      projectId: 'proj-hokuro',
      label: 'Belfort · Hokuro',
      stage: 'CHARACTER_SHEET',
    });
    const tab2 = createEmptyStudioTab({
      id: 'tab-2',
      companyId: 'comp-lumina',
      projectId: null,
      label: 'Lumina',
    });
    const state = { activeTabId: 'tab-2', tabs: [tab1, tab2] };

    const focused = focusOrCreateClientTab(state, {
      companyId: 'comp-belfort',
      projectId: 'proj-hokuro',
      stage: 'TEXT_HOOKS',
    });
    expect(focused.tabs).toHaveLength(2);
    expect(focused.activeTabId).toBe('tab-1');
    expect(focused.tabs[0].stage).toBe('TEXT_HOOKS');
  });

  it('keeps at least one fresh tab open when closing the last tab', () => {
    const only = createEmptyStudioTab({ id: 'tab-only' });
    const next = closeStudioTab({ activeTabId: 'tab-only', tabs: [only] }, 'tab-only');
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].id).not.toBe('tab-only');
  });

  it('estimates image and video model costs accurately', () => {
    const nanoBanana: StudioModelSpecDTO = {
      key: 'nano-banana-2.1',
      label: 'Nano Banana 2.1',
      vendor: 'Google',
      kind: 'IMAGE',
      tier: 'PRO',
      summary: 'Test',
      recommendedFor: [],
      capabilities: {
        supportsMultiImageRef: true,
        maxReferenceImages: 8,
        supportsReferenceVideo: false,
        supportsAudioGeneration: false,
        supportsAspectRatios: ['3:4'],
        supportsResolutions: ['1K', '2K', '4K'],
        defaultResolution: '2K',
      },
      pricing: {
        unit: 'PER_IMAGE',
        baseUsd: 0.08,
        resolutionMultipliers: { '1K': 1, '2K': 1.5, '4K': 2.5 },
      },
      providers: { wavespeed: { endpoint: 'x' }, kie: { model: 'y' } },
    };

    const seedance: StudioModelSpecDTO = {
      ...nanoBanana,
      key: 'seedance-2.5',
      kind: 'VIDEO',
      pricing: {
        unit: 'PER_SECOND',
        baseUsd: 0.07,
        resolutionMultipliers: { '720p': 1, '1080p': 1.5 },
      },
    };

    expect(
      estimateModelCostUsd(nanoBanana, { resolution: '2K', count: 4 }),
    ).toBeCloseTo(0.48, 4);
    expect(
      estimateModelCostUsd(seedance, {
        resolution: '1080p',
        durationSec: 10,
        count: 1,
      }),
    ).toBeCloseTo(1.05, 4);
    expect(formatUsdEstimate(1.05)).toBe('$1.05');
  });
});
