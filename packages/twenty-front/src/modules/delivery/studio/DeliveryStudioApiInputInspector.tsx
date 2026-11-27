import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  studioMediaUrl,
  type StudioApiRequestSnapshotDTO,
} from '@/delivery/studio/delivery-studio.types';

const StyledInspectorRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

const StyledToggleBtn = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  justify-content: space-between;
  padding: 6px 10px;
  transition: border-color 120ms ease, color 120ms ease;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    color: ${themeCssVariables.font.color.primary};
  }

  &[data-open='true'] {
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledToggleLeft = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 6px;
`;

const StyledToggleBadges = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 5px;
`;

const StyledTinyPill = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;

  &[data-tone='ok'] {
    background: ${themeCssVariables.color.green3};
    color: ${themeCssVariables.color.green11};
  }

  &[data-tone='warn'] {
    background: ${themeCssVariables.color.amber3};
    color: ${themeCssVariables.color.amber11};
  }
`;

const StyledPanel = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
`;

const StyledMetaRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
`;

const StyledEndpointLine = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSectionLabel = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 10px;
  font-weight: 600;
  justify-content: space-between;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const StyledImageStrip = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
`;

const StyledImageTile = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledTileThumb = styled.div`
  align-items: center;
  aspect-ratio: 3 / 4;
  background: ${themeCssVariables.background.tertiary};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 11px;
  justify-content: center;
  overflow: hidden;
  position: relative;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledTokenBadge = styled.span`
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: 4px;
  color: ${themeCssVariables.font.color.inverted};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  font-weight: 600;
  left: 4px;
  padding: 1px 4px;
  position: absolute;
  top: 4px;
`;

const StyledTileMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 5px;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 10px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledVideoRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  display: flex;
  gap: 10px;
  padding: 7px 8px;
`;

const StyledVideoThumb = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font-size: 12px;
  height: 52px;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  position: relative;
  width: 42px;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledVideoMeta = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledInlineVideo = styled.video`
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: 7px;
  max-height: 220px;
  width: 100%;
`;

const StyledPromptBox = styled.pre`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  margin: 0;
  max-height: 160px;
  overflow: auto;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledInlineAction = styled.button`
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 5px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledEmptyNote = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11px;
  font-style: italic;
`;

const StyledLegacyNote = styled.div`
  background: ${themeCssVariables.color.amber3};
  border-radius: 6px;
  color: ${themeCssVariables.color.amber11};
  font-size: 10px;
  line-height: 1.4;
  padding: 6px 8px;
`;

const roleLabel = (role: string): string => {
  switch (role) {
    case 'CHARACTER_SHEET':
      return 'Character Sheet';
    case 'PRODUCT':
      return 'Product';
    case 'AVATAR':
      return 'Avatar';
    case 'ENVIRONMENT':
      return 'Environment';
    default:
      return role;
  }
};

const providerLabel = (provider: 'wavespeed' | 'kie' | null): string => {
  if (provider === 'wavespeed') return 'WaveSpeedAI';
  if (provider === 'kie') return 'Kie.ai';
  return 'Pending dispatch';
};

type DeliveryStudioApiInputInspectorProps = {
  snapshot: StudioApiRequestSnapshotDTO;
  buttonLabel?: string;
  isPreview?: boolean;
  legacyNote?: string;
};

export const DeliveryStudioApiInputInspector = ({
  snapshot,
  buttonLabel = 'Inspect API Input',
  isPreview = false,
  legacyNote,
}: DeliveryStudioApiInputInspectorProps) => {
  // Always hidden by default — revealed only when explicitly selected by the user
  const [isOpen, setIsOpen] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [playingVideoIdx, setPlayingVideoIdx] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<'prompt' | 'json' | null>(null);

  const imageCount = snapshot.images.length;
  const videoCount = snapshot.videos.length;

  const handleCopy = async (text: string, key: 'prompt' | 'json') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <StyledInspectorRoot>
      <StyledToggleBtn
        type="button"
        data-open={isOpen}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <StyledToggleLeft>
          <span>{isOpen ? '▾' : '▸'}</span>
          <span>{isOpen ? 'Hide API Input' : buttonLabel}</span>
        </StyledToggleLeft>
        <StyledToggleBadges>
          <StyledTinyPill>
            {imageCount} img{imageCount === 1 ? '' : 's'}
          </StyledTinyPill>
          <StyledTinyPill>
            {videoCount} vid{videoCount === 1 ? '' : 's'}
          </StyledTinyPill>
          {snapshot.provider && (
            <StyledTinyPill data-tone={snapshot.failoverTriggered ? 'warn' : 'ok'}>
              {providerLabel(snapshot.provider)}
            </StyledTinyPill>
          )}
        </StyledToggleBadges>
      </StyledToggleBtn>

      {isOpen && (
        <StyledPanel>
          {legacyNote && <StyledLegacyNote>{legacyNote}</StyledLegacyNote>}

          <StyledMetaRow>
            <StyledToggleBadges>
              <StyledTinyPill data-tone={snapshot.provider ? 'ok' : undefined}>
                {isPreview ? 'Preview (sent on Generate)' : providerLabel(snapshot.provider)}
              </StyledTinyPill>
              <StyledTinyPill>{snapshot.modelLabel || snapshot.modelKey}</StyledTinyPill>
              {snapshot.failoverTriggered && (
                <StyledTinyPill data-tone="warn">Auto-Failover</StyledTinyPill>
              )}
            </StyledToggleBadges>
            {snapshot.externalTaskId && (
              <StyledTinyPill title="Provider task ID">
                #{snapshot.externalTaskId.slice(0, 12)}
              </StyledTinyPill>
            )}
          </StyledMetaRow>

          {snapshot.endpoint && (
            <StyledEndpointLine title={snapshot.endpoint}>
              POST {snapshot.endpoint}
            </StyledEndpointLine>
          )}

          {/* Reference Images */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StyledSectionLabel>
              <span>Images sent to API ({imageCount})</span>
              {!isPreview && imageCount > 0 && (
                <span>
                  {snapshot.images.filter((i) => Boolean(i.stagedUrl)).length}/{imageCount} staged
                </span>
              )}
            </StyledSectionLabel>
            {imageCount === 0 ? (
              <StyledEmptyNote>No reference images attached.</StyledEmptyNote>
            ) : (
              <StyledImageStrip>
                {snapshot.images.map((img) => {
                  const thumbSrc = img.mediaPath
                    ? studioMediaUrl(img.mediaPath)
                    : img.stagedUrl || '';
                  return (
                    <StyledImageTile key={`${img.index}-${img.fileName}`}>
                      <StyledTileThumb>
                        {thumbSrc ? (
                          <img src={thumbSrc} alt={img.label} />
                        ) : (
                          <span>IMG</span>
                        )}
                        <StyledTokenBadge>{img.token}</StyledTokenBadge>
                      </StyledTileThumb>
                      <StyledTileMeta>
                        <strong title={img.label}>{img.label}</strong>
                        <span>
                          {roleLabel(img.role)}
                          {img.stagedUrl ? ' · Staged ✓' : ''}
                        </span>
                      </StyledTileMeta>
                    </StyledImageTile>
                  );
                })}
              </StyledImageStrip>
            )}
          </div>

          {/* Reference Videos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StyledSectionLabel>
              <span>Reference Video sent to API ({videoCount})</span>
            </StyledSectionLabel>
            {videoCount === 0 ? (
              <StyledEmptyNote>No reference video attached.</StyledEmptyNote>
            ) : (
              snapshot.videos.map((vid) => {
                const thumbSrc = vid.thumbnailPath
                  ? studioMediaUrl(vid.thumbnailPath)
                  : '';
                const videoSrc = vid.mediaPath
                  ? studioMediaUrl(vid.mediaPath)
                  : vid.stagedUrl || '';
                const isPlaying = playingVideoIdx === vid.index;
                return (
                  <div
                    key={`${vid.index}-${vid.fileName}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <StyledVideoRow>
                      <StyledVideoThumb
                        type="button"
                        title={isPlaying ? 'Hide video preview' : 'Preview reference video'}
                        onClick={() =>
                          setPlayingVideoIdx((prev) =>
                            prev === vid.index ? null : vid.index,
                          )
                        }
                      >
                        {thumbSrc ? (
                          <img src={thumbSrc} alt={vid.label} />
                        ) : (
                          <span>▶</span>
                        )}
                        <StyledTokenBadge>{vid.token}</StyledTokenBadge>
                      </StyledVideoThumb>
                      <StyledVideoMeta>
                        <strong title={vid.label}>{vid.label}</strong>
                        <span>
                          {vid.fileName}
                          {vid.durationSec ? ` · ${Math.round(vid.durationSec)}s` : ''}
                          {vid.stagedUrl ? ' · Staged ✓' : ''}
                        </span>
                      </StyledVideoMeta>
                      {videoSrc && (
                        <StyledInlineAction
                          type="button"
                          onClick={() =>
                            setPlayingVideoIdx((prev) =>
                              prev === vid.index ? null : vid.index,
                            )
                          }
                        >
                          {isPlaying ? 'Hide' : 'Play'}
                        </StyledInlineAction>
                      )}
                    </StyledVideoRow>
                    {isPlaying && videoSrc && (
                      <StyledInlineVideo
                        src={videoSrc}
                        poster={thumbSrc || undefined}
                        controls
                        playsInline
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StyledSectionLabel>
              <span>Prompt sent to API</span>
              <StyledInlineAction
                type="button"
                onClick={() => void handleCopy(snapshot.prompt, 'prompt')}
              >
                {copiedKey === 'prompt' ? 'Copied ✓' : 'Copy'}
              </StyledInlineAction>
            </StyledSectionLabel>
            <StyledPromptBox>{snapshot.prompt || '(empty prompt)'}</StyledPromptBox>
          </div>

          {/* Raw Provider JSON Payload (also hidden until clicked) */}
          {snapshot.rawPayload && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <StyledSectionLabel>
                <StyledInlineAction
                  type="button"
                  onClick={() => setShowRawJson((prev) => !prev)}
                >
                  {showRawJson
                    ? '▾ Hide raw API JSON payload'
                    : '▸ Show exact raw API JSON payload'}
                </StyledInlineAction>
                {showRawJson && (
                  <StyledInlineAction
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        JSON.stringify(snapshot.rawPayload, null, 2),
                        'json',
                      )
                    }
                  >
                    {copiedKey === 'json' ? 'Copied ✓' : 'Copy JSON'}
                  </StyledInlineAction>
                )}
              </StyledSectionLabel>
              {showRawJson && (
                <StyledPromptBox>
                  {JSON.stringify(snapshot.rawPayload, null, 2)}
                </StyledPromptBox>
              )}
            </div>
          )}
        </StyledPanel>
      )}
    </StyledInspectorRoot>
  );
};
