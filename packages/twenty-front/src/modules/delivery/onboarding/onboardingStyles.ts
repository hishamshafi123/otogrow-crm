import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledSetupBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledSetupSteps = styled.ol`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style-position: inside;
  margin: 0;
  padding: 6px;
  width: fit-content;

  li {
    border: 1px solid transparent;
    border-radius: 10px;
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    padding: 6px 12px;
  }

  li[aria-current='step'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledSetupSummary = styled.dl`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  overflow-wrap: anywhere;
  padding: 16px 18px;

  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12.5px;
    font-weight: 600;
  }

  dd {
    margin: 0;
    white-space: pre-wrap;
  }

  @media (min-width: 768px) {
    align-items: start;
    gap: 12px 20px;
    grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  }
`;
