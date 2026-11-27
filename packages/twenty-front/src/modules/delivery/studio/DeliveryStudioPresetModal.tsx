import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  ARCHIVE_DELIVERY_STUDIO_PRESET,
  UPSERT_DELIVERY_STUDIO_PRESET,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  type StudioPresetDTO,
  type StudioPresetKind,
} from '@/delivery/studio/delivery-studio.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledBackdrop = styled.div`
  align-items: center;
  backdrop-filter: blur(4px);
  background: ${themeCssVariables.background.transparent.strong};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: 1200;
`;

const StyledModal = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: 0 24px 64px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  max-width: 860px;
  overflow: hidden;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[5]};

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.lg};
    font-weight: 600;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: ${themeCssVariables.font.size.xs};
    margin: 2px 0 0;
  }
`;

const StyledSplit = styled.div`
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 460px;
  overflow: hidden;
`;

const StyledSidebar = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPresetItem = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.primary : 'transparent'};
  border: 1px solid
    ${({ active }) =>
      active ? themeCssVariables.border.color.strong : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[5]};
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: 500;
  gap: 5px;

  input,
  select,
  textarea {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: ${themeCssVariables.font.size.sm};
    padding: 8px 10px;
  }

  textarea {
    min-height: 110px;
    resize: vertical;
  }
`;

const StyledChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledChip = styled.button`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 11px;
  padding: 3px 9px;
`;

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[5]};
`;

const VARIABLES_BY_KIND: Record<StudioPresetKind, string[]> = {
  CHARACTER_SHEET: [
    '{{product_name}}',
    '{{product_notes}}',
    '{{brand_notes}}',
    '{{angles}}',
    '{{angle_count}}',
    '{{talent}}',
    '{{environment}}',
    '{{custom_notes}}',
  ],
  VIDEO_GENERATION: [
    '{{product_name}}',
    '{{product_notes}}',
    '{{brand_notes}}',
    '{{environment}}',
    '{{reference_notes}}',
    '{{custom_notes}}',
  ],
  TEXT_HOOK: ['{{product_name}}', '{{brand_notes}}'],
  CASTING_PERSONA: ['{{brand_notes}}'],
};

const QUICK_ANGLE_TEMPLATES: { label: string; angles: string[] }[] = [
  { label: 'Single Hero', angles: ['Front Full-Body'] },
  { label: '2-Angle (Front + Back)', angles: ['Front Full-Body', 'Back Full-Body'] },
  {
    label: '4-Angle Full',
    angles: [
      'Front Full-Body',
      'Back Full-Body',
      'Left 3/4 Profile',
      'Garment Detail Close-Up',
    ],
  },
];

type DeliveryStudioPresetModalProps = {
  open: boolean;
  presets: StudioPresetDTO[];
  initialKind?: StudioPresetKind;
  companyId: string | null;
  projectId: string | null;
  onClose: () => void;
  onSaved: (preset: StudioPresetDTO) => void;
};

