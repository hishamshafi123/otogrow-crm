import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledDeliveryCanvas = styled.div`
  background: ${themeCssVariables.background.secondary};
  box-sizing: border-box;
  color-scheme: light;
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.font.family};
  font-size: 14px;
  line-height: 1.5;
  min-height: 100%;
  overflow: auto;
  padding: 32px 32px 96px;
  .dark & {
    color-scheme: dark;
  }
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
    line-height: 1.2;
  }
  h2 {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.3px;
    line-height: 1.3;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }
  small {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    line-height: 1.5;
  }
  button,
  input,
  select,
  textarea {
    font-family: inherit;
    font-size: inherit;
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
    min-height: 28px;
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
    border: 1px solid ${themeCssVariables.color.gray10};
    border-radius: 8px;
    box-sizing: border-box;
    color: inherit;
    line-height: inherit;
    min-width: 0;
    padding: 9px 11px;
  }
  input:not([type='checkbox']):not([type='radio']),
  select {
    min-height: 40px;
  }
  input:disabled,
  select:disabled,
  textarea:disabled {
    cursor: not-allowed;
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
    text-underline-offset: 3px;
  }
  progress {
    accent-color: ${themeCssVariables.color.blue9};
    max-width: 100%;
  }
  @media (max-width: 700px) {
    padding: 16px;
    h1 {
      font-size: 24px;
    }
  }
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    // Floating navigation and the phone control must not cover the last action.
    padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  }
  @media (max-width: ${MOBILE_VIEWPORT}px), (pointer: coarse) {
    input:not([type='checkbox']):not([type='radio']),
    select,
    summary {
      min-height: 44px;
    }
  }
`;
export const StyledDeliveryStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;
export const StyledDeliverySectionStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-width: 0;
  @media (max-width: 700px) {
    gap: 24px;
  }
`;
export const StyledDeliveryCompactStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;
export const StyledDeliveryToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
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
  box-sizing: border-box;
  min-width: 0;
  padding: 20px;
  @media (max-width: 700px) {
    padding: 16px;
  }
`;
export const StyledDeliveryButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  box-sizing: border-box;
  color: inherit;
  display: inline-flex;
  font-weight: 500;
  gap: 8px;
  justify-content: center;
  line-height: 1.4;
  max-width: 100%;
  min-height: 40px;
  overflow-wrap: anywhere;
  padding: 8px 14px;
  text-align: center;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.strong};
  }
  &:active:not(:disabled) {
    background: ${themeCssVariables.background.tertiary};
  }
  &:focus-visible {
    outline: 3px solid ${themeCssVariables.color.blue11};
    outline-offset: 3px;
  }
  &[data-variant='quiet'] {
    background: transparent;
    border-color: transparent;
    color: ${themeCssVariables.font.color.secondary};
    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: ${themeCssVariables.background.tertiary};
      color: ${themeCssVariables.font.color.primary};
    }
  }
  &[data-primary='true'] {
    background: ${themeCssVariables.color.blue9};
    border-color: ${themeCssVariables.color.blue9};
    color: ${GRAY_SCALE_LIGHT.gray1};
    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: ${themeCssVariables.color.blue10};
      border-color: ${themeCssVariables.color.blue10};
      color: ${GRAY_SCALE_LIGHT.gray1};
    }
  }
  .dark &[data-primary='true']:hover:not(:disabled),
  .dark &[data-primary='true']:active:not(:disabled) {
    background: ${themeCssVariables.color.blue9};
    border-color: ${themeCssVariables.color.blue11};
  }
  &[aria-current='page'],
  &[aria-pressed='true'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: ${themeCssVariables.color.blue4};
      border-color: ${themeCssVariables.color.blue7};
    }
  }
  @media (max-width: ${MOBILE_VIEWPORT}px), (pointer: coarse) {
    min-height: 44px;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
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
  min-width: 0;
  padding: 16px;
  text-align: left;
  width: 100%;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.color.blue8};
  }
  &:active:not(:disabled) {
    background: ${themeCssVariables.color.blue3};
  }
`;
export const StyledDeliveryBadge = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border-radius: 6px;
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  max-width: 100%;
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
