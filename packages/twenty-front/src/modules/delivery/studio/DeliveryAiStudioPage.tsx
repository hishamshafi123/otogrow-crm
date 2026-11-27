import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import {
  BATCH_GENERATE_DELIVERY_STUDIO_VIDEOS,
  GENERATE_DELIVERY_STUDIO_CHARACTER_SHEET,
  GENERATE_DELIVERY_STUDIO_VIDEO,
  GET_DELIVERY_STUDIO_WORKSPACE,
  REMOVE_DELIVERY_STUDIO_PRODUCT_KIT_ASSET,
  SET_DELIVERY_STUDIO_ASSET_APPROVED,
  UPSERT_DELIVERY_STUDIO_PRODUCT_KIT,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  estimateModelCostUsd,
  formatUsdEstimate,
  type StudioPresetKind,
  type StudioRoutingMode,
  type StudioStageKey,
  type StudioWorkspacePayload,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { DeliveryStudioHooksStage } from '@/delivery/studio/DeliveryStudioHooksStage';
import { DeliveryStudioPresetModal } from '@/delivery/studio/DeliveryStudioPresetModal';
import { DeliveryStudioProviderModal } from '@/delivery/studio/DeliveryStudioProviderModal';
import { DeliveryStudioQueueDock } from '@/delivery/studio/DeliveryStudioQueueDock';
import {
  closeStudioTab,
  createEmptyStudioTab,
  focusOrCreateClientTab,
  formatStudioTabLabel,
  loadStudioTabsState,
  saveStudioTabsState,
  type StudioTabDraft,
  type StudioTabsState,
} from '@/delivery/studio/studio-tabs-storage';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 150px);
  overflow: hidden;
`;

const StyledTabStrip = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  gap: 6px;
  justify-content: space-between;
  padding: 8px 12px;
`;

const StyledTabList = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: 6px;
  overflow-x: auto;
`;

const StyledTabPill = styled.div<{ active: boolean }>`
  align-items: center;
  background: ${({ active }) =>
    active ? themeCssVariables.background.primary : 'transparent'};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.border.color.strong
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: ${({ active }) => (active ? 600 : 500)};
  gap: 8px;
  padding: 6px 10px;
  white-space: nowrap;

  button {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    opacity: 0.6;
    padding: 0 2px;
  }

  button:hover {
    opacity: 1;
  }
`;

const StyledStageBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 16px;
`;

const StyledStepBtn = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active
      ? themeCssVariables.color.iris9
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.color.iris9
        : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
