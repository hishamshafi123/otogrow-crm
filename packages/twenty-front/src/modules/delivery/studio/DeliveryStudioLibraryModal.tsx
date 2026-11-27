import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { UPSERT_DELIVERY_STUDIO_PRESET } from '@/delivery/studio/delivery-studio.graphql';
import {
  type StudioPresetDTO,
  type StudioReferenceVideoDTO,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';

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
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  max-width: 820px;
  overflow: hidden;
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
    font-size: 15px;
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

const StyledToolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 18px;
`;

const StyledFilterGroup = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
`;

const StyledFilterPill = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;

  &[data-active='true'] {
    background: ${themeCssVariables.font.color.primary};
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.inverted};
  }
`;

const StyledSearchInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 12px;
  min-width: 190px;
  padding: 6px 10px;
`;

const StyledAddButton = styled.button`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;

  &:hover {
    border-color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 16px 18px;
`;

const StyledCreatePanel = styled.form`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;

  label {
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    flex-direction: column;
    font-size: 12px;
    font-weight: 500;
    gap: 4px;
  }

  input[type='text'],
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 13px;
    padding: 7px 10px;
  }

  textarea {
    min-height: 64px;
    resize: vertical;
  }
`;

const StyledCreateRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
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
    opacity: 0.5;
  }
`;

const StyledGrid = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
`;

const StyledCard = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1.5px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  text-align: left;
  transition: border-color 120ms ease, transform 120ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    transform: translateY(-1px);
  }

  &[data-selected='true'] {
    border-color: ${themeCssVariables.color.blue};
    box-shadow: 0 0 0 2px ${themeCssVariables.color.transparent.blue2};
  }
`;

const StyledVisualBox = styled.div`
  align-items: center;
  aspect-ratio: 4 / 3;
  background: ${themeCssVariables.background.tertiary};
  display: flex;
  justify-content: center;
  overflow: hidden;
  position: relative;
  width: 100%;

  img,
  video {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledVideoBox = styled.div`
  align-items: center;
  aspect-ratio: 9 / 14;
  background: ${themeCssVariables.background.tertiary};
  display: flex;
  justify-content: center;
  overflow: hidden;
  position: relative;
  width: 100%;

  img,
  video {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledGlyph = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.85;
`;

const StyledDurationPill = styled.span`
  background: ${themeCssVariables.background.transparent.strong};
  border-radius: 6px;
  bottom: 6px;
  color: ${themeCssVariables.font.color.inverted};
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  position: absolute;
  right: 6px;
`;

const StyledCardMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: ${themeCssVariables.font.color.secondary};
    display: -webkit-box;
    font-size: 11px;
    line-height: 1.35;
    overflow: hidden;
  }
`;

const StyledScopeTag = styled.small`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 10px;
  margin-top: 2px;
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: 12px;
`;

const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;
  padding: 36px 12px;
  text-align: center;
`;

export type StudioLibraryMode = 'AVATAR' | 'ENVIRONMENT' | 'REFERENCE_VIDEO';

type DeliveryStudioLibraryModalProps = {
  mode: StudioLibraryMode;
  companyId: string | null;
  projectId: string | null;
  selectedId: string | null;
  presets: StudioPresetDTO[];
  referenceVideos: StudioReferenceVideoDTO[];
  onSelectPreset: (preset: StudioPresetDTO) => void;
  onSelectReferenceVideo: (video: StudioReferenceVideoDTO) => void;
  onCreated: () => Promise<void> | void;
  onClose: () => void;
};

const titleForMode = (mode: StudioLibraryMode) => {
  if (mode === 'AVATAR') return 'Avatar Library';
  if (mode === 'ENVIRONMENT') return 'Environment Library';
  return 'Reference Video Library';
};

