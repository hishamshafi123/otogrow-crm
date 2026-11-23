import { useRef } from 'react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type MetaLeadForm,
  type MetaLeadFormActivity,
} from '@/meta-lead-forms/metaLeadFormsGraphql';

const StyledTabs = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 8px 0 16px;
`;

const StyledTab = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 8px -6px ${themeCssVariables.boxShadow.color};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font: inherit;
  gap: 16px;
  min-width: 164px;
  padding: 14px 16px;
  position: relative;
  text-align: left;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    transform: translateY(-1px);
  }

  &[aria-selected='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet2} 100%
    );
    border-color: ${themeCssVariables.color.iris8};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 8px 20px -12px ${themeCssVariables.color.transparent.iris7};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }
`;

const StyledLabel = styled.span`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
  font-variant-numeric: tabular-nums;
`;

const StyledBadge = styled.span`
  align-self: flex-start;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.red9} 0%,
    ${themeCssVariables.color.orange9} 100%
  );
  border-radius: 999px;
  box-shadow: 0 4px 10px -4px ${themeCssVariables.color.red9};
  color: ${GRAY_SCALE_LIGHT.gray1};
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 20px;
  padding: 2px 7px;
  text-align: center;
`;

type MetaLeadFormTabsProps = {
  forms: MetaLeadForm[];
  activity: MetaLeadFormActivity[];
  selectedId?: string;
  onSelect: (formId: string) => void;
};

export const MetaLeadFormTabs = ({
  forms,
  activity,
  selectedId,
  onSelect,
}: MetaLeadFormTabsProps) => {
  const { t } = useLingui();
  // oxlint-disable-next-line twenty/no-state-useref -- DOM references enable keyboard focus without storing application state.
  const tabReferences = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <StyledTabs role="tablist" aria-label={t`Meta lead forms`}>
      {forms.map((form, index) => {
        const summary = activity.find((item) => item.formId === form.id);
        const unreadCount = summary?.unreadCount ?? 0;
        const totalCount = summary?.totalCount ?? 0;

        return (
          <StyledTab
            key={form.id}
            id={`meta-form-tab-${form.id}`}
            type="button"
            role="tab"
            aria-selected={form.id === selectedId}
            aria-controls="meta-form-leads-panel"
            aria-label={
              unreadCount > 0
                ? t`${form.name}, ${unreadCount} unread leads`
                : form.name
            }
            tabIndex={form.id === selectedId ? 0 : -1}
            ref={(element) => {
              tabReferences.current[index] = element;
            }}
            onClick={() => onSelect(form.id)}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === 'ArrowRight'
                  ? (index + 1) % forms.length
                  : event.key === 'ArrowLeft'
                    ? (index - 1 + forms.length) % forms.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? forms.length - 1
                        : null;
              if (nextIndex === null) return;
              event.preventDefault();
              onSelect(forms[nextIndex].id);
              tabReferences.current[nextIndex]?.focus();
            }}
          >
            <StyledLabel>
              <strong>{form.name}</strong>
              <StyledCount>
                {t`${totalCount} leads`}
                {!form.isActive && ` · ${t`Paused`}`}
              </StyledCount>
            </StyledLabel>
            {unreadCount > 0 && (
              <StyledBadge aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
              </StyledBadge>
            )}
          </StyledTab>
        );
      })}
    </StyledTabs>
  );
};
