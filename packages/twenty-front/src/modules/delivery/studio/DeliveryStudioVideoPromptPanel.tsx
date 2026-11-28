import { styled } from '@linaria/react';
import { useEffect, useRef, useState } from 'react';
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCpu,
  IconEye,
  IconKey,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconRotate,
  IconSparkles,
  IconVideo,
  IconX,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type StudioAssetDTO,
  type StudioGeminiModelOptionDTO,
  type StudioProductAssetDTO,
  type StudioReferenceVideoDTO,
} from '@/delivery/studio/delivery-studio.types';

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  position: relative;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
`;

const StyledHeaderLeft = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;

  h4 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
  }
`;

const StyledModelChip = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 5px;
  max-width: 170px;
  overflow: hidden;
  padding: 2px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledStatusDot = styled.span<{ 'data-tone': 'live' | 'warn' | 'muted' }>`
  background: ${themeCssVariables.font.color.tertiary};
  border-radius: 999px;
  flex-shrink: 0;
  height: 6px;
  width: 6px;

  &[data-tone='live'] {
    background: ${themeCssVariables.color.green};
  }

  &[data-tone='warn'] {
    background: ${themeCssVariables.color.orange};
  }
`;

const StyledIconGroup = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 4px;
`;

const StyledIconBtn = styled.button<{ 'data-active'?: string }>`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 28px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.border.color.medium};
    color: ${themeCssVariables.font.color.primary};
  }

  &[data-active='true'] {
    background: ${themeCssVariables.background.transparent.blue};
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.color.blue};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledTinyCornerDot = styled.span`
  background: ${themeCssVariables.color.green};
  border: 1.5px solid ${themeCssVariables.background.primary};
  border-radius: 999px;
  height: 7px;
  position: absolute;
  right: 2px;
  top: 2px;
  width: 7px;
`;

const StyledStatusLine = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 11px;
  gap: 6px;
  justify-content: space-between;
  line-height: 1.35;
`;

const StyledPreviewSnippet = styled.button`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: -webkit-box;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  padding: 8px 10px;
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledEditorShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledPromptTextarea = styled.textarea`
  background: transparent;
  border: none;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  min-height: 136px;
  outline: none;
  padding: 10px 12px;
  resize: vertical;
  width: 100%;
`;

const StyledAiEditBar = styled.form`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 6px;
  padding: 6px 8px;

  input {
    background: transparent;
    border: none;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-family: inherit;
    font-size: 12px;
    min-width: 0;
    outline: none;
    padding: 3px 4px;

    &::placeholder {
      color: ${themeCssVariables.font.color.tertiary};
    }
  }
`;

const StyledAiSendBtn = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.blue};
  border: none;
  border-radius: 7px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  height: 26px;
  justify-content: center;
  padding: 0;
  width: 26px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

const StyledPopover = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  position: absolute;
  right: 12px;
  top: 44px;
  width: 310px;
  z-index: 40;
`;

const StyledPopoverHead = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding-bottom: 8px;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    font-weight: 600;
  }
`;

const StyledPopoverRow = styled.div`
  align-items: flex-start;
  display: flex;
  font-size: 11px;
  gap: 8px;
  justify-content: space-between;
`;

const StyledPopoverMeta = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 11px;
    font-weight: 600;
  }
`;

const StyledPopoverBadge = styled.span<{ 'data-tone'?: 'ok' | 'muted' }>`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  gap: 4px;
  padding: 2px 7px;

  &[data-tone='ok'] {
    border-color: ${themeCssVariables.color.green};
    color: ${themeCssVariables.color.green11};
  }
`;

const StyledAnalysisBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 11px;
  line-height: 1.45;
  max-height: 130px;
  overflow-y: auto;
  padding: 8px 10px;
  white-space: pre-wrap;
`;

const StyledPopoverActions = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
`;

const StyledPopoverActionBtn = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 500;
  gap: 8px;
  padding: 7px 10px;
  text-align: left;
  width: 100%;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.border.color.medium};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledToggleRow = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-size: 11px;
  justify-content: space-between;
  padding: 2px 0;

  input {
    cursor: pointer;
  }
`;

const StyledModelSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  margin-top: 4px;
  outline: none;
  padding: 5px 8px;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.border.color.medium};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const StyledCustomModelForm = styled.form`
  align-items: center;
  display: flex;
  gap: 5px;
  margin-top: 5px;

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-family: inherit;
    font-size: 11px;
    min-width: 0;
    outline: none;
    padding: 5px 8px;

    &:focus {
      border-color: ${themeCssVariables.border.color.medium};
    }
  }

  button {
    background: ${themeCssVariables.background.invertedPrimary};
    border: none;
    border-radius: 7px;
    color: ${themeCssVariables.font.color.inverted};
    cursor: pointer;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 9px;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }
`;

const FALLBACK_GEMINI_MODELS: StudioGeminiModelOptionDTO[] = [
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    badge: 'Auto-Latest',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    badge: 'Pro',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    badge: 'Fast',
  },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Balanced' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', badge: 'Lite' },
];

export type DeliveryStudioVideoPromptPanelProps = {
  geminiConfigured: boolean;
  geminiModelId: string | null;
  geminiSource: string | null;
  availableModels?: StudioGeminiModelOptionDTO[];
  savingModel?: boolean;
  onChangeModel?: (modelId: string) => void | Promise<void>;
  autoPromptWithGemini: boolean;
  onToggleAutoPrompt: (next: boolean) => void;
  prompt: string;
  onChangePrompt: (next: string) => void;
  onResetPrompt: () => void;
  promptExpanded: boolean;
  onTogglePromptExpanded: () => void;
  analyzingPrompt: boolean;
  refiningPrompt: boolean;
  onAnalyze: (opts?: {
    forceReanalyzeVideo?: boolean;
    forceReanalyzeImages?: boolean;
  }) => void;
  onRefinePrompt: (instruction: string) => Promise<boolean>;
  onOpenProviderSettings: () => void;
  selectedRefVideo: StudioReferenceVideoDTO | null;
  effectiveCharSheet: StudioAssetDTO | null;
  selectedProductAssets: StudioProductAssetDTO[];
  isStaleForMedia: boolean;
  promptMeta?: {
    source: string;
    modelId: string | null;
    summary: string;
    key: string;
    videoFromCache?: boolean;
    cachedImageCount?: number;
    newlyAnalyzedImageCount?: number;
    analyzedAt?: string;
  } | null;
};

