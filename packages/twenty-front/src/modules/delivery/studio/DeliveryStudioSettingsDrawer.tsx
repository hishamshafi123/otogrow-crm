import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type StudioModelSpecDTO,
  type StudioPresetDTO,
  type StudioRoutingMode,
} from '@/delivery/studio/delivery-studio.types';
import { type StudioTabDraft } from '@/delivery/studio/studio-tabs-storage';

const StyledBackdrop = styled.div`
  background: ${themeCssVariables.background.transparent.medium};
  display: flex;
  inset: 0;
  justify-content: flex-end;
  position: fixed;
  z-index: 1150;
`;

const StyledDrawer = styled.div`
  background: ${themeCssVariables.background.primary};
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 400px;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: 14px 18px;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-weight: 600;
    margin: 0;
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

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 16px 18px;
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const StyledSectionTitle = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 12px;
    padding: 7px 9px;
  }

  textarea {
    min-height: 60px;
    resize: vertical;
  }
`;

const StyledTwoCol = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
`;

const StyledActionButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 500;
  justify-content: space-between;
  padding: 10px 12px;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledCheckRow = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  gap: 8px;
`;

type DeliveryStudioSettingsDrawerProps = {
  tab: StudioTabDraft;
  isClothingBrandClient: boolean;
  canManageProviders: boolean;
  imageModels: StudioModelSpecDTO[];
  videoModels: StudioModelSpecDTO[];
  characterPresets: StudioPresetDTO[];
  videoPresets: StudioPresetDTO[];
  onPatchTab: (patch: Partial<StudioTabDraft>) => void;
  onOpenProviders: () => void;
  onOpenPresets: () => void;
  onClose: () => void;
};

