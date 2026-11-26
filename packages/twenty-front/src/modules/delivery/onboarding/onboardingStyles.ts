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

export const StyledSetupShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 960px;
  min-width: 0;
  width: 100%;
`;

export const StyledSetupSteps = styled.ol`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  list-style: none;
  margin: 0;
  padding: 8px;
  width: 100%;

  li {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 11px;
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    font-size: 13px;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  li[data-completed='true'] {
    color: ${themeCssVariables.font.color.primary};
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

  button {
    align-items: center;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    display: flex;
    flex: 1 1 auto;
    font: inherit;
    gap: 8px;
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  button:disabled {
    cursor: default;
  }

  .step-index {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    height: 22px;
    justify-content: center;
    width: 22px;
  }

  li[aria-current='step'] .step-index {
    background: ${themeCssVariables.color.iris9};
    border-color: ${themeCssVariables.color.iris9};
    color: ${themeCssVariables.font.color.inverted};
  }

  li[data-completed='true'] .step-index {
    background: ${themeCssVariables.color.transparent.green3};
    border-color: ${themeCssVariables.color.green6};
    color: ${themeCssVariables.color.green11};
  }

  .step-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledSetupContextBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 14px;

  .ctx-item {
    align-items: center;
    display: inline-flex;
    font-size: 12.5px;
    gap: 6px;
    min-width: 0;
  }

  .ctx-label {
    color: ${themeCssVariables.font.color.tertiary};
    font-weight: 500;
  }

  .ctx-value {
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledSetupStageCard = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow: ${themeCssVariables.boxShadow.light};
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 24px;

  &:focus {
    outline: none;
  }
`;

export const StyledSetupStepHeader = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 14px;

  .step-eyebrow {
    color: ${themeCssVariables.color.iris11};
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.015em;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13.5px;
    margin: 2px 0 0;
  }
`;

export const StyledSetupSubCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px 18px;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14.5px;
    font-weight: 600;
    margin: 0;
  }
`;

export const StyledSetupChoiceGrid = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
`;

export const StyledSetupChoiceCard = styled.button`
  align-items: flex-start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris6};
  }

  &[data-selected='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris8};
    box-shadow: 0 0 0 1px ${themeCssVariables.color.transparent.iris5};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  strong {
    font-size: 14px;
    font-weight: 600;
  }

  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12.5px;
    line-height: 1.45;
  }
`;

export const StyledSetupToggleCard = styled.label`
  align-items: flex-start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: row !important;
  gap: 12px;
  padding: 14px 16px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris6};
  }

  &[data-checked='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris7};
  }

  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.iris9};
    flex: 0 0 auto;
    height: 17px;
    margin: 2px 0 0;
    width: 17px;
  }

  .toggle-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .toggle-title-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .toggle-badge {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.secondary};
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
  }

  .toggle-desc {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.45;
  }
`;

export const StyledSetupNotice = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-left: 3px solid ${themeCssVariables.color.iris9};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber1};
    border-color: ${themeCssVariables.color.amber5};
    border-left-color: ${themeCssVariables.color.amber9};
  }

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red1};
    border-color: ${themeCssVariables.color.red5};
    border-left-color: ${themeCssVariables.color.red9};
  }

  &[data-tone='success'] {
    background: ${themeCssVariables.color.transparent.green1};
    border-color: ${themeCssVariables.color.green5};
    border-left-color: ${themeCssVariables.color.green9};
  }

  p {
    margin: 0;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    font-size: 13px;
    line-height: 1.5;
  }
`;

export const StyledSetupDivider = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 12px;
  text-transform: uppercase;

  &::before,
  &::after {
    background: ${themeCssVariables.border.color.light};
    content: '';
    flex: 1 1 auto;
    height: 1px;
  }
`;

export const StyledSetupFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  padding-top: 16px;

  .footer-hint {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12.5px;
  }

  .footer-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-left: auto;
  }
`;

export const StyledSetupSummaryHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;

  h3 {
    font-size: 14px;
    font-weight: 650;
    margin: 0;
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
    color: ${themeCssVariables.font.color.primary};
    margin: 0;
    white-space: pre-wrap;
  }

  @media (min-width: 768px) {
    align-items: start;
    gap: 12px 20px;
    grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
  }
`;
