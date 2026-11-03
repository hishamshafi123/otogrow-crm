import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledDeliveryCanvas = styled.div`
  background: ${themeCssVariables.background.secondary};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-size: 14px;
  line-height: 1.5;
  min-height: 100%;
  overflow: auto;
  padding: 32px;
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }
  h2 {
    font-size: 19px;
  }
  h3 {
    font-size: 15px;
  }
  small {
    color: ${themeCssVariables.font.color.secondary};
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid ${themeCssVariables.color.blue11};
    outline-offset: 3px;
  }
  summary {
    cursor: pointer;
    min-height: 24px;
  }
  summary:focus-visible {
    outline: 3px solid ${themeCssVariables.color.blue11};
    outline-offset: 3px;
  }
  details[open] > summary {
    margin-bottom: 16px;
  }
  input,
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    box-sizing: border-box;
    color: inherit;
    min-width: 0;
    padding: 9px 11px;
  }
  fieldset {
    border: 0;
    margin: 0;
    min-width: 0;
    padding: 0;
  }
  textarea {
    min-height: 100px;
    resize: vertical;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  label:has(> input[type='checkbox']) {
    align-items: center;
    flex-direction: row;
    gap: 8px;
  }
  input[type='checkbox'] {
    flex: 0 0 auto;
    height: 16px;
    margin: 0;
    width: 16px;
  }
  a {
    color: ${themeCssVariables.color.blue11};
    overflow-wrap: anywhere;
  }
  @media (max-width: 700px) {
    padding: 16px;
    h1 {
      font-size: 24px;
    }
  }
`;
export const StyledDeliveryStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;
export const StyledDeliveryRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
`;
export const StyledDeliveryGrid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
`;
export const StyledDeliveryCard = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  box-shadow: 0 4px 16px ${themeCssVariables.background.transparent.light};
  min-width: 0;
  padding: 22px;
`;
export const StyledDeliveryButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  color: inherit;
  font-weight: 500;
  padding: 8px 14px;
  &[data-primary='true'] {
    background: ${themeCssVariables.color.blue9};
    border-color: ${themeCssVariables.color.blue9};
    color: ${GRAY_SCALE_LIGHT.gray1};
  }
  &[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
`;
export const StyledDeliveryTaskButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  text-align: left;
  width: 100%;
  &:hover {
    border-color: ${themeCssVariables.color.blue8};
    box-shadow: 0 3px 12px ${themeCssVariables.background.transparent.blue};
  }
`;
export const StyledDeliveryBadge = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 6px;
  font-size: 12px;
  padding: 3px 8px;
  &[data-state='APPROVED'] {
    background: ${themeCssVariables.color.green3};
    color: ${themeCssVariables.color.green11};
  }
  &[data-state='BLOCKED'],
  &[data-state='CHANGES_REQUESTED'] {
    background: ${themeCssVariables.color.orange3};
    color: ${themeCssVariables.color.orange11};
  }
  &[data-state='IN_REVIEW'] {
    background: ${themeCssVariables.color.blue3};
    color: ${themeCssVariables.color.blue11};
  }
`;
export const StyledDeliveryBoard = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(6, minmax(220px, 1fr));
  overflow-x: auto;
  padding-bottom: 16px;
`;
export const StyledDeliveryDrawer = styled.dialog`
  background: ${themeCssVariables.background.primary};
  border: 0;
  border-left: 1px solid ${themeCssVariables.border.color.light};
  box-shadow: -12px 0 48px ${themeCssVariables.background.transparent.medium};
  color: ${themeCssVariables.font.color.primary};
  height: 100dvh;
  margin: 0 0 0 auto;
  max-height: 100dvh;
  max-width: 100%;
  padding: 0;
  width: min(640px, 100%);
  &::backdrop {
    background: ${themeCssVariables.background.overlaySecondary};
  }
`;
export const StyledDeliveryCelebration = styled.div`
  animation: approval-arrives 500ms ease-out;
  background: ${themeCssVariables.color.green3};
  border-radius: 12px;
  color: ${themeCssVariables.color.green11};
  padding: 16px;
  @keyframes approval-arrives {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