export const DeliveryStudioSettingsDrawer = ({
  tab,
  isClothingBrandClient,
  canManageProviders,
  imageModels,
  videoModels,
  characterPresets,
  videoPresets,
  onPatchTab,
  onOpenProviders,
  onOpenPresets,
  onClose,
}: DeliveryStudioSettingsDrawerProps) => {
  return (
    <StyledBackdrop onClick={onClose}>
      <StyledDrawer onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <h3>Studio Settings</h3>
          <StyledCloseButton type="button" onClick={onClose} aria-label="Close">
            ×
          </StyledCloseButton>
        </StyledHeader>

        <StyledBody>
          <StyledSection>
            <StyledSectionTitle>Workspace &amp; Presets</StyledSectionTitle>
            {canManageProviders && (
              <StyledActionButton
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProviders();
                }}
              >
                <span>API Keys &amp; Failover (WaveSpeed / Kie.ai)</span>
                <span>→</span>
              </StyledActionButton>
            )}
            <StyledActionButton
              type="button"
              onClick={() => {
                onClose();
                onOpenPresets();
              }}
            >
              <span>Master Prompt Presets</span>
              <span>→</span>
            </StyledActionButton>
          </StyledSection>

          <StyledSection>
            <StyledSectionTitle>Workflow Layout</StyledSectionTitle>
            <StyledField>
              Layout mode
              <select
                value={tab.layoutModeOverride}
                onChange={(e) =>
                  onPatchTab({
                    layoutModeOverride: e.target.value as
                      | 'AUTO'
                      | 'CLOTHING'
                      | 'GENERAL',
                  })
                }
              >
                <option value="AUTO">
                  Auto ({isClothingBrandClient ? 'Clothing Brand 3-step' : 'Standard'})
                </option>
                <option value="CLOTHING">Clothing Brand (3-Step Clean)</option>
                <option value="GENERAL">General (Includes Batch Matrix)</option>
              </select>
            </StyledField>
          </StyledSection>

          <StyledSection>
            <StyledSectionTitle>Character Sheet Engine</StyledSectionTitle>
            <StyledField>
              Image model
              <select
                value={tab.imageModelKey}
                onChange={(e) => onPatchTab({ imageModelKey: e.target.value })}
              >
                {imageModels.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.vendor})
                  </option>
                ))}
              </select>
            </StyledField>

            <StyledTwoCol>
              <StyledField>
                Resolution
                <select
                  value={tab.imageResolution}
                  onChange={(e) =>
                    onPatchTab({ imageResolution: e.target.value })
                  }
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </StyledField>
              <StyledField>
                Aspect ratio
                <select
                  value={tab.imageAspectRatio}
                  onChange={(e) =>
                    onPatchTab({ imageAspectRatio: e.target.value })
                  }
                >
                  <option value="3:4">3:4</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="4:5">4:5</option>
                </select>
              </StyledField>
            </StyledTwoCol>

            <StyledTwoCol>
              <StyledField>
                Angle layout
                <select
                  value={tab.characterAngleLayout}
                  onChange={(e) =>
                    onPatchTab({
                      characterAngleLayout: e.target.value as
                        | 'GRID_SHEET'
                        | 'SEPARATE_FRAMES'
                        | 'SINGLE_HERO',
                    })
                  }
                >
                  <option value="GRID_SHEET">Multi-angle Grid Sheet</option>
                  <option value="SEPARATE_FRAMES">Separate Frames</option>
                  <option value="SINGLE_HERO">Single Hero</option>
                </select>
              </StyledField>
              <StyledField>
                Takes
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={tab.imageCandidateCount}
                  onChange={(e) =>
                    onPatchTab({
                      imageCandidateCount: Math.max(
                        1,
                        Math.min(4, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </StyledField>
            </StyledTwoCol>

            <StyledField>
              Master Prompt Preset
              <select
                value={tab.characterPresetId ?? ''}
                onChange={(e) =>
                  onPatchTab({ characterPresetId: e.target.value || null })
                }
              >
                <option value="">Default Clothing Brand Sheet</option>
                {characterPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </StyledField>

            <StyledField>
              Extra direction (optional)
              <textarea
                placeholder="Optional extra styling or lighting notes…"
                value={tab.characterCustomNotes}
                onChange={(e) =>
                  onPatchTab({ characterCustomNotes: e.target.value })
                }
              />
            </StyledField>
          </StyledSection>

          <StyledSection>
            <StyledSectionTitle>AI Video Engine</StyledSectionTitle>
            <StyledField>
              Video model
              <select
                value={tab.videoModelKey}
                onChange={(e) => onPatchTab({ videoModelKey: e.target.value })}
              >
                {videoModels.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.vendor})
                  </option>
                ))}
              </select>
            </StyledField>

            <StyledTwoCol>
              <StyledField>
                Resolution
                <select
                  value={tab.videoResolution}
                  onChange={(e) =>
                    onPatchTab({ videoResolution: e.target.value })
                  }
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </StyledField>
              <StyledField>
                Duration (sec)
                <input
                  type="number"
                  min={4}
                  max={15}
                  value={tab.videoDurationSec}
                  onChange={(e) =>
                    onPatchTab({
                      videoDurationSec: Math.max(
                        4,
                        Math.min(15, Number(e.target.value) || 8),
                      ),
                    })
                  }
                />
              </StyledField>
            </StyledTwoCol>

            <StyledField>
              Video Master Prompt Preset
              <select
                value={tab.videoPresetId ?? ''}
                onChange={(e) =>
                  onPatchTab({ videoPresetId: e.target.value || null })
                }
              >
                <option value="">Default Reference Motion Transfer</option>
                {videoPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </StyledField>

            <StyledField>
              Provider routing
              <select
                value={tab.routingMode}
                onChange={(e) =>
                  onPatchTab({
                    routingMode: e.target.value as StudioRoutingMode,
                  })
                }
              >
                <option value="AUTO_FAILOVER">Auto Failover (Recommended)</option>
                <option value="WAVESPEED_ONLY">WaveSpeed Only</option>
                <option value="KIE_ONLY">Kie.ai Only</option>
              </select>
            </StyledField>

            <StyledCheckRow>
              <input
                type="checkbox"
                checked={tab.generateAudio}
                onChange={(e) =>
                  onPatchTab({ generateAudio: e.target.checked })
                }
              />
              Generate synced ambient audio
            </StyledCheckRow>

            <StyledCheckRow>
              <input
                type="checkbox"
                checked={tab.compareMode}
                onChange={(e) => onPatchTab({ compareMode: e.target.checked })}
              />
              Compare with a second video model
            </StyledCheckRow>

            {tab.compareMode && (
              <StyledField>
                Compare model
                <select
                  value={tab.compareModelKey}
                  onChange={(e) =>
                    onPatchTab({ compareModelKey: e.target.value })
                  }
                >
                  {videoModels.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </StyledField>
            )}
          </StyledSection>
        </StyledBody>
      </StyledDrawer>
    </StyledBackdrop>
  );
};
