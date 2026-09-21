import { useRef } from 'react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type MetaLeadForm,
  type MetaLeadFormActivity,
} from '@/meta-lead-forms/metaLeadFormsGraphql';

const StyledTabs = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 12px 0;
`;
const StyledTab = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  font: inherit;
  gap: 16px;
  min-width: 150px;
  padding: 14px 16px;
  position: relative;
  text-align: left;

  &[aria-selected='true'] {
    border-color: ${themeCssVariables.color.blue};
    box-shadow: inset 0 -2px ${themeCssVariables.color.blue};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }
`;
const StyledLabel = styled.span`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;
const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
`;
const StyledBadge = styled.span`
  align-self: flex-start;
  background: ${themeCssVariables.color.red};
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  min-width: 18px;
  padding: 3px 6px;
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
