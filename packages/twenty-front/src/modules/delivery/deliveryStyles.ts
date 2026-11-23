import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledDeliveryCanvas = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  background-image:
    radial-gradient(
      960px 420px at 8% -4%,
      ${themeCssVariables.color.transparent.iris2},
      transparent 60%
    ),
    radial-gradient(
      760px 360px at 94% 0%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 56%
    );
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  color-scheme: light;
  font-family: ${themeCssVariables.font.family};
  font-size: 14px;
  line-height: 1.5;
  min-height: 100%;
  overflow: auto;
  padding: 28px 32px 96px;

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
    letter-spacing: -0.03em;
    line-height: 1.18;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
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
    opacity: 0.52;
  }

  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }

  summary {
    cursor: pointer;
    min-height: 28px;
  }

  summary:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }

  details[open] > summary {
    margin-bottom: 16px;
  }

  input,
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    box-shadow: inset 0 1px 2px ${themeCssVariables.color.transparent.gray2};
    box-sizing: border-box;
    color: inherit;
    line-height: inherit;
    min-width: 0;
    padding: 9px 12px;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  input:hover:not(:disabled),
  select:hover:not(:disabled),
  textarea:hover:not(:disabled) {
    border-color: ${themeCssVariables.border.color.strong};
  }

  input:focus:not([type='checkbox']):not([type='radio']),
  select:focus,
  textarea:focus {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }

  input:not([type='checkbox']):not([type='radio']),
  select {
    min-height: 40px;
  }

  input:disabled,
  select:disabled,
  textarea:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    flex-direction: column;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
  }

  label:has(> input[type='checkbox']) {
    align-items: center;
    color: ${themeCssVariables.font.color.primary};
    flex-direction: row;
    gap: 8px;
  }

  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.iris9};
    flex: 0 0 auto;
    height: 16px;
    margin: 0;
    width: 16px;
  }

  a {
    color: ${themeCssVariables.color.iris11};
    overflow-wrap: anywhere;
    text-underline-offset: 3px;
    transition: color 140ms ease;
  }

  a:hover {
    color: ${themeCssVariables.color.iris12};
  }

  progress {
    accent-color: ${themeCssVariables.color.iris9};
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

  @media (prefers-reduced-motion: reduce) {
    a,
    input,
    select,
    textarea {
      transition: none;
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
  gap: 24px;
  min-width: 0;

  @media (max-width: 700px) {
    gap: 20px;
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
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    460px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 52%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 1px 2px ${themeCssVariables.boxShadow.color},
    0 12px 30px -20px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  isolation: isolate;
  min-width: 0;
  overflow: hidden;
  padding: 22px 24px;
  position: relative;
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease;

  &::before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      ${themeCssVariables.color.transparent.iris5} 30%,
      ${themeCssVariables.color.transparent.cyan5} 70%,
      transparent 100%
    );
    content: '';
    height: 1px;
    inset: 0 0 auto;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    transition: opacity 220ms ease;
    z-index: 2;
  }

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 4px 12px -4px ${themeCssVariables.boxShadow.color},
      0 18px 38px -22px ${themeCssVariables.boxShadow.color};
  }

  &:hover::before {
    opacity: 1;
  }

  @media (max-width: 700px) {
    padding: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &::before {
      transition: none;
    }
  }
`;

export const StyledDeliveryButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 1px 2px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: 13px;
  font-weight: 500;
  gap: 8px;
  justify-content: center;
  line-height: 1.4;
  max-width: 100%;
  min-height: 38px;
  overflow-wrap: anywhere;
  padding: 7px 14px;
  text-align: center;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    color 150ms ease,
    transform 150ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.strong};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 4px 12px -6px ${themeCssVariables.boxShadow.color};
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    background: ${themeCssVariables.background.tertiary};
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }

  &[data-variant='quiet'] {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: ${themeCssVariables.font.color.secondary};

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: ${themeCssVariables.background.tertiary};
      border-color: transparent;
      box-shadow: none;
      color: ${themeCssVariables.font.color.primary};
      transform: none;
    }
  }

  &[data-primary='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris8};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray4},
      0 6px 18px -8px ${themeCssVariables.color.iris9};
    color: ${GRAY_SCALE_LIGHT.gray1};
    font-weight: 600;

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: linear-gradient(
        135deg,
        ${themeCssVariables.color.iris10} 0%,
        ${themeCssVariables.color.violet10} 100%
      );
      border-color: ${themeCssVariables.color.iris10};
      box-shadow:
        inset 0 1px 0 ${themeCssVariables.color.transparent.gray5},
        0 10px 24px -10px ${themeCssVariables.color.iris9};
      color: ${GRAY_SCALE_LIGHT.gray1};
    }
  }

  .dark &[data-primary='true']:hover:not(:disabled),
  .dark &[data-primary='true']:active:not(:disabled) {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris10} 0%,
      ${themeCssVariables.color.violet10} 100%
    );
    border-color: ${themeCssVariables.color.iris11};
  }

  &[aria-current='page'],
  &[aria-pressed='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris7};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 2px 10px -4px ${themeCssVariables.color.transparent.iris5};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: linear-gradient(
        135deg,
        ${themeCssVariables.color.transparent.iris4} 0%,
        ${themeCssVariables.color.transparent.violet4} 100%
      );
      border-color: ${themeCssVariables.color.iris8};
    }
  }

  @media (max-width: ${MOBILE_VIEWPORT}px), (pointer: coarse) {
    min-height: 44px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;

export const StyledDeliveryTaskButton = styled.button`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    280px circle at 100% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 8px -6px ${themeCssVariables.boxShadow.color};
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 15px 16px;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
  width: 100%;

  &:hover:not(:disabled) {
    background-color: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.color.iris7};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 10px 24px -14px ${themeCssVariables.color.transparent.iris6};
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    background-color: ${themeCssVariables.color.transparent.iris3};
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;

export const StyledDeliveryBadge = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 11.5px;
  font-weight: 600;
  gap: 5px;
  letter-spacing: 0.01em;
  line-height: 1.4;
  max-width: 100%;
  padding: 2px 10px;

  &[data-state='APPROVED'] {
    background: ${themeCssVariables.color.transparent.jade3};
    border-color: ${themeCssVariables.color.transparent.jade6};
    color: ${themeCssVariables.color.jade11};
  }

  &[data-state='BLOCKED'],
  &[data-state='CHANGES_REQUESTED'] {
    background: ${themeCssVariables.color.transparent.orange3};
    border-color: ${themeCssVariables.color.transparent.orange6};
    color: ${themeCssVariables.color.orange11};
  }

  &[data-state='IN_REVIEW'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
  }
`;

export const StyledDeliveryBoard = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(6, minmax(236px, 1fr));
  overflow-x: auto;
  padding-bottom: 16px;
`;

export const StyledDeliveryDrawer = styled.dialog`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    480px circle at 100% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 55%
  );
  border: 0;
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  box-shadow:
    -16px 0 56px ${themeCssVariables.background.transparent.strong},
    -2px 0 12px ${themeCssVariables.boxShadow.color};
  color: ${themeCssVariables.font.color.primary};
  height: 100dvh;
  margin: 0 0 0 auto;
  max-height: 100dvh;
  max-width: 100%;
  padding: 0;
  width: min(660px, 100%);

  &::backdrop {
    backdrop-filter: blur(6px);
    background: ${themeCssVariables.background.overlaySecondary};
  }
`;

export const StyledDeliveryCelebration = styled.div`
  animation: approval-arrives 500ms ease-out;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.transparent.jade3} 0%,
    ${themeCssVariables.color.transparent.cyan3} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.jade7};
  border-radius: 14px;
  box-shadow: 0 10px 26px -16px ${themeCssVariables.color.transparent.jade7};
  color: ${themeCssVariables.color.jade11};
  font-weight: 500;
  padding: 16px 18px;

  @keyframes approval-arrives {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
