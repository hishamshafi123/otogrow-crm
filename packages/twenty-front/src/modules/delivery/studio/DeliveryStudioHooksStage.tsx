import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  GET_DELIVERY_STUDIO_HOOK_PROJECT,
  RENDER_DELIVERY_STUDIO_VIDEO_HOOKS,
  SUGGEST_DELIVERY_STUDIO_VIDEO_HOOKS,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  type StudioAssetDTO,
  type StudioHookProjectDTO,
  type StudioPresetDTO,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(260px, 320px) 1fr;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;

  input,
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
  }

  textarea {
    min-height: 76px;
    resize: vertical;
  }
`;

const StyledHookOption = styled.div<{ selected: boolean }>`
  background: ${({ selected }) =>
    selected
      ? themeCssVariables.color.transparent.iris2
      : themeCssVariables.background.primary};
  border: 1px solid
    ${({ selected }) =>
      selected
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
`;

const StyledBadge = styled.span<{ tone?: 'ok' | 'info' | 'warn' }>`
  background: ${({ tone }) =>
    tone === 'ok'
      ? themeCssVariables.color.transparent.green3
      : tone === 'warn'
        ? themeCssVariables.color.transparent.amber3
        : themeCssVariables.color.transparent.iris3};
  border-radius: 999px;
  color: ${({ tone }) =>
    tone === 'ok'
      ? themeCssVariables.color.green11
      : tone === 'warn'
        ? themeCssVariables.color.amber11
        : themeCssVariables.color.iris11};
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
`;

const STYLE_PRESET_OPTIONS = [
  { key: 'TIKTOK_PILL', label: 'TikTok Pill (Clean White Box)' },
  { key: 'MINIMAL_BOLD', label: 'Minimal Bold (Outline)' },
  { key: 'NEON_STREET', label: 'Neon Streetwear' },
  { key: 'EDITORIAL_SERIF', label: 'Editorial Luxury' },
  { key: 'HIGH_CONTRAST_YELLOW', label: 'High-Contrast Yellow' },
];

type SelectedHookDraft = {
  id: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  selected: boolean;
};

type DeliveryStudioHooksStageProps = {
  generatedVideos: StudioAssetDTO[];
  selectedVideoAssetId: string | null;
  hookPresets: StudioPresetDTO[];
  onSelectVideo: (assetId: string) => void;
  onOpenPresetModal: () => void;
  onWorkspaceRefresh: () => void;
};

export const DeliveryStudioHooksStage = ({
  generatedVideos,
  selectedVideoAssetId,
  hookPresets,
  onSelectVideo,
  onOpenPresetModal,
  onWorkspaceRefresh,
}: DeliveryStudioHooksStageProps) => {
  const activeVideo =
    generatedVideos.find((v) => v.id === selectedVideoAssetId) ??
    generatedVideos[0] ??
    null;

  const [hookPresetId, setHookPresetId] = useState<string>(
    hookPresets[0]?.id ?? '',
  );
  const [masterPrompt, setMasterPrompt] = useState<string>(
    hookPresets[0]?.masterPrompt ?? '',
  );
  const [examplesText, setExamplesText] = useState<string>(
    (hookPresets[0]?.examplesJson ?? []).join('\n'),
  );
  const [platform, setPlatform] = useState<
    'ALL' | 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS'
  >('TIKTOK');
  const [funnelStage, setFunnelStage] = useState<
    'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC'
  >('COLD');
  const [suggestionCount, setSuggestionCount] = useState(8);
  const [stylePreset, setStylePreset] = useState('TIKTOK_PILL');
  const [syncToDrive, setSyncToDrive] = useState(true);
  const [hookDrafts, setHookDrafts] = useState<SelectedHookDraft[]>([]);
  const [customHookInput, setCustomHookInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const hookProjectQuery = useQuery<{
    deliveryStudioHookProject: StudioHookProjectDTO | null;
  }>(GET_DELIVERY_STUDIO_HOOK_PROJECT, {
    variables: { assetId: activeVideo?.id ?? '' },
    skip: !activeVideo?.id,
    fetchPolicy: 'network-only',
    pollInterval: 5000,
  });

  const [suggestHooks, { loading: suggesting }] = useMutation<{
    suggestDeliveryStudioVideoHooks: {
      deliverableId: string;
      hookProject: StudioHookProjectDTO;
    };
  }>(SUGGEST_DELIVERY_STUDIO_VIDEO_HOOKS);

  const [renderHooks, { loading: rendering }] = useMutation<{
    renderDeliveryStudioVideoHooks: {
      deliverableId: string;
      hookProject: StudioHookProjectDTO;
    };
  }>(RENDER_DELIVERY_STUDIO_VIDEO_HOOKS);

  const hookProject = hookProjectQuery.data?.deliveryStudioHookProject ?? null;

  useEffect(() => {
    if (!hookProject?.aiSuggestions?.length) return;
    setHookDrafts((prev) => {
      if (prev.length > 0) return prev;
      return hookProject.aiSuggestions.map((item, idx) => ({
        id: `sug-${idx}`,
        hookText: item.hookText,
        angleTag: item.angleTag ?? '',
        rationale: item.rationale ?? '',
        selected: idx < 4,
      }));
    });
  }, [hookProject?.aiSuggestions]);

  const handleApplyHookPreset = (id: string) => {
    setHookPresetId(id);
    const found = hookPresets.find((p) => p.id === id);
    if (found) {
      setMasterPrompt(found.masterPrompt || '');
      setExamplesText((found.examplesJson ?? []).join('\n'));
      if (found.configJson?.platform) setPlatform(found.configJson.platform);
      if (found.configJson?.funnelStage) {
        setFunnelStage(found.configJson.funnelStage);
      }
    }
  };

  const handleAssessAndSuggest = async () => {
    if (!activeVideo) return;
    setErrorMessage('');
    setStatusMessage('');
    try {
      const exampleHooks = examplesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const res = await suggestHooks({
        variables: {
          input: {
            assetId: activeVideo.id,
            hookPresetId: hookPresetId || null,
            masterPrompt: masterPrompt.trim() || undefined,
            exampleHooks,
            platform,
            funnelStage,
            suggestionCount,
          },
        },
      });
      const proj = res.data?.suggestDeliveryStudioVideoHooks?.hookProject;
      if (proj?.aiSuggestions?.length) {
        setHookDrafts(
          proj.aiSuggestions.map((item, idx) => ({
            id: `sug-${Date.now()}-${idx}`,
            hookText: item.hookText,
            angleTag: item.angleTag ?? '',
            rationale: item.rationale ?? '',
            selected: idx < 4,
          })),
        );
      }
      setStatusMessage(
        'Video assessed with Brand Knowledge & examples. Pick any N hooks below!',
      );
      void hookProjectQuery.refetch();
      onWorkspaceRefresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to suggest hooks.',
      );
    }
  };

  const handleAddCustomHook = () => {
    const clean = customHookInput.trim();
    if (!clean) return;
    setHookDrafts((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        hookText: clean,
        angleTag: 'Custom',
        rationale: 'Added manually',
        selected: true,
      },
    ]);
    setCustomHookInput('');
  };

  const selectedHooks = hookDrafts.filter(
    (h) => h.selected && h.hookText.trim().length > 0,
  );

  const handleRenderN = async () => {
    if (!activeVideo || selectedHooks.length === 0) return;
    setErrorMessage('');
    setStatusMessage('');
    try {
      await renderHooks({
        variables: {
          input: {
            assetId: activeVideo.id,
            stylePreset,
            syncToDrive,
            hooks: selectedHooks.map((h) => ({
              hookText: h.hookText.trim(),
              angleTag: h.angleTag,
              rationale: h.rationale,
            })),
          },
        },
      });
      setStatusMessage(
        `Queued ${selectedHooks.length} text-hook variation${selectedHooks.length === 1 ? '' : 's'} for FFmpeg rendering${syncToDrive ? ' + Google Drive sync' : ''}!`,
      );
      void hookProjectQuery.refetch();
      onWorkspaceRefresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to render hook variations.',
      );
    }
  };

  if (!activeVideo) {
    return (
      <StyledCard>
        <strong>No generated AI videos in this tab yet</strong>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
          Generate an AI video in Step 2 or Step 3 first. Once ready, it
          appears here automatically for Gemini video assessment, dynamic N
          text-hook variations, and 1-click Google Drive sync.
        </p>
      </StyledCard>
    );
  }

  return (
    <StyledGrid>
      {/* Left column: Video preview + assessment summary */}
      <StyledCard>
        <StyledField>
          Active Generated AI Video
          <select
            value={activeVideo.id}
            onChange={(e) => {
              setHookDrafts([]);
              onSelectVideo(e.target.value);
            }}
          >
            {generatedVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.modelKey})
              </option>
            ))}
          </select>
        </StyledField>

        <video
          key={activeVideo.id}
          controls
          playsInline
          src={studioMediaUrl(activeVideo.mediaPath)}
          style={{
            width: '100%',
            maxHeight: 380,
            borderRadius: 8,
            background: themeCssVariables.background.invertedPrimary,
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <StyledBadge tone="info">{activeVideo.modelKey}</StyledBadge>
          <StyledBadge tone="ok">via {activeVideo.providerUsed}</StyledBadge>
          {activeVideo.deliverableId && (
            <Link
              to={`/delivery?view=hook-studio&deliverable=${activeVideo.deliverableId}`}
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              Open Full Visual Canvas →
            </Link>
          )}
        </div>

        {hookProject?.videoAnalysis?.summary && (
          <div
            style={{
              background: themeCssVariables.color.transparent.iris2,
              borderRadius: 8,
              padding: 10,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <strong>Gemini Video Assessment:</strong>
            <div style={{ marginTop: 4 }}>
              {hookProject.videoAnalysis.summary}
            </div>
          </div>
        )}
      </StyledCard>

      {/* Right column: Master Prompt + Examples -> Dynamic N-Hook Selector -> Render & Drive */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <StyledCard>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong>1. Video Assessment &amp; Hook Master Prompt</strong>
            <StyledDeliveryButton type="button" onClick={onOpenPresetModal}>
              + Manage Hook Presets
            </StyledDeliveryButton>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StyledField style={{ flex: 2, minWidth: 180 }}>
              Saved Hook Preset
              <select
                value={hookPresetId}
                onChange={(e) => handleApplyHookPreset(e.target.value)}
              >
                <option value="">Custom (Ad-hoc)</option>
                {hookPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </StyledField>
            <StyledField style={{ flex: 1, minWidth: 120 }}>
              Platform
              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(
                    e.target.value as
                      | 'ALL'
                      | 'TIKTOK'
                      | 'INSTAGRAM_REELS'
                      | 'META_ADS'
                      | 'YOUTUBE_SHORTS',
                  )
                }
              >
                <option value="TIKTOK">TikTok</option>
                <option value="INSTAGRAM_REELS">Instagram Reels</option>
                <option value="META_ADS">Meta Ads</option>
                <option value="YOUTUBE_SHORTS">YouTube Shorts</option>
                <option value="ALL">All</option>
              </select>
            </StyledField>
            <StyledField style={{ flex: 1, minWidth: 120 }}>
              Funnel
              <select
                value={funnelStage}
                onChange={(e) =>
                  setFunnelStage(
                    e.target.value as
                      | 'COLD'
                      | 'WARM'
                      | 'RETARGETING'
                      | 'ORGANIC',
                  )
                }
              >
                <option value="COLD">Cold</option>
                <option value="WARM">Warm</option>
                <option value="RETARGETING">Retargeting</option>
                <option value="ORGANIC">Organic</option>
              </select>
            </StyledField>
            <StyledField style={{ width: 96 }}>
              Suggestions
              <input
                type="number"
                min={2}
                max={12}
                value={suggestionCount}
                onChange={(e) =>
                  setSuggestionCount(
                    Math.max(2, Math.min(12, Number(e.target.value) || 8)),
                  )
                }
              />
            </StyledField>
          </div>

          <StyledField>
            Hook Master Prompt (combined automatically with Video Assessment +
            Brand Knowledge)
            <textarea
              placeholder="Tell Gemini your exact copywriting style, length, and angle rules..."
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
            />
          </StyledField>

          <StyledField>
            Fed-in Example Hooks (one per line)
            <textarea
              placeholder="Paste winning hooks from this brand or reference ads..."
              value={examplesText}
              onChange={(e) => setExamplesText(e.target.value)}
            />
          </StyledField>

          <div>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={suggesting}
              onClick={() => void handleAssessAndSuggest()}
            >
              {suggesting
                ? 'Assessing Video & Writing Hooks…'
                : '✦ Assess Video & Suggest Text Hooks'}
            </StyledDeliveryButton>
          </div>
        </StyledCard>

        <StyledCard>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <strong>
              2. Pick Your Dynamic Hooks ({selectedHooks.length} selected →
              renders {selectedHooks.length} video
              {selectedHooks.length === 1 ? '' : 's'})
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setHookDrafts((prev) =>
                    prev.map((h, i) => ({ ...h, selected: i < 3 })),
                  )
                }
              >
                Top 3
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setHookDrafts((prev) =>
                    prev.map((h, i) => ({ ...h, selected: i < 4 })),
                  )
                }
              >
                Top 4
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setHookDrafts((prev) =>
                    prev.map((h) => ({ ...h, selected: true })),
                  )
                }
              >
                Select All
              </StyledDeliveryButton>
            </div>
          </div>

          {hookDrafts.length === 0 ? (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Click &ldquo;Assess Video &amp; Suggest Text Hooks&rdquo; above,
              or add your own custom hooks below.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hookDrafts.map((item) => (
                <StyledHookOption
                  key={item.id}
                  selected={item.selected}
                  onClick={() =>
                    setHookDrafts((prev) =>
                      prev.map((h) =>
                        h.id === item.id ? { ...h, selected: !h.selected } : h,
                      ),
                    )
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => undefined}
                    />
                    <input
                      value={item.hookText}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setHookDrafts((prev) =>
                          prev.map((h) =>
                            h.id === item.id
                              ? { ...h, hookText: e.target.value }
                              : h,
                          ),
                        )
                      }
                      style={{
                        flex: 1,
                        fontWeight: 600,
                        fontSize: 13,
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                      }}
                    />
                    {item.angleTag && (
                      <StyledBadge tone="info">{item.angleTag}</StyledBadge>
                    )}
                  </div>
                  {item.rationale && (
                    <span style={{ fontSize: 11, opacity: 0.7, paddingLeft: 22 }}>
                      {item.rationale}
                    </span>
                  )}
                </StyledHookOption>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
              placeholder="Add custom text hook..."
              value={customHookInput}
              onChange={(e) => setCustomHookInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomHook();
                }
              }}
            />
            <StyledDeliveryButton type="button" onClick={handleAddCustomHook}>
              + Add Hook
            </StyledDeliveryButton>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingTop: 8,
              borderTop: `1px solid ${themeCssVariables.border.color.light}`,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <StyledField>
                Text Overlay Style
                <select
                  value={stylePreset}
                  onChange={(e) => setStylePreset(e.target.value)}
                >
                  {STYLE_PRESET_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </StyledField>
              <label style={{ fontSize: 12, display: 'flex', gap: 6, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={syncToDrive}
                  onChange={(e) => setSyncToDrive(e.target.checked)}
                />
                Auto-sync to Google Drive
              </label>
            </div>

            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={rendering || selectedHooks.length === 0}
              onClick={() => void handleRenderN()}
            >
              {rendering
                ? 'Queueing FFmpeg Renders…'
                : `Render ${selectedHooks.length} Variation${selectedHooks.length === 1 ? '' : 's'} & Sync to Drive`}
            </StyledDeliveryButton>
          </div>

          {statusMessage && <StyledBadge tone="ok">{statusMessage}</StyledBadge>}
          {errorMessage && <StyledBadge tone="warn">{errorMessage}</StyledBadge>}

          {(hookProject?.variations?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong style={{ fontSize: 12 }}>
                Rendered Variations &amp; Google Drive Status
              </strong>
              {hookProject?.variations.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: themeCssVariables.background.tertiary,
                  }}
                >
                  <span>
                    <strong>V{v.variationNumber}:</strong> {v.hookText}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StyledBadge
                      tone={v.renderStatus === 'COMPLETED' ? 'ok' : 'info'}
                    >
                      {v.renderStatus}
                    </StyledBadge>
                    {v.driveWebUrl ? (
                      <a
                        href={v.driveWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 600 }}
                      >
                        Drive ↗
                      </a>
                    ) : (
                      <span style={{ opacity: 0.65 }}>{v.driveSyncStatus}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StyledCard>
      </div>
    </StyledGrid>
  );
};