export const DeliveryStudioPresetModal = ({
  open,
  presets,
  initialKind = 'CHARACTER_SHEET',
  companyId,
  projectId,
  onClose,
  onSaved,
}: DeliveryStudioPresetModalProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<StudioPresetKind>(initialKind);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');
  const [scopeToClient, setScopeToClient] = useState(false);
  const [angleLayout, setAngleLayout] = useState<
    'GRID_SHEET' | 'SEPARATE_FRAMES' | 'SINGLE_HERO'
  >('GRID_SHEET');
  const [angles, setAngles] = useState<string[]>([
    'Front Full-Body',
    'Back Full-Body',
  ]);
  const [newAngleInput, setNewAngleInput] = useState('');
  const [examplesText, setExamplesText] = useState('');
  const [platform, setPlatform] = useState<
    'ALL' | 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS'
  >('ALL');
  const [funnelStage, setFunnelStage] = useState<
    'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC'
  >('COLD');
  const [error, setError] = useState('');

  const [upsertPreset, { loading: saving }] = useMutation<{
    upsertDeliveryStudioPreset: StudioPresetDTO;
  }>(UPSERT_DELIVERY_STUDIO_PRESET);
  const [archivePreset, { loading: archiving }] = useMutation(
    ARCHIVE_DELIVERY_STUDIO_PRESET,
  );

  if (!open) return null;

  const loadPreset = (preset: StudioPresetDTO) => {
    setSelectedId(preset.id);
    setKind(preset.kind);
    setName(preset.name);
    setDescription(preset.description || '');
    setMasterPrompt(preset.masterPrompt || '');
    setScopeToClient(Boolean(preset.companyId));
    setAngleLayout(preset.configJson?.angleLayout ?? 'GRID_SHEET');
    setAngles(
      Array.isArray(preset.configJson?.angles) &&
        preset.configJson.angles.length > 0
        ? preset.configJson.angles
        : ['Front Full-Body', 'Back Full-Body'],
    );
    setExamplesText((preset.examplesJson ?? []).join('\n'));
    setPlatform(preset.configJson?.platform ?? 'ALL');
    setFunnelStage(preset.configJson?.funnelStage ?? 'COLD');
    setError('');
  };

  const resetForNew = (newKind: StudioPresetKind = kind) => {
    setSelectedId(null);
    setKind(newKind);
    setName('');
    setDescription('');
    setMasterPrompt('');
    setScopeToClient(false);
    setAngleLayout('GRID_SHEET');
    setAngles(['Front Full-Body', 'Back Full-Body']);
    setExamplesText('');
    setError('');
  };

  const handleAddAngle = () => {
    const clean = newAngleInput.trim();
    if (!clean || angles.length >= 8) return;
    setAngles([...angles, clean]);
    setNewAngleInput('');
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give this preset a clear name.');
      return;
    }
    try {
      const examplesJson = examplesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 30);

      const configJson: Record<string, unknown> =
        kind === 'CHARACTER_SHEET'
          ? { angleLayout, angles }
          : kind === 'TEXT_HOOK'
            ? { platform, funnelStage }
            : {};

      const res = await upsertPreset({
        variables: {
          input: {
            ...(selectedId ? { id: selectedId } : {}),
            companyId: scopeToClient ? companyId : null,
            projectId: scopeToClient ? projectId : null,
            kind,
            name: name.trim(),
            description: description.trim(),
            masterPrompt: masterPrompt.trim(),
            configJson,
            examplesJson,
          },
        },
      });
      const saved = res.data?.upsertDeliveryStudioPreset;
      if (saved) {
        setSelectedId(saved.id);
        onSaved(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset.');
    }
  };

  const handleArchive = async () => {
    if (!selectedId) return;
    try {
      await archivePreset({ variables: { id: selectedId } });
      resetForNew(kind);
      onSaved(presets[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive preset.');
    }
  };

  return (
    <StyledBackdrop onClick={onClose}>
      <StyledModal onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <div>
            <h3>Dynamic Master Prompt Presets</h3>
            <p>
              Create reusable styles for 2-angle, 4-angle, video prompts,
              casting personas, and text-hook master prompts with examples.
            </p>
          </div>
          <StyledDeliveryButton type="button" onClick={onClose}>
            Close
          </StyledDeliveryButton>
        </StyledHeader>

        <StyledSplit>
          <StyledSidebar>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              onClick={() => resetForNew(kind)}
            >
              + New Master Prompt
            </StyledDeliveryButton>
            {presets.map((preset) => (
              <StyledPresetItem
                key={preset.id}
                type="button"
                active={selectedId === preset.id}
                onClick={() => loadPreset(preset)}
              >
                <strong>{preset.name}</strong>
                <small>
                  {preset.kind.replace('_', ' ')}
                  {preset.companyId ? ' · Client' : ' · Global'}
                </small>
              </StyledPresetItem>
            ))}
          </StyledSidebar>

          <StyledEditor>
            <div style={{ display: 'flex', gap: 10 }}>
              <StyledField style={{ flex: 1 }}>
                Preset Type
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as StudioPresetKind)}
                >
                  <option value="CHARACTER_SHEET">
                    Character Sheet (Angles &amp; Style)
                  </option>
                  <option value="VIDEO_GENERATION">
                    AI Video Generation Prompt
                  </option>
                  <option value="TEXT_HOOK">
                    AI Text Hooks (Master Prompt + Examples)
                  </option>
                  <option value="CASTING_PERSONA">
                    Casting Persona / Talent Profile
                  </option>
                </select>
              </StyledField>
              <StyledField style={{ flex: 1 }}>
                Preset Name
                <input
                  placeholder="e.g. 4-Angle Streetwear Sheet or Viral Hook Style"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </StyledField>
            </div>

            <StyledField>
              Short Description
              <input
                placeholder="When should your team pick this style?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </StyledField>

            {kind === 'CHARACTER_SHEET' && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <StyledField style={{ flex: 1 }}>
                    Layout Mode
                    <select
                      value={angleLayout}
                      onChange={(e) =>
                        setAngleLayout(
                          e.target.value as
                            | 'GRID_SHEET'
                            | 'SEPARATE_FRAMES'
                            | 'SINGLE_HERO',
                        )
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {QUICK_ANGLE_TEMPLATES.map((tpl) => (
                      <StyledChip
                        key={tpl.label}
                        type="button"
                        onClick={() => setAngles(tpl.angles)}
                      >
                        {tpl.label}
                      </StyledChip>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
                    Angles ({angles.length}) — click × to remove or add any
                    custom angle:
                  </div>
                  <StyledChipRow>
                    {angles.map((angle, idx) => (
                      <StyledChip
                        key={`${angle}-${idx}`}
                        type="button"
                        onClick={() =>
                          angles.length > 1 &&
                          setAngles(angles.filter((_, i) => i !== idx))
                        }
                      >
                        {angle} ×
                      </StyledChip>
                    ))}
                  </StyledChipRow>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                      placeholder="Add angle (e.g. Right Profile, Fabric Macro...)"
                      value={newAngleInput}
                      onChange={(e) => setNewAngleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAngle();
                        }
                      }}
                    />
                    <StyledDeliveryButton
                      type="button"
                      onClick={handleAddAngle}
                    >
                      + Add Angle
                    </StyledDeliveryButton>
                  </div>
                </div>
              </>
            )}

            {kind === 'TEXT_HOOK' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <StyledField style={{ flex: 1 }}>
                  Default Platform
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
                    <option value="ALL">All Short-Form</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="INSTAGRAM_REELS">Instagram Reels</option>
                    <option value="META_ADS">Meta Paid Ads</option>
                    <option value="YOUTUBE_SHORTS">YouTube Shorts</option>
                  </select>
                </StyledField>
                <StyledField style={{ flex: 1 }}>
                  Default Funnel Stage
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
                    <option value="COLD">Cold Traffic</option>
                    <option value="WARM">Warm / Consideration</option>
                    <option value="RETARGETING">Retargeting</option>
                    <option value="ORGANIC">Organic Growth</option>
                  </select>
                </StyledField>
              </div>
            )}

            <StyledField>
              Master Prompt (click any variable pill below to insert)
              <textarea
                placeholder="Write your reusable master prompt..."
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
              />
            </StyledField>

            <StyledChipRow>
              {VARIABLES_BY_KIND[kind].map((token) => (
                <StyledChip
                  key={token}
                  type="button"
                  onClick={() =>
                    setMasterPrompt((prev) =>
                      prev ? `${prev} ${token}` : token,
                    )
                  }
                >
                  + {token}
                </StyledChip>
              ))}
            </StyledChipRow>

            {kind === 'TEXT_HOOK' && (
              <StyledField>
                Fed-in Example Hooks (one winning hook per line — AI matches
                rhythm &amp; style)
                <textarea
                  placeholder={
                    'Nobody talks about why heavyweight cotton drapes better.\nPOV: You stopped buying fast-fashion basics.'
                  }
                  value={examplesText}
                  onChange={(e) => setExamplesText(e.target.value)}
                />
              </StyledField>
            )}

            {companyId && (
              <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={scopeToClient}
                  onChange={(e) => setScopeToClient(e.target.checked)}
                />
                Save only for current client/project (unchecked = available
                across all clients)
              </label>
            )}

            {error && (
              <span style={{ color: themeCssVariables.color.red11, fontSize: 12 }}>
                {error}
              </span>
            )}
          </StyledEditor>
        </StyledSplit>

        <StyledFooter>
          <div>
            {selectedId && (
              <StyledDeliveryButton
                type="button"
                disabled={archiving}
                onClick={() => void handleArchive()}
              >
                Archive Preset
              </StyledDeliveryButton>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <StyledDeliveryButton type="button" onClick={onClose}>
              Cancel
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : selectedId ? 'Update Preset' : 'Save Preset'}
            </StyledDeliveryButton>
          </div>
        </StyledFooter>
      </StyledModal>
    </StyledBackdrop>
  );
};
