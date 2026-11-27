import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { CLIENT_TAG_PRESETS } from '@/delivery/client-workspace/client-hub.types';

const StyledTagBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  position: relative;
`;

const StyledTagChip = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 5px;
  line-height: 1.2;
  padding: 3px 9px;

  &[data-clothing='true'] {
    background: ${themeCssVariables.color.transparent.blue2};
    border-color: ${themeCssVariables.color.blue5};
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledRemoveTagButton = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  opacity: 0.7;
  padding: 0;

  &:hover {
    opacity: 1;
  }
`;

const StyledAddTagButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px dashed ${themeCssVariables.border.color.strong};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  gap: 4px;
  padding: 3px 9px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledTagPopover = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  gap: 10px;
  left: 0;
  min-width: 270px;
  padding: 12px;
  position: absolute;
  top: calc(100% + 6px);
  z-index: 40;
`;

const StyledPopoverTitle = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: 11px;
  font-weight: 600;
  justify-content: space-between;
  letter-spacing: 0.03em;
  text-transform: uppercase;
`;

const StyledPresetGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledPresetPill = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;

  &[data-active='true'] {
    background: ${themeCssVariables.color.blue};
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.font.color.inverted};
  }
`;

const StyledCustomRow = styled.form`
  display: flex;
  gap: 6px;

  input {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-size: 12px;
    min-width: 0;
    padding: 6px 8px;
  }

  button {
    background: ${themeCssVariables.background.tertiary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 10px;
  }
`;

type ClientTagEditorProps = {
  tags: string[];
  disabled?: boolean;
  onChange: (nextTags: string[]) => Promise<boolean> | void;
};

export const ClientTagEditor = ({
  tags,
  disabled,
  onChange,
}: ClientTagEditorProps) => {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const hasTag = (label: string) =>
    tags.some((t) => t.toLowerCase() === label.toLowerCase());

  const toggleTag = async (label: string) => {
    const exists = hasTag(label);
    const next = exists
      ? tags.filter((t) => t.toLowerCase() !== label.toLowerCase())
      : [...tags, label];
    await onChange(next);
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customInput.trim();
    if (!cleaned) return;
    if (!hasTag(cleaned)) {
      await onChange([...tags, cleaned]);
    }
    setCustomInput('');
  };

  return (
    <StyledTagBar>
      {tags.map((tag) => (
        <StyledTagChip
          key={tag}
          data-clothing={tag.toLowerCase() === 'clothing brand'}
        >
          <span>{tag}</span>
          <StyledRemoveTagButton
            type="button"
            disabled={disabled}
            aria-label={`Remove ${tag} tag`}
            onClick={() => void toggleTag(tag)}
          >
            ×
          </StyledRemoveTagButton>
        </StyledTagChip>
      ))}

      <StyledAddTagButton
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        + Tag
      </StyledAddTagButton>

      {open && (
        <StyledTagPopover>
          <StyledPopoverTitle>
            <span>Client tags</span>
            <StyledRemoveTagButton
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close tag picker"
            >
              Done
            </StyledRemoveTagButton>
          </StyledPopoverTitle>

          <StyledPresetGrid>
            {CLIENT_TAG_PRESETS.map((preset) => (
              <StyledPresetPill
                key={preset}
                type="button"
                data-active={hasTag(preset)}
                disabled={disabled}
                onClick={() => void toggleTag(preset)}
              >
                {hasTag(preset) ? `✓ ${preset}` : preset}
              </StyledPresetPill>
            ))}
          </StyledPresetGrid>

          <StyledCustomRow onSubmit={(e) => void handleAddCustom(e)}>
            <input
              type="text"
              placeholder="Custom tag…"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              disabled={disabled}
              maxLength={40}
            />
            <button type="submit" disabled={disabled || !customInput.trim()}>
              Add
            </button>
          </StyledCustomRow>
        </StyledTagPopover>
      )}
    </StyledTagBar>
  );
};
