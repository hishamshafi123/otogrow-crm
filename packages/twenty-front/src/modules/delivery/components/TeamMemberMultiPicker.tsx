import { useId, useState } from 'react';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export type TeamPickerMember = {
  id: string;
  name: string;
  access?: string;
  roleLabel?: string;
};

type TeamMemberMultiPickerProps = {
  members: TeamPickerMember[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  label: string;
  helperText?: string;
  disabled?: boolean;
};

const StyledPickerContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
`;

const StyledPickerHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  justify-content: space-between;
`;

const StyledPickerTitleGroup = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13.5px;
    font-weight: 600;
  }
`;

const StyledCountBadge = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;

  &[data-active='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris6};
    color: ${themeCssVariables.color.iris11};
  }
`;

const StyledQuickActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledQuickButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  min-height: 28px;
  padding: 3px 10px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris6};
    color: ${themeCssVariables.color.iris11};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledSelectedChips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledChip = styled.li`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris2};
  border: 1px solid ${themeCssVariables.color.iris5};
  border-radius: 999px;
  color: ${themeCssVariables.color.iris11};
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 500;
  gap: 6px;
  max-width: 100%;
  padding: 3px 6px 3px 10px;

  &[data-unavailable='true'] {
    background: ${themeCssVariables.color.transparent.red2};
    border-color: ${themeCssVariables.color.red6};
    color: ${themeCssVariables.color.red11};
  }

  span {
    overflow-wrap: anywhere;
  }

  button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    font-size: 14px;
    height: 20px;
    justify-content: center;
    line-height: 1;
    padding: 0;
    width: 20px;
  }

  button:hover:not(:disabled) {
    background: ${themeCssVariables.color.transparent.iris3};
  }
`;

const StyledSearchRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1 1 auto;
    font-size: 13px;
    min-height: 36px;
    min-width: 0;
    padding: 6px 12px;
  }

  input:focus {
    border-color: ${themeCssVariables.color.iris8};
    outline: none;
  }
`;

const StyledMemberGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr));
  max-height: 270px;
  overflow-y: auto;
  padding: 2px;
`;

const StyledMemberCard = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: row !important;
  gap: 10px;
  min-height: 52px;
  min-width: 0;
  padding: 8px 12px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
  user-select: none;

  &:hover {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris6};
  }

  &[data-selected='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris7};
    box-shadow: 0 0 0 1px ${themeCssVariables.color.transparent.iris5};
  }

  &[data-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.iris9};
    cursor: pointer;
    flex: 0 0 auto;
    height: 16px;
    margin: 0;
    width: 16px;
  }
`;

const StyledAvatar = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris3};
  border: 1px solid ${themeCssVariables.color.iris5};
  border-radius: 999px;
  color: ${themeCssVariables.color.iris11};
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  height: 28px;
  justify-content: center;
  letter-spacing: 0.02em;
  width: 28px;
`;

const StyledMemberMeta = styled.span`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledMemberName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMemberRole = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledHelperText = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12.5px;
  margin: 0;
`;

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatMemberSubtitle = (
  member: TeamPickerMember,
  adminLabel: string,
  managerLabel: string,
  memberLabel: string,
): string => {
  const roleText = member.roleLabel?.trim();
  const accessText =
    member.access === 'ADMIN'
      ? adminLabel
      : member.access === 'MANAGER'
        ? managerLabel
        : member.access
          ? memberLabel
          : '';
  if (roleText && accessText) return `${roleText} · ${accessText}`;
  return roleText || accessText;
};