`;

const StyledWorkspaceGrid = styled.div<{ showInspector: boolean }>`
  display: grid;
  flex: 1;
  grid-template-columns: ${({ showInspector }) =>
    showInspector ? '270px 1fr 290px' : '270px 1fr'};
  min-height: 540px;

  @media (max-width: 1240px) {
    grid-template-columns: 240px 1fr;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const StyledLeftRail = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 14px;
`;

const StyledCenterStage = styled.main`
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 16px;
`;

const StyledRightInspector = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-left: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
`;

const StyledSectionCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 500;
  gap: 4px;

  input,
  select,
  textarea {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 13px;
    padding: 7px 9px;
  }

  textarea {
    min-height: 82px;
    resize: vertical;
  }
`;

const StyledMediaGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
`;

const StyledAssetTile = styled.div<{ selected?: boolean }>`
  background: ${themeCssVariables.background.secondary};
  border: 2px solid
    ${({ selected }) =>
      selected
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
  padding: 8px;

  img,
  video {
    aspect-ratio: 3 / 4;
    background: ${themeCssVariables.background.invertedPrimary};
    border-radius: 6px;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledChip = styled.button<{ active?: boolean }>`
  background: ${({ active }) =>
    active
      ? themeCssVariables.color.transparent.iris3
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ active }) =>
    active
      ? themeCssVariables.color.iris11
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 9px;
`;

const StyledStatusDot = styled.span<{ ok: boolean }>`
  background: ${({ ok }) =>
    ok ? themeCssVariables.color.green9 : themeCssVariables.color.amber9};
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  width: 8px;
`;

const ANGLE_SHORTCUTS: { label: string; angles: string[] }[] = [
  { label: 'Single Hero', angles: ['Front Full-Body'] },
  { label: '2-Angle', angles: ['Front Full-Body', 'Back Full-Body'] },
  {
    label: '4-Angle',
    angles: [
      'Front Full-Body',
      'Back Full-Body',
      'Left 3/4 Profile',
      'Garment Detail Close-Up',
    ],
  },
];

export const DeliveryAiStudioPage = () => {
  return (
    <DeliveryOperationalPage view="studio">
      <DeliveryAiStudioInner />
    </DeliveryOperationalPage>
  );
};

const DeliveryAiStudioInner = () => {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tabsState, setTabsState] = useState<StudioTabsState>(() =>
    loadStudioTabsState(),
  );
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [presetModalKind, setPresetModalKind] =
    useState<StudioPresetKind | null>(null);
  const [newAngleText, setNewAngleText] = useState('');
  const [newKitName, setNewKitName] = useState('');
  const [newKitNotes, setNewKitNotes] = useState('');
  const [uploadKitId, setUploadKitId] = useState<string | null>(null);
  const [uploadKitRole, setUploadKitRole] = useState('FRONT');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);

  // oxlint-disable-next-line twenty/no-state-useref -- Hidden native file input element trigger.
  const refVideoInputRef = useRef<HTMLInputElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Hidden native file input element trigger.
  const productImgInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () =>
      tabsState.tabs.find((t) => t.id === tabsState.activeTabId) ??
      tabsState.tabs[0],
    [tabsState],
  );

  // Persist tab bar across reloads
  useEffect(() => {
    saveStudioTabsState(tabsState);
  }, [tabsState]);

  // Handle deep links (?view=studio&companyId=...&projectId=...&stage=...)
  useEffect(() => {
    const deepCompanyId = searchParams.get('companyId');
    const deepProjectId = searchParams.get('projectId');
    const deepStage = searchParams.get('stage') as StudioStageKey | null;
    if (!deepCompanyId) return;

    setTabsState((prev) =>
      focusOrCreateClientTab(prev, {
        companyId: deepCompanyId,
        projectId: deepProjectId,
        ...(deepStage ? { stage: deepStage } : {}),
      }),
    );

    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete('companyId');
    cleaned.delete('projectId');
    cleaned.delete('stage');
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  const workspaceQuery = useQuery<{
    deliveryStudioWorkspace: StudioWorkspacePayload;
  }>(GET_DELIVERY_STUDIO_WORKSPACE, {
    variables: {
      companyId: activeTab.companyId,
      projectId: activeTab.projectId,
    },
    fetchPolicy: 'network-only',
  });

  const ws = workspaceQuery.data?.deliveryStudioWorkspace;
  const hasRunningJobs = Boolean(
    ws?.jobs?.some((j) =>
      ['QUEUED', 'STAGING', 'PROCESSING', 'DOWNLOADING'].includes(j.status),
    ),
  );

  useEffect(() => {
    if (!hasRunningJobs) return;
    const timer = window.setInterval(() => {
      void workspaceQuery.refetch();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [hasRunningJobs, workspaceQuery]);

  // Sync friendly tab labels once client/project list arrives
  useEffect(() => {
    if (!ws?.clients?.length) return;
    setTabsState((prev) => {
      let changed = false;
      const nextTabs = prev.tabs.map((tab) => {
        if (!tab.companyId) return tab;
        const computed = formatStudioTabLabel(
          ws.clients,
          tab.companyId,
          tab.projectId,
        );
        if (computed !== tab.label) {
          changed = true;
          return { ...tab, label: computed };
        }
        return tab;
      });
      return changed ? { ...prev, tabs: nextTabs } : prev;
    });
  }, [ws?.clients]);

  const updateActiveTab = useCallback(
    (patch: Partial<StudioTabDraft>) => {
      setTabsState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === prev.activeTabId ? { ...tab, ...patch } : tab,
        ),
      }));
    },
    [],
  );

  const [upsertProductKit, { loading: creatingKit }] = useMutation(
    UPSERT_DELIVERY_STUDIO_PRODUCT_KIT,
  );
  const [removeKitAsset] = useMutation(
    REMOVE_DELIVERY_STUDIO_PRODUCT_KIT_ASSET,
  );
  const [generateCharSheet, { loading: queueingChar }] = useMutation(
    GENERATE_DELIVERY_STUDIO_CHARACTER_SHEET,
  );
  const [generateVideo, { loading: queueingVideo }] = useMutation(
    GENERATE_DELIVERY_STUDIO_VIDEO,
  );
  const [batchGenerateVideos, { loading: queueingBatch }] = useMutation(
    BATCH_GENERATE_DELIVERY_STUDIO_VIDEOS,
  );
  const [setAssetApproved] = useMutation(SET_DELIVERY_STUDIO_ASSET_APPROVED);

  const notify = (tone: 'ok' | 'err', text: string) => {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 5000);
  };

  const clients = ws?.clients ?? [];
  const activeClient = clients.find((c) => c.id === activeTab.companyId);
  const catalog = ws?.catalog ?? [];
  const imageModels = catalog.filter((m) => m.kind === 'IMAGE');
  const videoModels = catalog.filter((m) => m.kind === 'VIDEO');
  const presets = ws?.presets ?? [];
  const charPresets = presets.filter((p) => p.kind === 'CHARACTER_SHEET');
  const videoPresets = presets.filter((p) => p.kind === 'VIDEO_GENERATION');
  const hookPresets = presets.filter((p) => p.kind === 'TEXT_HOOK');
  const productKits = ws?.productKits ?? [];
  const refVideos = ws?.referenceVideos ?? [];
  const characterSheets = ws?.characterSheets ?? [];
  const generatedVideos = ws?.generatedVideos ?? [];

  const keysHealthy = Boolean(
    ws?.providerConfig.wavespeedConfigured || ws?.providerConfig.kieConfigured,
  );

  const selectedImageModel = imageModels.find(
    (m) => m.key === activeTab.imageModelKey,
  );
  const selectedVideoModel = videoModels.find(
    (m) => m.key === activeTab.videoModelKey,
  );
  const compareVideoModel = videoModels.find(
    (m) => m.key === activeTab.compareModelKey,
  );

  const stageCostEstimateUsd = useMemo(() => {
    if (activeTab.stage === 'CHARACTER_SHEET') {
      const count =
        activeTab.characterAngleLayout === 'SEPARATE_FRAMES'
          ? Math.max(1, activeTab.characterAngles.length)
          : Math.max(1, activeTab.imageCandidateCount);
      return estimateModelCostUsd(selectedImageModel, {
        resolution: activeTab.imageResolution,
        count,
      });
    }
    if (activeTab.stage === 'VIDEO_GENERATION') {
      const primary = estimateModelCostUsd(selectedVideoModel, {
        resolution: activeTab.videoResolution,
        durationSec: activeTab.videoDurationSec,
      });
      const secondary = activeTab.compareMode
        ? estimateModelCostUsd(compareVideoModel, {
            resolution: activeTab.videoResolution,
            durationSec: activeTab.videoDurationSec,
          })
        : 0;
      return primary + secondary;
    }
    if (activeTab.stage === 'BATCH_MATRIX') {
      return estimateModelCostUsd(selectedVideoModel, {
        resolution: activeTab.videoResolution,
        durationSec: activeTab.videoDurationSec,
        count: Math.max(1, activeTab.batchRows.length),
      });
    }
    return 0;
  }, [activeTab, selectedImageModel, selectedVideoModel, compareVideoModel]);

  const handleSelectClient = (companyId: string) => {
    const cleanCompany = companyId || null;
    const client = clients.find((c) => c.id === cleanCompany);
    const defaultProject = client?.projects[0]?.id ?? null;
    updateActiveTab({
      companyId: cleanCompany,
      projectId: defaultProject,
      label: formatStudioTabLabel(clients, cleanCompany, defaultProject),
      selectedProductKitId: null,
      selectedCharacterAssetId: null,
      selectedVideoAssetId: null,
    });
  };

  const handleSelectProject = (projectId: string) => {
    const cleanProject = projectId || null;
    updateActiveTab({
      projectId: cleanProject,
      label: formatStudioTabLabel(clients, activeTab.companyId, cleanProject),
    });
  };

  const handleCreateProductKit = async () => {
    if (!activeTab.companyId) {
      notify('err', 'Select a client in this tab first.');
      return;
    }
    if (!newKitName.trim()) return;
    try {
      const res = await upsertProductKit({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            name: newKitName.trim(),
            notes: newKitNotes.trim(),
          },
        },
      });
      const created = (res.data as { upsertDeliveryStudioProductKit?: { id: string } })
        ?.upsertDeliveryStudioProductKit;
      setNewKitName('');
      setNewKitNotes('');
      if (created?.id) {
        updateActiveTab({ selectedProductKitId: created.id });
      }
      await workspaceQuery.refetch();
      notify('ok', 'Product kit created. Upload garment/product photos next!');
    } catch (err) {
      notify(
        'err',
        err instanceof Error ? err.message : 'Could not create product kit.',
      );
    }
  };

  const handleUploadRefVideo = async (file: File) => {
    try {
      setUploadPercent(5);
      const fd = new FormData();
      fd.append('file', file);
      if (activeTab.companyId) fd.append('companyId', activeTab.companyId);
      if (activeTab.projectId) fd.append('projectId', activeTab.projectId);
      fd.append('title', file.name.replace(/\.[^.]+$/, ''));

      const created = await uploadStudioMultipart<{ id: string }>({
        store,
        endpointPath: '/portal/delivery-studio/reference-videos/upload',
        formData: fd,
        onProgress: setUploadPercent,
      });
      setUploadPercent(null);
      if (created?.id) {
        updateActiveTab({ selectedReferenceVideoId: created.id });
      }
      await workspaceQuery.refetch();
      notify('ok', `Uploaded reference video "${file.name}".`);
    } catch (err) {
      setUploadPercent(null);
      notify('err', err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleUploadProductPhoto = async (file: File) => {
    if (!uploadKitId) return;
    try {
      setUploadPercent(5);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('role', uploadKitRole);
      fd.append('label', uploadKitRole);
      await uploadStudioMultipart({
        store,
        endpointPath: `/portal/delivery-studio/product-kits/${uploadKitId}/assets/upload`,
        formData: fd,
        onProgress: setUploadPercent,
      });
      setUploadPercent(null);
      await workspaceQuery.refetch();
      notify('ok', `Added ${uploadKitRole} photo to product kit.`);
    } catch (err) {
      setUploadPercent(null);
      notify('err', err instanceof Error ? err.message : 'Photo upload failed.');
    }
  };

  const handleRunCharacterSheet = async () => {
    if (!activeTab.companyId) {
      notify('err', 'Choose a client in the left rail first.');
      return;
    }
    if (!keysHealthy) {
      setProviderModalOpen(true);
      notify('err', 'Add a WaveSpeedAI or Kie.ai API key first.');
      return;
    }
    try {
      await generateCharSheet({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            productKitId: activeTab.selectedProductKitId,
            presetId: activeTab.characterPresetId,
            modelKey: activeTab.imageModelKey,
            routingMode: activeTab.routingMode,
            masterPrompt: activeTab.characterMasterPrompt.trim() || undefined,
            angles: activeTab.characterAngles,
            angleLayout: activeTab.characterAngleLayout,
            talentDescription: activeTab.characterTalent.trim() || undefined,
            environmentOverride:
              activeTab.characterEnvironment.trim() || undefined,
            customNotes: activeTab.characterCustomNotes.trim() || undefined,
            aspectRatio: activeTab.imageAspectRatio,
            resolution: activeTab.imageResolution,
            candidateCount: activeTab.imageCandidateCount,
          },
        },
      });
      await workspaceQuery.refetch();
      notify('ok', 'Character sheet queued! Watch progress in the Global Queue below.');
    } catch (err) {
      notify(
        'err',
        err instanceof Error ? err.message : 'Failed to queue character sheet.',
      );
    }
  };

  const handleRunVideo = async () => {
    if (!activeTab.companyId) {
      notify('err', 'Choose a client in the left rail first.');
      return;
    }
    if (!activeTab.selectedReferenceVideoId) {
      notify('err', 'Select or upload a Reference Video in the left rail.');
      return;
    }
    if (!keysHealthy) {
      setProviderModalOpen(true);
      notify('err', 'Add a WaveSpeedAI or Kie.ai API key first.');
      return;
    }
    const modelKeys = activeTab.compareMode
      ? Array.from(new Set([activeTab.videoModelKey, activeTab.compareModelKey]))
      : [activeTab.videoModelKey];
    try {
      await generateVideo({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            referenceVideoId: activeTab.selectedReferenceVideoId,
            characterAssetId: activeTab.selectedCharacterAssetId,
            productKitId: activeTab.selectedProductKitId,
            presetId: activeTab.videoPresetId,
            modelKeys,
            routingMode: activeTab.routingMode,
            masterPrompt: activeTab.videoMasterPrompt.trim() || undefined,
            environmentOverride:
              activeTab.videoEnvironmentOverride.trim() || undefined,
            customNotes: activeTab.videoCustomNotes.trim() || undefined,
            aspectRatio: activeTab.videoAspectRatio,
            resolution: activeTab.videoResolution,
            durationSec: activeTab.videoDurationSec,
            generateAudio: activeTab.generateAudio,
          },
        },
      });
      await workspaceQuery.refetch();
      notify(
        'ok',
        modelKeys.length > 1
          ? `Compare Mode queued (${modelKeys.join(' vs ')})!`
          : 'AI Video queued with WaveSpeed → Kie.ai failover!',
      );
    } catch (err) {
      notify(
        'err',
        err instanceof Error ? err.message : 'Failed to queue AI video.',
      );
    }
  };

  const handleRunBatch = async () => {
    if (!activeTab.companyId || activeTab.batchRows.length === 0) {
      notify('err', 'Add at least one batch row first.');
      return;
    }
    const validRows = activeTab.batchRows.filter((r) => r.referenceVideoId);
    if (validRows.length === 0) {
      notify('err', 'Each batch row needs a Reference Video.');
      return;
    }
    try {
      await batchGenerateVideos({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            modelKey: activeTab.videoModelKey,
            routingMode: activeTab.routingMode,
            presetId: activeTab.videoPresetId,
            masterPrompt: activeTab.videoMasterPrompt.trim() || undefined,
            aspectRatio: activeTab.videoAspectRatio,
            resolution: activeTab.videoResolution,
            durationSec: activeTab.videoDurationSec,
            generateAudio: activeTab.generateAudio,
            items: validRows.map((row) => ({
              title: row.title || undefined,
              referenceVideoId: row.referenceVideoId,
              characterAssetId: row.characterAssetId || null,
              productKitId: row.productKitId || null,
              environmentOverride: row.environmentOverride || undefined,
            })),
          },
        },
      });
      await workspaceQuery.refetch();
      notify('ok', `Queued batch of ${validRows.length} AI videos!`);
    } catch (err) {
      notify(
        'err',
        err instanceof Error ? err.message : 'Failed to queue batch.',
      );
    }
  };

  const handleToggleApprove = async (assetId: string, approved: boolean) => {
    await setAssetApproved({ variables: { assetId, approved } });
    if (approved) {
      updateActiveTab({ selectedCharacterAssetId: assetId });
    }
    await workspaceQuery.refetch();
  };

  return (
    <StyledShell>
      {/* Hidden native file inputs */}
      <input
        ref={refVideoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUploadRefVideo(f);
          e.target.value = '';
        }}
      />
      <input
        ref={productImgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUploadProductPhoto(f);
          e.target.value = '';
        }}
      />

      {/* 1. Chrome/Figma-style Persistent Multi-Client Tab Bar */}
      <StyledTabStrip>
        <StyledTabList>
          {tabsState.tabs.map((tab) => (
            <StyledTabPill
              key={tab.id}
              active={tab.id === tabsState.activeTabId}
              onClick={() =>
                setTabsState((prev) => ({ ...prev, activeTabId: tab.id }))
              }
            >
              <span>{tab.label}</span>
              <button
                type="button"
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  setTabsState((prev) => closeStudioTab(prev, tab.id));
                }}
              >
                ×
              </button>
            </StyledTabPill>
          ))}
          <StyledDeliveryButton
            type="button"
            onClick={() =>
              setTabsState((prev) => {
                const next = createEmptyStudioTab();
                return { activeTabId: next.id, tabs: [...prev.tabs, next] };
              })
            }
          >
            + Tab
          </StyledDeliveryButton>
        </StyledTabList>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StyledDeliveryButton
            type="button"
            onClick={() => setPresetModalKind('CHARACTER_SHEET')}
          >
            ✦ Master Prompts
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            onClick={() => setProviderModalOpen(true)}
          >
            <StyledStatusDot ok={keysHealthy} /> Providers &amp; Keys
          </StyledDeliveryButton>
        </div>
      </StyledTabStrip>

      {/* 2. Simple 4-Step Pipeline Navigation */}
      <StyledStageBar>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['CHARACTER_SHEET', '1. Character Sheet'],
              ['VIDEO_GENERATION', '2. AI Video'],
              ['BATCH_MATRIX', '3. Batch Matrix'],
              ['TEXT_HOOKS', '4. Text Hooks & Drive'],
            ] as [StudioStageKey, string][]
          ).map(([key, label]) => (
            <StyledStepBtn
              key={key}
              type="button"
              active={activeTab.stage === key}
              onClick={() => updateActiveTab({ stage: key })}
            >
              {label}
            </StyledStepBtn>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
          {uploadPercent !== null && (
            <span
              style={{
                color: themeCssVariables.color.iris11,
                fontWeight: 600,
              }}
            >
              Uploading… {uploadPercent}%
            </span>
          )}
          {toast && (
            <span
              style={{
                color:
                  toast.tone === 'ok'
                    ? themeCssVariables.color.green11
                    : themeCssVariables.color.red11,
                fontWeight: 600,
              }}
            >
              {toast.text}
            </span>
          )}
        </div>
      </StyledStageBar>

      {/* 3. Main 3-Pane Studio Workspace */}
      <StyledWorkspaceGrid showInspector={activeTab.stage !== 'TEXT_HOOKS'}>
        {/* LEFT ASSET RAIL */}
        <StyledLeftRail>
          <StyledSectionCard>
            <strong style={{ fontSize: 12 }}>Active Tab Scope</strong>
            <StyledField>
              Client
              <select
                value={activeTab.companyId ?? ''}
                onChange={(e) => handleSelectClient(e.target.value)}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </StyledField>
            {activeClient && activeClient.projects.length > 0 && (
              <StyledField>
                Brand / Project
                <select
                  value={activeTab.projectId ?? ''}
                  onChange={(e) => handleSelectProject(e.target.value)}
                >
                  <option value="">All Projects</option>
                  {activeClient.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </StyledField>
            )}
          </StyledSectionCard>

          {/* Product Kits */}
          <StyledSectionCard>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <strong style={{ fontSize: 12 }}>
                Product Kits ({productKits.length})
              </strong>
            </div>

            {productKits.map((kit) => {
              const selected = activeTab.selectedProductKitId === kit.id;
              return (
                <div
                  key={kit.id}
                  onClick={() =>
                    updateActiveTab({ selectedProductKitId: kit.id })
                  }
                  style={{
                    border: selected
                      ? `2px solid ${themeCssVariables.color.blue}`
                      : `1px solid ${themeCssVariables.border.color.medium}`,
                    borderRadius: 8,
                    padding: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <strong>{kit.name}</strong>
                    <span style={{ opacity: 0.65 }}>
                      {kit.assets.length} img
                    </span>
                  </div>
                  {kit.assets.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {kit.assets.map((asset) => (
                        <div key={asset.id} style={{ position: 'relative' }}>
                          <img
                            src={studioMediaUrl(asset.imagePath)}
                            alt={asset.label}
                            style={{
                              width: 42,
                              height: 42,
                              objectFit: 'cover',
                              borderRadius: 4,
                            }}
                          />
                          <button
                            type="button"
                            title="Remove photo"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeKitAsset({
                                variables: {
                                  productKitId: kit.id,
                                  assetId: asset.id,
                                },
                              }).then(() => workspaceQuery.refetch());
                            }}
                            style={{
                              position: 'absolute',
                              top: -4,
                              right: -4,
                              width: 16,
                              height: 16,
                              borderRadius: 99,
                              border: 'none',
                              background:
                                themeCssVariables.background.invertedPrimary,
                              color: themeCssVariables.font.color.inverted,
                              fontSize: 10,
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      value={uploadKitRole}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setUploadKitRole(e.target.value)}
                      style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
                    >
                      <option value="FRONT">Front</option>
                      <option value="BACK">Back</option>
                      <option value="DETAIL">Detail</option>
                      <option value="PACKAGING">Packaging</option>
                    </select>
                    <StyledDeliveryButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadKitId(kit.id);
                        productImgInputRef.current?.click();
                      }}
                    >
                      + Photo
                    </StyledDeliveryButton>
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <input
                style={{ fontSize: 12, padding: '6px 8px' }}
                placeholder="New product kit (e.g. Hokuro Jacket)"
                value={newKitName}
                onChange={(e) => setNewKitName(e.target.value)}
              />
              <input
                style={{ fontSize: 12, padding: '6px 8px' }}
                placeholder="Fabric / fit / logo notes (optional)"
                value={newKitNotes}
                onChange={(e) => setNewKitNotes(e.target.value)}
              />
              <StyledDeliveryButton
                type="button"
                disabled={creatingKit || !newKitName.trim()}
                onClick={() => void handleCreateProductKit()}
              >
                + Create Product Kit
              </StyledDeliveryButton>
            </div>
          </StyledSectionCard>

          {/* Reference Videos */}
          <StyledSectionCard>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <strong style={{ fontSize: 12 }}>
                Reference Videos ({refVideos.length})
              </strong>
              <StyledDeliveryButton
                type="button"
                onClick={() => refVideoInputRef.current?.click()}
              >
                + Upload
              </StyledDeliveryButton>
            </div>
            {refVideos.length === 0 && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Upload winning reference reels (MP4/MOV/WebM) to transfer camera
                movement &amp; motion.
              </span>
            )}
            {refVideos.slice(0, 12).map((rv) => {
              const selected = activeTab.selectedReferenceVideoId === rv.id;
              return (
                <div
                  key={rv.id}
                  onClick={() =>
                    updateActiveTab({ selectedReferenceVideoId: rv.id })
                  }
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: 6,
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: selected
                      ? `2px solid ${themeCssVariables.color.blue}`
                      : `1px solid ${themeCssVariables.border.color.medium}`,
                  }}
                >
                  {rv.thumbnailPath ? (
                    <img
                      src={studioMediaUrl(rv.thumbnailPath)}
                      alt={rv.title}
                      style={{
                        width: 36,
                        height: 48,
                        objectFit: 'cover',
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 36,
                        height: 48,
                        borderRadius: 4,
                        background: themeCssVariables.background.tertiary,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rv.title}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>
                      {rv.mediaMeta?.durationSec
                        ? `${rv.mediaMeta.durationSec.toFixed(1)}s`
                        : 'Video'}
                    </div>
                  </div>
                </div>
              );
            })}
          </StyledSectionCard>
        </StyledLeftRail>

        {/* CENTER CREATIVE STAGE */}
        <StyledCenterStage>
          {activeTab.stage === 'CHARACTER_SHEET' && (
            <>
              <StyledSectionCard>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <strong>Step 1 · Dynamic Character Sheet Studio</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Make 2-angle, 4-angle, single-hero, or custom layouts using
                      your saved Master Prompt presets.
                    </div>
                  </div>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setPresetModalKind('CHARACTER_SHEET')}
                  >
                    + Edit / Save Presets
                  </StyledDeliveryButton>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StyledField style={{ flex: 1, minWidth: 200 }}>
                    Master Prompt Preset
                    <select
                      value={activeTab.characterPresetId ?? ''}
                      onChange={(e) => {
                        const found = charPresets.find(
                          (p) => p.id === e.target.value,
                        );
                        updateActiveTab({
                          characterPresetId: e.target.value || null,
                          ...(found
                            ? {
                                characterMasterPrompt: found.masterPrompt,
                                characterAngles:
                                  found.configJson?.angles ??
                                  activeTab.characterAngles,
                                characterAngleLayout:
                                  found.configJson?.angleLayout ?? 'GRID_SHEET',
                              }
                            : {}),
                        });
                      }}
                    >
                      <option value="">Default / Custom</option>
                      {charPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </StyledField>

                  <StyledField style={{ flex: 1, minWidth: 180 }}>
                    Layout Mode
                    <select
                      value={activeTab.characterAngleLayout}
                      onChange={(e) =>
                        updateActiveTab({
                          characterAngleLayout: e.target.value as
                            | 'GRID_SHEET'
                            | 'SEPARATE_FRAMES'
                            | 'SINGLE_HERO',
                        })
                      }
                    >
                      <option value="GRID_SHEET">
                        Combined Multi-Angle Sheet (1 image)
                      </option>
                      <option value="SEPARATE_FRAMES">
                        Separate Frame per Angle (N images)
                      </option>
                      <option value="SINGLE_HERO">Single Hero Frame</option>
                    </select>
                  </StyledField>
                </div>

                {/* Dynamic Angles Picker */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                      Angles ({activeTab.characterAngles.length})
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {ANGLE_SHORTCUTS.map((sc) => (
                        <StyledChip
                          key={sc.label}
                          type="button"
                          onClick={() =>
                            updateActiveTab({ characterAngles: sc.angles })
                          }
                        >
                          {sc.label}
                        </StyledChip>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {activeTab.characterAngles.map((ang, i) => (
                      <StyledChip
                        key={`${ang}-${i}`}
                        type="button"
                        active
                        onClick={() =>
                          activeTab.characterAngles.length > 1 &&
                          updateActiveTab({
                            characterAngles: activeTab.characterAngles.filter(
                              (_, idx) => idx !== i,
                            ),
                          })
                        }
                      >
                        {ang} ×
                      </StyledChip>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      style={{ flex: 1, padding: '6px 9px', fontSize: 12 }}
                      placeholder="Add any custom angle (e.g. Overhead Detail, Side Profile...)"
                      value={newAngleText}
                      onChange={(e) => setNewAngleText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAngleText.trim()) {
                          e.preventDefault();
                          updateActiveTab({
                            characterAngles: [
                              ...activeTab.characterAngles,
                              newAngleText.trim(),
                            ],
                          });
                          setNewAngleText('');
                        }
                      }}
                    />
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        if (!newAngleText.trim()) return;
                        updateActiveTab({
                          characterAngles: [
                            ...activeTab.characterAngles,
                            newAngleText.trim(),
                          ],
                        });
                        setNewAngleText('');
                      }}
                    >
                      + Angle
                    </StyledDeliveryButton>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StyledField style={{ flex: 1, minWidth: 200 }}>
                    Talent / Model Description
                    <input
                      placeholder="e.g. Editorial Japanese male model, 24, relaxed streetwear posture"
                      value={activeTab.characterTalent}
                      onChange={(e) =>
                        updateActiveTab({ characterTalent: e.target.value })
                      }
                    />
                  </StyledField>
                  <StyledField style={{ flex: 1, minWidth: 200 }}>
                    Studio / Background Direction
                    <input
                      placeholder="e.g. Clean neutral warm-grey cyclorama, soft diffused lighting"
                      value={activeTab.characterEnvironment}
                      onChange={(e) =>
                        updateActiveTab({
                          characterEnvironment: e.target.value,
                        })
                      }
                    />
                  </StyledField>
                </div>

                <StyledField>
                  Master Prompt Override (optional — leave blank to use preset)
                  <textarea
                    placeholder="Customize prompt or use {{product_name}}, {{angles}}, {{talent}}, {{brand_notes}}..."
                    value={activeTab.characterMasterPrompt}
                    onChange={(e) =>
                      updateActiveTab({ characterMasterPrompt: e.target.value })
                    }
                  />
                </StyledField>
              </StyledSectionCard>

              {/* Character Sheets Gallery */}
              <StyledSectionCard>
                <strong>
                  Generated Character Sheets ({characterSheets.length})
                </strong>
                {characterSheets.length === 0 ? (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Your generated character sheets will appear here. Click
                    &ldquo;Approve &amp; Lock&rdquo; to carry one straight into
                    AI Video generation.
                  </span>
                ) : (
                  <StyledMediaGrid>
                    {characterSheets.map((sheet) => (
                      <StyledAssetTile
                        key={sheet.id}
                        selected={
                          activeTab.selectedCharacterAssetId === sheet.id
                        }
                        onClick={() =>
                          updateActiveTab({
                            selectedCharacterAssetId: sheet.id,
                          })
                        }
                      >
                        <img
                          src={studioMediaUrl(sheet.mediaPath)}
                          alt={sheet.title}
                        />
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {sheet.title}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {sheet.modelKey} · {sheet.providerUsed}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <StyledDeliveryButton
                            type="button"
                            data-primary={sheet.approved ? 'true' : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleApprove(
                                sheet.id,
                                !sheet.approved,
                              );
                            }}
                          >
                            {sheet.approved ? '✓ Locked' : 'Approve'}
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateActiveTab({
                                selectedCharacterAssetId: sheet.id,
                                stage: 'VIDEO_GENERATION',
                              });
                            }}
                          >
                            Use in Video →
                          </StyledDeliveryButton>
                        </div>
                      </StyledAssetTile>
                    ))}
                  </StyledMediaGrid>
                )}
              </StyledSectionCard>
            </>
          )}

          {activeTab.stage === 'VIDEO_GENERATION' && (
            <>
              <StyledSectionCard>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <strong>Step 2 · AI Video Production &amp; Compare Mode</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Combine your Reference Video + Locked Character Sheet. Keep
                      the original scene or swap the environment dynamically.
                    </div>
                  </div>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setPresetModalKind('VIDEO_GENERATION')}
                  >
                    + Video Presets
                  </StyledDeliveryButton>
                </div>

                {/* Locked Inputs Summary */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StyledField style={{ flex: 1, minWidth: 200 }}>
                    Locked Character Sheet (@Image 1)
                    <select
                      value={activeTab.selectedCharacterAssetId ?? ''}
                      onChange={(e) =>
                        updateActiveTab({
                          selectedCharacterAssetId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">None (Use Product Kit only)</option>
                      {characterSheets.map((cs) => (
                        <option key={cs.id} value={cs.id}>
                          {cs.approved ? '★ ' : ''}
                          {cs.title} ({cs.modelKey})
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  <StyledField style={{ flex: 1, minWidth: 200 }}>
                    Video Master Prompt Preset
                    <select
                      value={activeTab.videoPresetId ?? ''}
                      onChange={(e) => {
                        const found = videoPresets.find(
                          (p) => p.id === e.target.value,
                        );
                        updateActiveTab({
                          videoPresetId: e.target.value || null,
                          ...(found
                            ? { videoMasterPrompt: found.masterPrompt }
                            : {}),
                        });
                      }}
                    >
                      <option value="">Auto (Match Reference / Override)</option>
                      {videoPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </StyledField>
                </div>

                <StyledField>
                  Environment Override (leave blank to match Reference Video
                  environment)
                  <input
                    placeholder="e.g. Rainy neon Tokyo street at night, or sunlit minimalist loft..."
                    value={activeTab.videoEnvironmentOverride}
                    onChange={(e) =>
                      updateActiveTab({
                        videoEnvironmentOverride: e.target.value,
                      })
                    }
                  />
                </StyledField>

                <StyledField>
                  Director Prompt Override (optional)
                  <textarea
                    placeholder="Fine-tune camera energy, pacing, or garment focus..."
                    value={activeTab.videoMasterPrompt}
                    onChange={(e) =>
                      updateActiveTab({ videoMasterPrompt: e.target.value })
                    }
                  />
                </StyledField>
              </StyledSectionCard>

              {/* Generated Videos Gallery */}
              <StyledSectionCard>
                <strong>
                  Generated AI Videos ({generatedVideos.length})
                </strong>
                {generatedVideos.length === 0 ? (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Completed AI videos appear here ready to preview and send
                    directly to Step 4 (AI Text Hooks &amp; Google Drive).
                  </span>
                ) : (
                  <StyledMediaGrid>
                    {generatedVideos.map((vid) => (
                      <StyledAssetTile
                        key={vid.id}
                        selected={activeTab.selectedVideoAssetId === vid.id}
                        onClick={() =>
                          updateActiveTab({ selectedVideoAssetId: vid.id })
                        }
                      >
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={studioMediaUrl(vid.mediaPath)}
                        />
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {vid.title}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {vid.modelKey} · via {vid.providerUsed}
                        </div>
                        <StyledDeliveryButton
                          type="button"
                          data-primary="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateActiveTab({
                              selectedVideoAssetId: vid.id,
                              stage: 'TEXT_HOOKS',
                            });
                          }}
                        >
                          ✦ Text Hooks &amp; Drive →
                        </StyledDeliveryButton>
                      </StyledAssetTile>
                    ))}
                  </StyledMediaGrid>
                )}
              </StyledSectionCard>
            </>
          )}

          {activeTab.stage === 'BATCH_MATRIX' && (
            <StyledSectionCard>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <strong>Step 3 · High-Volume Batch Video Matrix</strong>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Queue up to 60 videos in parallel with automatic WaveSpeed →
                    Kie.ai failover.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => {
                      const rowId = `row-${Date.now().toString(36)}`;
                      updateActiveTab({
                        batchRows: [
                          ...activeTab.batchRows,
                          {
                            id: rowId,
                            title: `Batch Video ${activeTab.batchRows.length + 1}`,
                            referenceVideoId:
                              activeTab.selectedReferenceVideoId ??
                              refVideos[0]?.id ??
                              '',
                            characterAssetId:
                              activeTab.selectedCharacterAssetId ?? '',
                            productKitId: activeTab.selectedProductKitId ?? '',
                            environmentOverride: '',
                          },
                        ],
                      });
                    }}
                  >
                    + Add Row
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => {
                      const approved = characterSheets.filter((c) => c.approved);
                      const source =
                        approved.length > 0 ? approved : characterSheets;
                      const refId =
                        activeTab.selectedReferenceVideoId ??
                        refVideos[0]?.id ??
                        '';
                      updateActiveTab({
                        batchRows: source.map((cs, idx) => ({
                          id: `auto-${cs.id}-${idx}`,
                          title: `${cs.title} Batch`,
                          referenceVideoId: refId,
                          characterAssetId: cs.id,
                          productKitId: cs.productKitId ?? '',
                          environmentOverride: '',
                        })),
                      });
                    }}
                  >
                    Auto-Fill from Character Sheets
                  </StyledDeliveryButton>
                </div>
              </div>

              {activeTab.batchRows.length === 0 ? (
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Click &ldquo;+ Add Row&rdquo; or &ldquo;Auto-Fill from
                  Character Sheets&rdquo; to build your batch run.
                </span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeTab.batchRows.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1fr 1fr 1.2fr auto',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <input
                        style={{ fontSize: 12, padding: '6px 8px' }}
                        value={row.title}
                        placeholder="Title"
                        onChange={(e) =>
                          updateActiveTab({
                            batchRows: activeTab.batchRows.map((r) =>
                              r.id === row.id
                                ? { ...r, title: e.target.value }
                                : r,
                            ),
                          })
                        }
                      />
                      <select
                        style={{ fontSize: 12, padding: '6px 8px' }}
                        value={row.referenceVideoId}
                        onChange={(e) =>
                          updateActiveTab({
                            batchRows: activeTab.batchRows.map((r) =>
                              r.id === row.id
                                ? { ...r, referenceVideoId: e.target.value }
                                : r,
                            ),
                          })
                        }
                      >
                        <option value="">Ref Video…</option>
                        {refVideos.map((rv) => (
                          <option key={rv.id} value={rv.id}>
                            {rv.title}
                          </option>
                        ))}
                      </select>
                      <select
                        style={{ fontSize: 12, padding: '6px 8px' }}
                        value={row.characterAssetId}
                        onChange={(e) =>
                          updateActiveTab({
                            batchRows: activeTab.batchRows.map((r) =>
                              r.id === row.id
                                ? { ...r, characterAssetId: e.target.value }
                                : r,
                            ),
                          })
                        }
                      >
                        <option value="">Character Sheet…</option>
                        {characterSheets.map((cs) => (
                          <option key={cs.id} value={cs.id}>
                            {cs.title}
                          </option>
                        ))}
                      </select>
                      <input
                        style={{ fontSize: 12, padding: '6px 8px' }}
                        value={row.environmentOverride}
                        placeholder="Environment override (optional)"
                        onChange={(e) =>
                          updateActiveTab({
                            batchRows: activeTab.batchRows.map((r) =>
                              r.id === row.id
                                ? { ...r, environmentOverride: e.target.value }
                                : r,
                            ),
                          })
                        }
                      />
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          updateActiveTab({
                            batchRows: activeTab.batchRows.filter(
                              (r) => r.id !== row.id,
                            ),
                          })
                        }
                      >
                        ×
                      </StyledDeliveryButton>
                    </div>
                  ))}
                </div>
              )}
            </StyledSectionCard>
          )}

          {activeTab.stage === 'TEXT_HOOKS' && (
            <DeliveryStudioHooksStage
              generatedVideos={generatedVideos}
              selectedVideoAssetId={activeTab.selectedVideoAssetId}
              hookPresets={hookPresets}
              onSelectVideo={(id) =>
                updateActiveTab({ selectedVideoAssetId: id })
              }
              onOpenPresetModal={() => setPresetModalKind('TEXT_HOOK')}
              onWorkspaceRefresh={() => void workspaceQuery.refetch()}
            />
          )}
        </StyledCenterStage>

        {/* RIGHT SETTINGS & RUN INSPECTOR */}
        {activeTab.stage !== 'TEXT_HOOKS' && (
          <StyledRightInspector>
            <StyledSectionCard>
              <strong style={{ fontSize: 12 }}>Model &amp; Failover</strong>

              {activeTab.stage === 'CHARACTER_SHEET' ? (
                <>
                  <StyledField>
                    Image Model
                    <select
                      value={activeTab.imageModelKey}
                      onChange={(e) => {
                        const m = imageModels.find(
                          (item) => item.key === e.target.value,
                        );
                        updateActiveTab({
                          imageModelKey: e.target.value,
                          ...(m
                            ? { imageResolution: m.capabilities.defaultResolution }
                            : {}),
                        });
                      }}
                    >
                      {imageModels.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.vendor})
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  {selectedImageModel && (
                    <span style={{ fontSize: 11, opacity: 0.72 }}>
                      {selectedImageModel.summary}
                    </span>
                  )}
                  <StyledField>
                    Resolution
                    <select
                      value={activeTab.imageResolution}
                      onChange={(e) =>
                        updateActiveTab({ imageResolution: e.target.value })
                      }
                    >
                      {(
                        selectedImageModel?.capabilities.supportsResolutions ?? [
                          '1K',
                          '2K',
                          '4K',
                        ]
                      ).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  <StyledField>
                    Aspect Ratio
                    <select
                      value={activeTab.imageAspectRatio}
                      onChange={(e) =>
                        updateActiveTab({ imageAspectRatio: e.target.value })
                      }
                    >
                      {(
                        selectedImageModel?.capabilities.supportsAspectRatios ?? [
                          '3:4',
                          '9:16',
                          '1:1',
                          '4:5',
                        ]
                      ).map((ar) => (
                        <option key={ar} value={ar}>
                          {ar}
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  {activeTab.characterAngleLayout !== 'SEPARATE_FRAMES' && (
                    <StyledField>
                      Takes / Candidates
                      <select
                        value={activeTab.imageCandidateCount}
                        onChange={(e) =>
                          updateActiveTab({
                            imageCandidateCount: Number(e.target.value) || 1,
                          })
                        }
                      >
                        <option value={1}>1 Take</option>
                        <option value={2}>2 Takes</option>
                        <option value={3}>3 Takes</option>
                        <option value={4}>4 Takes</option>
                      </select>
                    </StyledField>
                  )}
                </>
              ) : (
                <>
                  <StyledField>
                    Video Model
                    <select
                      value={activeTab.videoModelKey}
                      onChange={(e) => {
                        const m = videoModels.find(
                          (item) => item.key === e.target.value,
                        );
                        updateActiveTab({
                          videoModelKey: e.target.value,
                          ...(m
                            ? { videoResolution: m.capabilities.defaultResolution }
                            : {}),
                        });
                      }}
                    >
                      {videoModels.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.vendor})
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  {selectedVideoModel && (
                    <span style={{ fontSize: 11, opacity: 0.72 }}>
                      {selectedVideoModel.summary}
                    </span>
                  )}

                  {activeTab.stage === 'VIDEO_GENERATION' && (
                    <>
                      <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={activeTab.compareMode}
                          onChange={(e) =>
                            updateActiveTab({ compareMode: e.target.checked })
                          }
                        />
                        Compare Mode (run 2 models side-by-side)
                      </label>
                      {activeTab.compareMode && (
                        <StyledField>
                          Compare Against
                          <select
                            value={activeTab.compareModelKey}
                            onChange={(e) =>
                              updateActiveTab({
                                compareModelKey: e.target.value,
                              })
                            }
                          >
                            {videoModels.map((m) => (
                              <option key={m.key} value={m.key}>
                                {m.label} ({m.vendor})
                              </option>
                            ))}
                          </select>
                        </StyledField>
                      )}
                    </>
                  )}

                  <StyledField>
                    Resolution
                    <select
                      value={activeTab.videoResolution}
                      onChange={(e) =>
                        updateActiveTab({ videoResolution: e.target.value })
                      }
                    >
                      {(
                        selectedVideoModel?.capabilities.supportsResolutions ?? [
                          '480p',
                          '720p',
                          '1080p',
                        ]
                      ).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  <StyledField>
                    Aspect Ratio
                    <select
                      value={activeTab.videoAspectRatio}
                      onChange={(e) =>
                        updateActiveTab({ videoAspectRatio: e.target.value })
                      }
                    >
                      <option value="9:16">9:16 (Reels / TikTok)</option>
                      <option value="4:5">4:5 (Feed)</option>
                      <option value="1:1">1:1 (Square)</option>
                      <option value="16:9">16:9 (Landscape)</option>
                    </select>
                  </StyledField>
                  <StyledField>
                    Duration (seconds)
                    <input
                      type="number"
                      min={4}
                      max={30}
                      value={activeTab.videoDurationSec}
                      onChange={(e) =>
                        updateActiveTab({
                          videoDurationSec: Math.max(
                            4,
                            Math.min(30, Number(e.target.value) || 8),
                          ),
                        })
                      }
                    />
                  </StyledField>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={activeTab.generateAudio}
                      onChange={(e) =>
                        updateActiveTab({ generateAudio: e.target.checked })
                      }
                    />
                    Generate synchronized audio
                  </label>
                </>
              )}

              <StyledField>
                Provider Failover Routing
                <select
                  value={activeTab.routingMode}
                  onChange={(e) =>
                    updateActiveTab({
                      routingMode: e.target.value as StudioRoutingMode,
                    })
                  }
                >
                  <option value="AUTO_FAILOVER">
                    Auto Failover (WaveSpeed → Kie.ai)
                  </option>
                  <option value="WAVESPEED_ONLY">WaveSpeedAI Only</option>
                  <option value="KIE_ONLY">Kie.ai Only</option>
                </select>
              </StyledField>
            </StyledSectionCard>

            {/* Cost Estimator + Primary Run CTA */}
            <StyledSectionCard>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.75 }}>
                  Estimated Cost
                </span>
                <strong style={{ fontSize: 16 }}>
                  {formatUsdEstimate(stageCostEstimateUsd)}
                </strong>
              </div>

              {activeTab.stage === 'CHARACTER_SHEET' && (
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  disabled={queueingChar}
                  onClick={() => void handleRunCharacterSheet()}
                >
                  {queueingChar
                    ? 'Queueing…'
                    : '✦ Generate Character Sheet'}
                </StyledDeliveryButton>
              )}

              {activeTab.stage === 'VIDEO_GENERATION' && (
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  disabled={queueingVideo}
                  onClick={() => void handleRunVideo()}
                >
                  {queueingVideo
                    ? 'Queueing…'
                    : activeTab.compareMode
                      ? '✦ Generate Compare Videos'
                      : '✦ Generate AI Video'}
                </StyledDeliveryButton>
              )}

              {activeTab.stage === 'BATCH_MATRIX' && (
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  disabled={queueingBatch || activeTab.batchRows.length === 0}
                  onClick={() => void handleRunBatch()}
                >
                  {queueingBatch
                    ? 'Queueing Batch…'
                    : `✦ Launch Batch (${activeTab.batchRows.length})`}
                </StyledDeliveryButton>
              )}
            </StyledSectionCard>
          </StyledRightInspector>
        )}
      </StyledWorkspaceGrid>

      {/* 4. Global Persistent Render Queue Dock */}
      <DeliveryStudioQueueDock
        jobs={ws?.jobs ?? []}
        clients={clients}
        onJumpToClient={(companyId, projectId) =>
          setTabsState((prev) =>
            focusOrCreateClientTab(prev, {
              companyId,
              projectId,
              label: formatStudioTabLabel(clients, companyId, projectId),
            }),
          )
        }
        onRefresh={() => void workspaceQuery.refetch()}
      />

      {/* Modals */}
      {ws && (
        <DeliveryStudioProviderModal
          open={providerModalOpen}
          canManage={ws.canManageProviders}
          config={ws.providerConfig}
          catalog={catalog}
          onClose={() => setProviderModalOpen(false)}
          onSaved={() => void workspaceQuery.refetch()}
        />
      )}

      <DeliveryStudioPresetModal
        open={presetModalKind !== null}
        presets={presets}
        initialKind={presetModalKind ?? 'CHARACTER_SHEET'}
        companyId={activeTab.companyId}
        projectId={activeTab.projectId}
        onClose={() => setPresetModalKind(null)}
        onSaved={() => void workspaceQuery.refetch()}
      />
    </StyledShell>
  );
};