export const DeliveryStudioVideoPromptPanel = ({
  geminiConfigured,
  geminiModelId,
  geminiSource,
  availableModels,
  savingModel,
  onChangeModel,
  autoPromptWithGemini,
  onToggleAutoPrompt,
  prompt,
  onChangePrompt,
  onResetPrompt,
  promptExpanded,
  onTogglePromptExpanded,
  analyzingPrompt,
  refiningPrompt,
  onAnalyze,
  onRefinePrompt,
  onOpenProviderSettings,
  selectedRefVideo,
  effectiveCharSheet,
  selectedProductAssets,
  isStaleForMedia,
  promptMeta,
}: DeliveryStudioVideoPromptPanelProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showSavedVideoText, setShowSavedVideoText] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [editToast, setEditToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopoverOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [popoverOpen]);

  const activeModelLabel =
    geminiModelId || promptMeta?.modelId || 'gemini-2.5-flash';
  const modelOptions =
    availableModels && availableModels.length > 0
      ? availableModels
      : FALLBACK_GEMINI_MODELS;
  const isKnownModel = modelOptions.some((m) => m.id === activeModelLabel);
  const hasSavedVideoAnalysis = Boolean(
    selectedRefVideo?.aiVideoAnalysis?.analysisText,
  );

  const totalImages =
    (effectiveCharSheet ? 1 : 0) + selectedProductAssets.length;
  const cachedImages =
    (effectiveCharSheet?.hasAiAnalysis ? 1 : 0) +
    selectedProductAssets.filter((a) => Boolean(a.hasAiAnalysis)).length;

  const handleSubmitQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = editInstruction.trim();
    if (!clean || !prompt.trim() || refiningPrompt) return;
    setEditToast(null);
    const ok = await onRefinePrompt(clean);
    if (ok) {
      setEditInstruction('');
      setEditToast(`Updated with ${activeModelLabel}`);
      window.setTimeout(() => setEditToast(null), 3200);
    }
  };

  const handleApplyCustomModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customModelInput.trim();
    if (!clean || !onChangeModel || savingModel) return;
    await onChangeModel(clean);
    setCustomModelMode(false);
    setCustomModelInput('');
  };

  return (
    <StyledCard ref={cardRef}>
      <StyledHeader>
        <StyledHeaderLeft>
          <h4>Video Prompt</h4>
          {geminiConfigured ? (
            <StyledModelChip
              type="button"
              onClick={() => setPopoverOpen((v) => !v)}
              title={`Prompting model: ${activeModelLabel} — click for analysis status & options`}
            >
              <StyledStatusDot
                data-tone={autoPromptWithGemini ? 'live' : 'muted'}
              />
              <span>{activeModelLabel}</span>
            </StyledModelChip>
          ) : (
            <StyledModelChip
              type="button"
              onClick={onOpenProviderSettings}
              title="Add Google Gemini API key to enable automatic media analysis"
            >
              <StyledStatusDot data-tone="warn" />
              <IconKey size={11} />
              <span>Add Gemini key</span>
            </StyledModelChip>
          )}
        </StyledHeaderLeft>

        <StyledIconGroup>
          <StyledIconBtn
            type="button"
            data-active={popoverOpen ? 'true' : 'false'}
            onClick={() => setPopoverOpen((v) => !v)}
            title="AI analysis status, saved video breakdown & re-analyze options"
            aria-label="AI analysis options"
          >
            <IconSparkles size={15} />
            {hasSavedVideoAnalysis && <StyledTinyCornerDot />}
          </StyledIconBtn>

          <StyledIconBtn
            type="button"
            data-active={promptExpanded ? 'true' : 'false'}
            onClick={onTogglePromptExpanded}
            title={promptExpanded ? 'Collapse prompt editor' : 'Edit prompt'}
            aria-label={promptExpanded ? 'Collapse prompt' : 'Edit prompt'}
          >
            {promptExpanded ? (
              <IconChevronUp size={15} />
            ) : (
              <IconPencil size={15} />
            )}
          </StyledIconBtn>

          {prompt.trim() && (
            <StyledIconBtn
              type="button"
              disabled={analyzingPrompt || refiningPrompt}
              onClick={onResetPrompt}
              title="Clear prompt"
              aria-label="Clear prompt"
            >
              <IconRotate size={14} />
            </StyledIconBtn>
          )}
        </StyledIconGroup>
      </StyledHeader>

      <StyledStatusLine>
        <span>
          {analyzingPrompt
            ? hasSavedVideoAnalysis
              ? 'Analyzing images (using saved video analysis)…'
              : 'Analyzing reference video & images…'
            : refiningPrompt
              ? `Applying edit with ${activeModelLabel}…`
              : editToast
                ? editToast
                : !autoPromptWithGemini
                  ? 'Auto-analysis off · manual/template prompt'
                  : isStaleForMedia
                    ? 'Media changed — open ✦ to re-analyze or edit below'
                    : prompt.trim()
                      ? `${hasSavedVideoAnalysis ? 'Video saved' : 'Prompt ready'}${totalImages > 0 ? ` · ${cachedImages}/${totalImages} images saved` : ''}`
                      : selectedRefVideo
                        ? 'Will analyze automatically once media is ready'
                        : 'Select a reference video to build prompt'}
        </span>
        {!promptExpanded && prompt.trim() && (
          <button
            type="button"
            onClick={onTogglePromptExpanded}
            style={{
              alignItems: 'center',
              background: 'none',
              border: 'none',
              color: themeCssVariables.color.blue,
              cursor: 'pointer',
              display: 'inline-flex',
              fontSize: 11,
              fontWeight: 500,
              gap: 2,
              padding: 0,
            }}
          >
            Edit <IconChevronDown size={12} />
          </button>
        )}
      </StyledStatusLine>

      {!promptExpanded && prompt.trim() && (
        <StyledPreviewSnippet type="button" onClick={onTogglePromptExpanded}>
          {prompt}
        </StyledPreviewSnippet>
      )}

      {promptExpanded && (
        <StyledEditorShell>
          <StyledPromptTextarea
            value={prompt}
            placeholder="Video prompt will appear here automatically once media is analyzed, or write your own…"
            onChange={(e) => onChangePrompt(e.target.value)}
          />
          <StyledAiEditBar onSubmit={(e) => void handleSubmitQuickEdit(e)}>
            <IconSparkles
              size={14}
              style={{
                color: themeCssVariables.font.color.tertiary,
                flexShrink: 0,
                marginLeft: 4,
              }}
            />
            <input
              type="text"
              value={editInstruction}
              disabled={!prompt.trim() || refiningPrompt || analyzingPrompt}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder={
                prompt.trim()
                  ? 'Tell AI what to edit in this prompt… (e.g. slower zoom, warmer lighting)'
                  : 'Generate or enter a prompt first to request AI edits…'
              }
            />
            <StyledAiSendBtn
              type="submit"
              disabled={
                !prompt.trim() ||
                !editInstruction.trim() ||
                refiningPrompt ||
                analyzingPrompt
              }
              title={`Update prompt with ${activeModelLabel}`}
              aria-label="Apply prompt edit"
            >
              <IconArrowUp size={14} />
            </StyledAiSendBtn>
          </StyledAiEditBar>
        </StyledEditorShell>
      )}

      {popoverOpen && (
        <StyledPopover role="dialog" aria-label="AI Prompt Analysis Details">
          <StyledPopoverHead>
            <strong>AI Prompting &amp; Media Cache</strong>
            <StyledIconBtn
              type="button"
              style={{ border: 'none', height: 22, width: 22 }}
              onClick={() => setPopoverOpen(false)}
              aria-label="Close"
            >
              <IconX size={14} />
            </StyledIconBtn>
          </StyledPopoverHead>

          <StyledPopoverRow>
            <IconCpu
              size={15}
              style={{
                color: themeCssVariables.font.color.tertiary,
                flexShrink: 0,
                marginTop: 1,
              }}
            />
            <StyledPopoverMeta>
              <strong>Prompting Model</strong>
              {geminiConfigured && onChangeModel ? (
                <>
                  <StyledModelSelect
                    aria-label="Prompting LLM model"
                    disabled={savingModel || analyzingPrompt || refiningPrompt}
                    value={customModelMode ? '__custom__' : activeModelLabel}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === '__custom__') {
                        setCustomModelMode(true);
                        setCustomModelInput(activeModelLabel);
                      } else {
                        setCustomModelMode(false);
                        void onChangeModel(next);
                      }
                    }}
                  >
                    {!isKnownModel && (
                      <option value={activeModelLabel}>
                        {activeModelLabel} (Custom)
                      </option>
                    )}
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.badge ? ` · ${m.badge}` : ''}
                      </option>
                    ))}
                    <option value="__custom__">Custom model ID…</option>
                  </StyledModelSelect>
                  {customModelMode && (
                    <StyledCustomModelForm
                      onSubmit={(e) => void handleApplyCustomModel(e)}
                    >
                      <input
                        type="text"
                        placeholder="e.g. gemini-flash-latest"
                        value={customModelInput}
                        disabled={savingModel}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={savingModel || !customModelInput.trim()}
                      >
                        {savingModel ? '…' : 'Use'}
                      </button>
                    </StyledCustomModelForm>
                  )}
                  <span>
                    {savingModel
                      ? 'Saving model…'
                      : `${activeModelLabel}${geminiSource ? ` · ${geminiSource.replace('_', ' ').toLowerCase()}` : ''}`}
                  </span>
                </>
              ) : (
                <span>
                  {geminiConfigured
                    ? `${activeModelLabel}${geminiSource ? ` · ${geminiSource.replace('_', ' ').toLowerCase()}` : ''}`
                    : 'Not configured'}
                </span>
              )}
            </StyledPopoverMeta>
            <StyledPopoverBadge data-tone={geminiConfigured ? 'ok' : 'muted'}>
              {geminiConfigured ? 'Live' : 'Off'}
            </StyledPopoverBadge>
          </StyledPopoverRow>

          <StyledPopoverRow>
            <IconVideo
              size={15}
              style={{
                color: themeCssVariables.font.color.tertiary,
                flexShrink: 0,
                marginTop: 1,
              }}
            />
            <StyledPopoverMeta>
              <strong>Reference Video Analysis</strong>
              <span>
                {hasSavedVideoAnalysis
                  ? `Saved in library (${selectedRefVideo?.aiVideoAnalysis?.modelId ?? activeModelLabel})`
                  : selectedRefVideo
                    ? 'Not saved yet — will save on first analysis'
                    : 'No reference video selected'}
              </span>
            </StyledPopoverMeta>
            {hasSavedVideoAnalysis && (
              <StyledIconBtn
                type="button"
                style={{ height: 24, width: 24 }}
                onClick={() => setShowSavedVideoText((v) => !v)}
                title="Preview saved reference video analysis"
              >
                <IconEye size={13} />
              </StyledIconBtn>
            )}
          </StyledPopoverRow>

          {showSavedVideoText &&
            selectedRefVideo?.aiVideoAnalysis?.analysisText && (
              <StyledAnalysisBox>
                {selectedRefVideo.aiVideoAnalysis.analysisText}
              </StyledAnalysisBox>
            )}

          <StyledPopoverRow>
            <IconPhoto
              size={15}
              style={{
                color: themeCssVariables.font.color.tertiary,
                flexShrink: 0,
                marginTop: 1,
              }}
            />
            <StyledPopoverMeta>
              <strong>Image Analysis (Angles &amp; Prints)</strong>
              <span>
                {totalImages > 0
                  ? `${cachedImages} of ${totalImages} saved in DB · auto-detects front/back/side`
                  : 'No images selected'}
              </span>
            </StyledPopoverMeta>
            <StyledPopoverBadge
              data-tone={
                totalImages > 0 && cachedImages === totalImages ? 'ok' : 'muted'
              }
            >
              {totalImages > 0 && cachedImages === totalImages && (
                <IconCheck size={10} />
              )}
              {cachedImages}/{totalImages}
            </StyledPopoverBadge>
          </StyledPopoverRow>

          <StyledToggleRow>
            <span>Auto-analyze once when media changes</span>
            <input
              type="checkbox"
              checked={autoPromptWithGemini}
              onChange={(e) => onToggleAutoPrompt(e.target.checked)}
            />
          </StyledToggleRow>

          <StyledPopoverActions>
            <StyledPopoverActionBtn
              type="button"
              disabled={analyzingPrompt || !selectedRefVideo}
              onClick={() => {
                setPopoverOpen(false);
                onAnalyze({
                  forceReanalyzeVideo: false,
                  forceReanalyzeImages: false,
                });
              }}
            >
              <IconSparkles size={14} />
              <span>
                {hasSavedVideoAnalysis
                  ? 'Analyze New Images & Build Prompt'
                  : 'Analyze Video & Images'}
              </span>
            </StyledPopoverActionBtn>

            <StyledPopoverActionBtn
              type="button"
              disabled={analyzingPrompt || !selectedRefVideo}
              onClick={() => {
                setPopoverOpen(false);
                onAnalyze({
                  forceReanalyzeVideo: true,
                  forceReanalyzeImages: false,
                });
              }}
            >
              <IconRefresh size={14} />
              <span>Re-analyze Video &amp; Save to DB</span>
            </StyledPopoverActionBtn>

            <StyledPopoverActionBtn
              type="button"
              disabled={analyzingPrompt || !selectedRefVideo}
              onClick={() => {
                setPopoverOpen(false);
                onAnalyze({
                  forceReanalyzeVideo: true,
                  forceReanalyzeImages: true,
                });
              }}
            >
              <IconRefresh size={14} />
              <span>Re-analyze Everything (Video + Images)</span>
            </StyledPopoverActionBtn>
          </StyledPopoverActions>
        </StyledPopover>
      )}
    </StyledCard>
  );
};