export const TeamMemberMultiPicker = ({
  members,
  selectedIds,
  onChange,
  label,
  helperText,
  disabled = false,
}: TeamMemberMultiPickerProps) => {
  const { t } = useLingui();
  const [query, setQuery] = useState('');
  const labelId = useId();
  const selectedSet = new Set(selectedIds);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const unavailableSelectedIds = selectedIds.filter(
    (id) => !memberById.has(id),
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = normalizedQuery
    ? members.filter((member) => {
        const haystack = [
          member.name,
          member.roleLabel ?? '',
          member.access ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : members;

  const allAvailableSelected =
    members.length > 0 && members.every((member) => selectedSet.has(member.id));

  const toggleMember = (memberId: string) => {
    if (disabled) return;
    if (selectedSet.has(memberId)) {
      onChange(selectedIds.filter((id) => id !== memberId));
    } else {
      onChange([...selectedIds, memberId]);
    }
  };

  const selectAllVisible = () => {
    if (disabled) return;
    const next = new Set(selectedIds);
    for (const member of filteredMembers) {
      next.add(member.id);
    }
    onChange(Array.from(next));
  };

  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  const adminLabel = t`Admin`;
  const managerLabel = t`Manager`;
  const memberLabel = t`Member`;

  return (
    <StyledPickerContainer role="group" aria-labelledby={labelId}>
      <StyledPickerHeader>
        <StyledPickerTitleGroup>
          <strong id={labelId}>{label}</strong>
          <StyledCountBadge data-active={selectedIds.length > 0 || undefined}>
            {selectedIds.length === 0 ? (
              <Trans>None selected</Trans>
            ) : (
              <Plural
                value={selectedIds.length}
                one="# selected"
                other="# selected"
              />
            )}
          </StyledCountBadge>
        </StyledPickerTitleGroup>
        {members.length > 0 && (
          <StyledQuickActions>
            {!allAvailableSelected && filteredMembers.length > 0 && (
              <StyledQuickButton
                type="button"
                disabled={disabled}
                onClick={selectAllVisible}
              >
                {normalizedQuery ? (
                  <Trans>Select matching</Trans>
                ) : (
                  <Trans>Select all</Trans>
                )}
              </StyledQuickButton>
            )}
            {selectedIds.length > 0 && (
              <StyledQuickButton
                type="button"
                disabled={disabled}
                onClick={clearAll}
              >
                <Trans>Clear</Trans>
              </StyledQuickButton>
            )}
          </StyledQuickActions>
        )}
      </StyledPickerHeader>

      {selectedIds.length > 0 && (
        <StyledSelectedChips aria-label={t`Selected teammates`}>
          {selectedIds.map((id) => {
            const member = memberById.get(id);
            const displayName =
              member?.name ?? t`Selected teammate unavailable`;
            return (
              <StyledChip
                key={id}
                data-unavailable={!member || undefined}
              >
                <span>{displayName}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t`Remove ${displayName}`}
                  onClick={() => toggleMember(id)}
                >
                  ×
                </button>
              </StyledChip>
            );
          })}
        </StyledSelectedChips>
      )}

      {members.length > 4 && (
        <StyledSearchRow>
          <input
            type="search"
            aria-label={t`Filter teammates`}
            placeholder={t`Search teammates by name or role…`}
            disabled={disabled}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <StyledQuickButton
              type="button"
              disabled={disabled}
              onClick={() => setQuery('')}
            >
              <Trans>Reset</Trans>
            </StyledQuickButton>
          )}
        </StyledSearchRow>
      )}

      {members.length === 0 && unavailableSelectedIds.length === 0 ? (
        <StyledHelperText>
          <Trans>No active workspace teammates available yet.</Trans>
        </StyledHelperText>
      ) : filteredMembers.length === 0 ? (
        <StyledHelperText>
          <Trans>No teammates match your search.</Trans>
        </StyledHelperText>
      ) : (
        <StyledMemberGrid>
          {filteredMembers.map((member) => {
            const isSelected = selectedSet.has(member.id);
            const subtitle = formatMemberSubtitle(
              member,
              adminLabel,
              managerLabel,
              memberLabel,
            );
            return (
              <StyledMemberCard
                key={member.id}
                data-selected={isSelected || undefined}
                data-disabled={disabled || undefined}
              >
                <input
                  type="checkbox"
                  aria-label={member.name}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggleMember(member.id)}
                />
                <StyledAvatar aria-hidden="true">
                  {getInitials(member.name)}
                </StyledAvatar>
                <StyledMemberMeta>
                  <StyledMemberName>{member.name}</StyledMemberName>
                  {subtitle && (
                    <StyledMemberRole>{subtitle}</StyledMemberRole>
                  )}
                </StyledMemberMeta>
              </StyledMemberCard>
            );
          })}
        </StyledMemberGrid>
      )}

      {helperText && <StyledHelperText>{helperText}</StyledHelperText>}
    </StyledPickerContainer>
  );
};