export const DeliveryStudioLibraryModal = ({
  mode,
  companyId,
  projectId,
  selectedId,
  presets,
  referenceVideos,
  onSelectPreset,
  onSelectReferenceVideo,
  onCreated,
  onClose,
}: DeliveryStudioLibraryModalProps) => {
  const store = useStore();
  const [scope, setScope] = useState<'ALL' | 'CLIENT'>('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [clientOnly, setClientOnly] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [upsertPreset] = useMutation<{
    upsertDeliveryStudioPreset: StudioPresetDTO;
  }>(UPSERT_DELIVERY_STUDIO_PRESET);

  const presetKind =
    mode === 'AVATAR' ? 'CASTING_PERSONA' : 'ENVIRONMENT';

  const filteredPresets = useMemo(() => {
    if (mode === 'REFERENCE_VIDEO') return [];
    const q = search.trim().toLowerCase();
    return presets
      .filter((p) => p.kind === presetKind)
      .filter((p) =>
        scope === 'CLIENT' && companyId ? p.companyId === companyId : true,
      )
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.masterPrompt.toLowerCase().includes(q)
        );
      });
  }, [mode, presets, presetKind, scope, companyId, search]);

  const filteredVideos = useMemo(() => {
    if (mode !== 'REFERENCE_VIDEO') return [];
    const q = search.trim().toLowerCase();
    return referenceVideos
      .filter((v) =>
        scope === 'CLIENT' && companyId ? v.companyId === companyId : true,
      )
      .filter((v) => {
        if (!q) return true;
        return (
          v.title.toLowerCase().includes(q) ||
          v.notes.toLowerCase().includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
  }, [mode, referenceVideos, scope, companyId, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'REFERENCE_VIDEO') {
      if (!selectedFile) {
        setError('Choose a reference video file (MP4, MOV, or WebM).');
        return;
      }
      setBusy(true);
      setUploadPct(0);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append(
          'title',
          name.trim() || selectedFile.name.replace(/\.[^.]+$/, ''),
        );
        if (prompt.trim()) formData.append('notes', prompt.trim());
        if (clientOnly && companyId) {
          formData.append('companyId', companyId);
          if (projectId) formData.append('projectId', projectId);
        }
        const uploaded = await uploadStudioMultipart<StudioReferenceVideoDTO>({
          store,
          endpointPath: '/portal/delivery-studio/reference-videos/upload',
          formData,
          onProgress: (pct) => setUploadPct(pct),
        });
        await onCreated();
        if (uploaded?.id) {
          onSelectReferenceVideo(uploaded);
        }
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to upload reference video.',
        );
      } finally {
        setBusy(false);
        setUploadPct(null);
      }
      return;
    }

    if (!name.trim()) {
      setError(`Give this ${mode === 'AVATAR' ? 'avatar' : 'environment'} a name.`);
      return;
    }
    if (!prompt.trim() && !selectedFile) {
      setError('Add a description or upload a reference photo.');
      return;
    }

    setBusy(true);
    try {
      const res = await upsertPreset({
        variables: {
          input: {
            kind: presetKind,
            companyId: clientOnly && companyId ? companyId : null,
            projectId: clientOnly && projectId ? projectId : null,
            name: name.trim(),
            description: prompt.trim().slice(0, 140),
            masterPrompt:
              prompt.trim() ||
              `Match the visual appearance of the uploaded ${mode === 'AVATAR' ? 'avatar' : 'environment'} reference photo.`,
          },
        },
      });
      let savedPreset = res.data?.upsertDeliveryStudioPreset;
      if (savedPreset?.id && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        savedPreset = await uploadStudioMultipart<StudioPresetDTO>({
          store,
          endpointPath: `/portal/delivery-studio/presets/${savedPreset.id}/image/upload`,
          formData,
        });
      }
      await onCreated();
      if (savedPreset) {
        onSelectPreset(savedPreset);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save to library.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <StyledBackdrop onClick={onClose}>
      <StyledModal onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <h3>{titleForMode(mode)}</h3>
          <StyledCloseButton type="button" onClick={onClose} aria-label="Close">
            ×
          </StyledCloseButton>
        </StyledHeader>

        <StyledToolbar>
          <StyledFilterGroup>
            <StyledFilterPill
              type="button"
              data-active={scope === 'ALL'}
              onClick={() => setScope('ALL')}
            >
              All library
            </StyledFilterPill>
            {companyId && (
              <StyledFilterPill
                type="button"
                data-active={scope === 'CLIENT'}
                onClick={() => setScope('CLIENT')}
              >
                This client
              </StyledFilterPill>
            )}
            <StyledSearchInput
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </StyledFilterGroup>

          <StyledAddButton
            type="button"
            onClick={() => {
              setCreating((prev) => !prev);
              setError(null);
            }}
          >
            {creating
              ? 'Cancel'
              : mode === 'REFERENCE_VIDEO'
                ? '+ Upload video'
                : `+ Add ${mode === 'AVATAR' ? 'avatar' : 'environment'}`}
          </StyledAddButton>
        </StyledToolbar>

        <StyledBody>
          {creating && (
            <StyledCreatePanel onSubmit={(e) => void handleCreateSubmit(e)}>
              <label>
                {mode === 'REFERENCE_VIDEO' ? 'Video title' : 'Name'}
                <input
                  type="text"
                  placeholder={
                    mode === 'AVATAR'
                      ? 'e.g. Minimalist Tokyo Streetwear Model'
                      : mode === 'ENVIRONMENT'
                        ? 'e.g. Sunlit Concrete Loft'
                        : 'e.g. Slow Walking Fit Check Ref'
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label>
                {mode === 'REFERENCE_VIDEO'
                  ? 'Camera / pacing notes (optional)'
                  : 'Visual description'}
                <textarea
                  placeholder={
                    mode === 'AVATAR'
                      ? 'Age, styling, hair, pose vibe, natural skin texture…'
                      : mode === 'ENVIRONMENT'
                        ? 'Location, lighting, background textures, mood…'
                        : 'Optional notes about camera movement or vibe…'
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>

              <StyledCreateRow>
                <div>
                  <input
                    type="file"
                    accept={
                      mode === 'REFERENCE_VIDEO'
                        ? 'video/mp4,video/quicktime,video/webm'
                        : 'image/png,image/jpeg,image/webp'
                    }
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>

                <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
                  {companyId && (
                    <label
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={clientOnly}
                        onChange={(e) => setClientOnly(e.target.checked)}
                      />
                      This client only
                    </label>
                  )}
                  <StyledPrimaryButton type="submit" disabled={busy}>
                    {busy
                      ? uploadPct !== null
                        ? `Uploading ${uploadPct}%…`
                        : 'Saving…'
                      : 'Save & Select'}
                  </StyledPrimaryButton>
                </div>
              </StyledCreateRow>

              {error && <StyledError>{error}</StyledError>}
            </StyledCreatePanel>
          )}

          {mode !== 'REFERENCE_VIDEO' ? (
            filteredPresets.length === 0 ? (
              <StyledEmpty>
                No {mode === 'AVATAR' ? 'avatars' : 'environments'} found. Click
                &ldquo;+ Add&rdquo; above to create one.
              </StyledEmpty>
            ) : (
              <StyledGrid>
                {filteredPresets.map((preset) => (
                  <StyledCard
                    key={preset.id}
                    type="button"
                    data-selected={preset.id === selectedId}
                    onClick={() => {
                      onSelectPreset(preset);
                      onClose();
                    }}
                  >
                    <StyledVisualBox>
                      {preset.thumbnailPath ? (
                        <img
                          src={studioMediaUrl(preset.thumbnailPath)}
                          alt={preset.name}
                        />
                      ) : (
                        <StyledGlyph>
                          {preset.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? '')
                            .join('')}
                        </StyledGlyph>
                      )}
                    </StyledVisualBox>
                    <StyledCardMeta>
                      <strong>{preset.name}</strong>
                      <span>{preset.description || preset.masterPrompt}</span>
                      <StyledScopeTag>
                        {preset.companyId ? 'Client' : 'Shared agency'}
                      </StyledScopeTag>
                    </StyledCardMeta>
                  </StyledCard>
                ))}
              </StyledGrid>
            )
          ) : filteredVideos.length === 0 ? (
            <StyledEmpty>
              No reference videos yet. Click &ldquo;+ Upload video&rdquo; above
              to add your first reference video.
            </StyledEmpty>
          ) : (
            <StyledGrid>
              {filteredVideos.map((vid) => (
                <StyledCard
                  key={vid.id}
                  type="button"
                  data-selected={vid.id === selectedId}
                  onClick={() => {
                    onSelectReferenceVideo(vid);
                    onClose();
                  }}
                >
                  <StyledVideoBox>
                    {vid.thumbnailPath ? (
                      <img
                        src={studioMediaUrl(vid.thumbnailPath)}
                        alt={vid.title}
                      />
                    ) : (
                      <video
                        src={studioMediaUrl(vid.streamPath)}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                    {vid.mediaMeta?.durationSec && (
                      <StyledDurationPill>
                        {Math.round(vid.mediaMeta.durationSec)}s
                      </StyledDurationPill>
                    )}
                  </StyledVideoBox>
                  <StyledCardMeta>
                    <strong>{vid.title}</strong>
                    <span>{vid.notes || vid.originalFileName}</span>
                    <StyledScopeTag>
                      {vid.companyId ? 'Client' : 'Shared agency'}
                    </StyledScopeTag>
                  </StyledCardMeta>
                </StyledCard>
              ))}
            </StyledGrid>
          )}
        </StyledBody>
      </StyledModal>
    </StyledBackdrop>
  );
};
