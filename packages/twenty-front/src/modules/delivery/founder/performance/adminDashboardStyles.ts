import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAdminPanel = styled.section`
  --card-accent: ${themeCssVariables.color.iris9};
  --card-ambient: ${themeCssVariables.color.transparent.iris2};
  --card-border-glow: ${themeCssVariables.color.transparent.iris7};
  --card-dot-color: ${themeCssVariables.color.transparent.iris7};
  --card-glow: ${themeCssVariables.color.transparent.iris3};
  --spotlight-opacity: 0;
  --spotlight-x: 50%;
  --spotlight-y: 0%;
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    540px circle at 0% 0%,
    var(--card-ambient),
    transparent 52%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 1px 2px ${themeCssVariables.boxShadow.color},
    0 12px 32px -18px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  isolation: isolate;
  min-width: 0;
  overflow: hidden;
  padding: 22px 24px;
  position: relative;
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease;

  &::before {
    background-image:
      radial-gradient(
        340px circle at var(--spotlight-x) var(--spotlight-y),
        var(--card-glow),
        transparent 74%
      ),
      radial-gradient(circle, var(--card-dot-color) 1px, transparent 1px);
    background-size:
      100% 100%,
      16px 16px;
    border-radius: inherit;
    content: '';
    inset: 0;
    mask-image: radial-gradient(
      280px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 56%,
      transparent 100%
    );
    opacity: var(--spotlight-opacity);
    pointer-events: none;
    position: absolute;
    transition: opacity 280ms ease;
    -webkit-mask-image: radial-gradient(
      280px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 56%,
      transparent 100%
    );
    z-index: 0;
  }

  &::after {
    background: radial-gradient(
      260px circle at var(--spotlight-x) var(--spotlight-y),
      var(--card-border-glow),
      transparent 72%
    );
    border-radius: inherit;
    content: '';
    inset: 0;
    mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    mask-composite: exclude;
    opacity: var(--spotlight-opacity);
    padding: 1px;
    pointer-events: none;
    position: absolute;
    transition: opacity 280ms ease;
    -webkit-mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    -webkit-mask-composite: xor;
    z-index: 2;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 4px 12px -4px ${themeCssVariables.boxShadow.color},
      0 20px 44px -22px ${themeCssVariables.boxShadow.color};
  }

  &[data-tone='positive'] {
    --card-accent: ${themeCssVariables.color.jade9};
    --card-ambient: ${themeCssVariables.color.transparent.jade2};
    --card-border-glow: ${themeCssVariables.color.transparent.jade7};
    --card-dot-color: ${themeCssVariables.color.transparent.jade7};
    --card-glow: ${themeCssVariables.color.transparent.jade3};
  }

  &[data-tone='warning'] {
    --card-accent: ${themeCssVariables.color.orange9};
    --card-ambient: ${themeCssVariables.color.transparent.orange2};
    --card-border-glow: ${themeCssVariables.color.transparent.orange7};
    --card-dot-color: ${themeCssVariables.color.transparent.orange7};
    --card-glow: ${themeCssVariables.color.transparent.orange3};
  }

  &[data-tone='danger'] {
    --card-accent: ${themeCssVariables.color.red9};
    --card-ambient: ${themeCssVariables.color.transparent.red2};
    --card-border-glow: ${themeCssVariables.color.transparent.red7};
    --card-dot-color: ${themeCssVariables.color.transparent.red7};
    --card-glow: ${themeCssVariables.color.transparent.red3};
  }

  &[data-accent='cyan'] {
    --card-accent: ${themeCssVariables.color.cyan9};
    --card-ambient: ${themeCssVariables.color.transparent.cyan2};
    --card-border-glow: ${themeCssVariables.color.transparent.cyan7};
    --card-dot-color: ${themeCssVariables.color.transparent.cyan7};
    --card-glow: ${themeCssVariables.color.transparent.cyan3};
  }

  &[data-accent='violet'] {
    --card-accent: ${themeCssVariables.color.violet9};
    --card-ambient: ${themeCssVariables.color.transparent.violet2};
    --card-border-glow: ${themeCssVariables.color.transparent.violet7};
    --card-dot-color: ${themeCssVariables.color.transparent.violet7};
    --card-glow: ${themeCssVariables.color.transparent.violet3};
  }

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.3;
  }

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.35;
  }

  a {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 12px;
    font-weight: 500;
    gap: 5px;
    line-height: 1.2;
    padding: 5px 11px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      transform 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    transform: translateY(-1px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &::before,
    &::after,
    a {
      transition: none;
    }
    a:hover {
      transform: none;
    }
  }

  @media (max-width: 700px) {
    border-radius: 14px;
    padding: 16px;
  }
`;

export const StyledAdminSectionHeader = styled.div`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  justify-content: space-between;
  padding-bottom: 14px;
  small {
    display: block;
    margin-top: 3px;
  }
`;

export const StyledAdminEyebrow = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris2};
  border: 1px solid ${themeCssVariables.color.transparent.iris5};
  border-radius: 999px;
  color: ${themeCssVariables.color.iris11};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 10.5px;
  font-weight: 600;
  gap: 7px;
  letter-spacing: 0.08em;
  line-height: 1.2;
  margin-bottom: 10px;
  padding: 4px 11px;
  text-transform: uppercase;
`;

export const StyledLiveDot = styled.span`
  animation: live-dot-pulse 2.6s ease-in-out infinite;
  background: ${themeCssVariables.color.jade9};
  border-radius: 999px;
  box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.jade4};
  display: inline-block;
  flex: 0 0 auto;
  height: 6px;
  width: 6px;

  @keyframes live-dot-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 2px ${themeCssVariables.color.transparent.jade4};
      opacity: 1;
    }
    50% {
      box-shadow: 0 0 0 5px ${themeCssVariables.color.transparent.jade2};
      opacity: 0.78;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const StyledHeroBeam = styled.span`
  animation: hero-beam-sweep 8.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  background: linear-gradient(
    90deg,
    transparent 0%,
    ${themeCssVariables.color.iris9} 28%,
    ${themeCssVariables.color.cyan9} 54%,
    ${themeCssVariables.color.violet9} 78%,
    transparent 100%
  );
  border-radius: 999px;
  display: block;
  height: 2px;
  left: -35%;
  opacity: 0.9;
  pointer-events: none;
  position: absolute;
  top: 0;
  width: 42%;
  z-index: 3;

  @keyframes hero-beam-sweep {
    0% {
      opacity: 0;
      transform: translateX(0);
    }
    12% {
      opacity: 0.95;
    }
    85% {
      opacity: 0.85;
    }
    100% {
      opacity: 0;
      transform: translateX(340%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    left: 16px;
    opacity: 0.55;
    width: 140px;
  }
`;

export const StyledAdminHeroBar = styled.section`
  --card-border-glow: ${themeCssVariables.color.transparent.iris8};
  --card-dot-color: ${themeCssVariables.color.transparent.iris7};
  --card-glow: ${themeCssVariables.color.transparent.iris3};
  --spotlight-opacity: 0;
  --spotlight-x: 50%;
  --spotlight-y: 0%;
  background-color: ${themeCssVariables.background.primary};
  background-image:
    radial-gradient(
      ellipse 56% 88% at 6% -18%,
      ${themeCssVariables.color.transparent.iris4},
      transparent 64%
    ),
    radial-gradient(
      ellipse 50% 82% at 94% -12%,
      ${themeCssVariables.color.transparent.cyan3},
      transparent 62%
    ),
    radial-gradient(
      ellipse 44% 64% at 54% 118%,
      ${themeCssVariables.color.transparent.violet2},
      transparent 64%
    );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 20px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
    0 4px 16px -6px ${themeCssVariables.boxShadow.color},
    0 22px 52px -26px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  isolation: isolate;
  min-width: 0;
  overflow: hidden;
  padding: 26px 28px 22px;
  position: relative;

  &::before {
    background-image:
      radial-gradient(
        420px circle at var(--spotlight-x) var(--spotlight-y),
        var(--card-glow),
        transparent 74%
      ),
      radial-gradient(circle, var(--card-dot-color) 1px, transparent 1px);
    background-size:
      100% 100%,
      18px 18px;
    border-radius: inherit;
    content: '';
    inset: 0;
    mask-image: radial-gradient(
      340px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 58%,
      transparent 100%
    );
    opacity: var(--spotlight-opacity);
    pointer-events: none;
    position: absolute;
    transition: opacity 280ms ease;
    -webkit-mask-image: radial-gradient(
      340px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 58%,
      transparent 100%
    );
    z-index: 0;
  }

  &::after {
    background: radial-gradient(
      300px circle at var(--spotlight-x) var(--spotlight-y),
      var(--card-border-glow),
      transparent 72%
    );
    border-radius: inherit;
    content: '';
    inset: 0;
    mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    mask-composite: exclude;
    opacity: var(--spotlight-opacity);
    padding: 1px;
    pointer-events: none;
    position: absolute;
    transition: opacity 280ms ease;
    -webkit-mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    -webkit-mask-composite: xor;
    z-index: 2;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.15;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13.5px;
    margin-top: 6px;
    max-width: 640px;
  }

  @media (max-width: 700px) {
    border-radius: 16px;
    padding: 18px 16px;
    h2 {
      font-size: 22px;
    }
  }
`;

export const StyledAdminHeroTop = styled.div`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  justify-content: space-between;
  padding-bottom: 18px;
`;

export const StyledAdminControlRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  justify-content: space-between;
  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
  }
`;

export const StyledCurrencyPills = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  box-shadow: inset 0 1px 2px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 3px;
`;

export const StyledCurrencyPill = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  letter-spacing: 0.04em;
  min-height: 30px;
  padding: 5px 13px;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-pressed='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris8};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 4px 14px -3px ${themeCssVariables.color.transparent.iris7};
    color: ${GRAY_SCALE_LIGHT.gray1};
  }

  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledQuickLinks = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  a {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
      0 1px 2px ${themeCssVariables.boxShadow.color};
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 12px;
    font-weight: 500;
    gap: 7px;
    min-height: 34px;
    padding: 5px 13px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease,
      color 150ms ease,
      transform 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow: 0 4px 14px -6px ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    transform: translateY(-1px);
  }

  strong {
    background: ${themeCssVariables.color.transparent.iris3};
    border-radius: 999px;
    color: ${themeCssVariables.color.iris11};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
  }

  @media (prefers-reduced-motion: reduce) {
    a {
      transition: none;
    }
    a:hover {
      transform: none;
    }
  }

  @media (pointer: coarse) {
    a {
      box-sizing: border-box;
      min-height: 44px;
    }
  }
`;

export const StyledAdminExportButton = styled.button`
  align-items: center;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.iris9} 0%,
    ${themeCssVariables.color.blue9} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.iris8};
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
    0 6px 18px -5px ${themeCssVariables.color.transparent.iris7};
  color: ${GRAY_SCALE_LIGHT.gray1};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  letter-spacing: 0.03em;
  min-height: 34px;
  padding: 5px 14px;
  transition:
    box-shadow 160ms ease,
    filter 160ms ease,
    transform 160ms ease;

  &:hover:not(:disabled) {
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray4},
      0 10px 24px -6px ${themeCssVariables.color.transparent.iris8};
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover:not(:disabled) {
      transform: none;
    }
  }

  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledStatusPill = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  letter-spacing: 0.01em;
  line-height: 1.2;
  padding: 4px 10px;
  white-space: nowrap;

  &::before {
    background: ${themeCssVariables.font.color.tertiary};
    border-radius: 999px;
    content: '';
    display: inline-block;
    flex: 0 0 auto;
    height: 6px;
    width: 6px;
  }

  &[data-tone='positive'] {
    background: ${themeCssVariables.color.transparent.jade2};
    border-color: ${themeCssVariables.color.transparent.jade6};
    color: ${themeCssVariables.color.jade11};
    &::before {
      background: ${themeCssVariables.color.jade9};
      box-shadow: 0 0 0 2.5px ${themeCssVariables.color.transparent.jade4};
    }
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.orange2};
    border-color: ${themeCssVariables.color.transparent.orange6};
    color: ${themeCssVariables.color.orange11};
    &::before {
      background: ${themeCssVariables.color.orange9};
      box-shadow: 0 0 0 2.5px ${themeCssVariables.color.transparent.orange4};
    }
  }

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red2};
    border-color: ${themeCssVariables.color.transparent.red6};
    color: ${themeCssVariables.color.red11};
    &::before {
      background: ${themeCssVariables.color.red9};
      box-shadow: 0 0 0 2.5px ${themeCssVariables.color.transparent.red4};
    }
  }

  &[data-tone='accent'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    &::before {
      background: ${themeCssVariables.color.iris9};
      box-shadow: 0 0 0 2.5px ${themeCssVariables.color.transparent.iris4};
    }
  }
`;

export const StyledPulseGrid = styled.section`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  @media (max-width: 1040px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPulseCard = styled.article`
  --card-accent: ${themeCssVariables.color.iris9};
  --card-ambient: ${themeCssVariables.color.transparent.iris2};
  --card-border-glow: ${themeCssVariables.color.transparent.iris8};
  --card-dot-color: ${themeCssVariables.color.transparent.iris8};
  --card-glow: ${themeCssVariables.color.transparent.iris4};
  --spotlight-opacity: 0;
  --spotlight-x: 50%;
  --spotlight-y: 0%;
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    240px circle at 10% -10%,
    var(--card-ambient),
    transparent 74%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 6px -2px ${themeCssVariables.boxShadow.color},
    0 12px 28px -18px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  isolation: isolate;
  justify-content: space-between;
  min-width: 0;
  overflow: hidden;
  padding: 20px 22px 16px;
  position: relative;
  transition:
    border-color 200ms ease,
    box-shadow 220ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);

  &::before {
    background-image:
      radial-gradient(
        260px circle at var(--spotlight-x) var(--spotlight-y),
        var(--card-glow),
        transparent 74%
      ),
      radial-gradient(circle, var(--card-dot-color) 1px, transparent 1px);
    background-size:
      100% 100%,
      14px 14px;
    border-radius: inherit;
    content: '';
    inset: 0;
    mask-image: radial-gradient(
      220px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 54%,
      transparent 100%
    );
    opacity: var(--spotlight-opacity);
    pointer-events: none;
    position: absolute;
    transition: opacity 240ms ease;
    -webkit-mask-image: radial-gradient(
      220px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 54%,
      transparent 100%
    );
    z-index: 0;
  }

  &::after {
    background: radial-gradient(
      220px circle at var(--spotlight-x) var(--spotlight-y),
      var(--card-border-glow),
      transparent 70%
    );
    border-radius: inherit;
    content: '';
    inset: 0;
    mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    mask-composite: exclude;
    opacity: var(--spotlight-opacity);
    padding: 1.25px;
    pointer-events: none;
    position: absolute;
    transition: opacity 240ms ease;
    -webkit-mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    -webkit-mask-composite: xor;
    z-index: 2;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 8px 20px -8px ${themeCssVariables.boxShadow.color},
      0 22px 44px -22px ${themeCssVariables.boxShadow.color};
    transform: translateY(-2px);
  }

  &[data-featured='true'] {
    background-image:
      radial-gradient(
        280px circle at 8% -12%,
        ${themeCssVariables.color.transparent.iris4},
        transparent 68%
      ),
      radial-gradient(
        220px circle at 95% 110%,
        ${themeCssVariables.color.transparent.cyan2},
        transparent 70%
      );
    border-color: ${themeCssVariables.color.transparent.iris6};
  }

  &[data-accent='cyan'] {
    --card-accent: ${themeCssVariables.color.cyan9};
    --card-ambient: ${themeCssVariables.color.transparent.cyan3};
    --card-border-glow: ${themeCssVariables.color.transparent.cyan8};
    --card-dot-color: ${themeCssVariables.color.transparent.cyan8};
    --card-glow: ${themeCssVariables.color.transparent.cyan4};
  }

  &[data-accent='violet'] {
    --card-accent: ${themeCssVariables.color.violet9};
    --card-ambient: ${themeCssVariables.color.transparent.violet3};
    --card-border-glow: ${themeCssVariables.color.transparent.violet8};
    --card-dot-color: ${themeCssVariables.color.transparent.violet8};
    --card-glow: ${themeCssVariables.color.transparent.violet4};
  }

  &[data-tone='positive'] {
    --card-accent: ${themeCssVariables.color.jade9};
    --card-ambient: ${themeCssVariables.color.transparent.jade3};
    --card-border-glow: ${themeCssVariables.color.transparent.jade8};
    --card-dot-color: ${themeCssVariables.color.transparent.jade8};
    --card-glow: ${themeCssVariables.color.transparent.jade4};
    border-color: ${themeCssVariables.color.transparent.jade5};
  }

  &[data-tone='warning'] {
    --card-accent: ${themeCssVariables.color.orange9};
    --card-ambient: ${themeCssVariables.color.transparent.orange3};
    --card-border-glow: ${themeCssVariables.color.transparent.orange8};
    --card-dot-color: ${themeCssVariables.color.transparent.orange8};
    --card-glow: ${themeCssVariables.color.transparent.orange4};
    border-color: ${themeCssVariables.color.transparent.orange5};
  }

  &[data-tone='danger'] {
    --card-accent: ${themeCssVariables.color.red9};
    --card-ambient: ${themeCssVariables.color.transparent.red3};
    --card-border-glow: ${themeCssVariables.color.transparent.red8};
    --card-dot-color: ${themeCssVariables.color.transparent.red8};
    --card-glow: ${themeCssVariables.color.transparent.red4};
    border-color: ${themeCssVariables.color.transparent.red5};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &::before,
    &::after {
      transition: none;
    }
    &:hover {
      transform: none;
    }
  }
`;

export const StyledPulseLabelRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  > span:first-child {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
`;

export const StyledPulseValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 29px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.12;
  overflow-wrap: anywhere;
  padding: 4px 0 2px;
`;

export const StyledPulseFoot = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px 10px;
  justify-content: space-between;
  padding-top: 12px;

  a {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 11.5px;
    font-weight: 500;
    gap: 4px;
    padding: 4px 10px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      transform 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    transform: translateX(1px);
  }
`;

export const StyledAdminTwoColumn = styled.div`
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledAdminThreeColumn = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 680px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledChartFrame = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  background-image: radial-gradient(
    circle,
    ${themeCssVariables.color.transparent.gray4} 1px,
    transparent 1px
  );
  background-size: 18px 18px;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  box-shadow: inset 0 1px 2px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 18px 14px;

  svg {
    display: block;
    height: 176px;
    overflow: visible;
    width: 100%;
  }
`;

export const StyledChartAxisLabels = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  gap: 6px 8px;
  justify-content: space-between;
  padding-top: 12px;

  > span {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 8px;
    padding: 4px 9px;
    transition: border-color 140ms ease;
  }

  > span:hover {
    border-color: ${themeCssVariables.color.transparent.iris6};
  }
`;

export const StyledCostBarTrack = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  box-sizing: border-box;
  display: flex;
  gap: 3px;
  height: 12px;
  overflow: hidden;
  padding: 2px;
  width: 100%;
`;

export const StyledCostBarSegment = styled.span`
  border-radius: 999px;
  display: block;
  height: 100%;
  min-width: 6px;
  transition: filter 150ms ease;

  &:hover {
    filter: brightness(1.1);
  }

  &[data-segment='salary'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.iris9},
      ${themeCssVariables.color.blue9}
    );
  }
  &[data-segment='overhead'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.cyan9},
      ${themeCssVariables.color.sky9}
    );
  }
  &[data-segment='ai'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.amber9},
      ${themeCssVariables.color.orange9}
    );
  }
  &[data-segment='other'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.violet9},
      ${themeCssVariables.color.purple9}
    );
  }
`;

export const StyledCostLegend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    gap: 7px;
    padding: 4px 11px;
  }

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
  }
`;

export const StyledLegendDot = styled.span`
  border-radius: 999px;
  display: inline-block;
  flex: 0 0 auto;
  height: 8px;
  width: 8px;

  &[data-segment='salary'] {
    background: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.iris6};
  }
  &[data-segment='overhead'] {
    background: ${themeCssVariables.color.cyan9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.cyan6};
  }
  &[data-segment='ai'] {
    background: ${themeCssVariables.color.orange9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.orange6};
  }
  &[data-segment='other'] {
    background: ${themeCssVariables.color.violet9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.violet6};
  }
  &[data-segment='result'] {
    background: ${themeCssVariables.color.jade9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.jade6};
  }
  &[data-segment='revenue'] {
    background: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.iris6};
  }
  &[data-segment='cost'] {
    background: ${themeCssVariables.color.violet9};
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.violet6};
  }
`;

export const StyledCompactList = styled.ul`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 13px;
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
`;

export const StyledCompactListItem = styled.li`
  align-items: center;
  background: transparent;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  justify-content: space-between;
  padding: 12px 15px 12px 18px;
  position: relative;
  transition: background-color 150ms ease;

  &::before {
    background: transparent;
    border-radius: 999px;
    bottom: 9px;
    content: '';
    left: 6px;
    position: absolute;
    top: 9px;
    width: 3px;
  }

  &:first-child {
    border-top: 0;
  }

  &:hover {
    background: ${themeCssVariables.background.primary};
  }

  > div,
  > span,
  > a,
  > strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  > strong {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  &[data-tone='danger']::before {
    background: linear-gradient(
      180deg,
      ${themeCssVariables.color.red9},
      ${themeCssVariables.color.crimson9}
    );
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.red5};
  }

  &[data-tone='warning']::before {
    background: linear-gradient(
      180deg,
      ${themeCssVariables.color.amber9},
      ${themeCssVariables.color.orange9}
    );
    box-shadow: 0 0 8px ${themeCssVariables.color.transparent.orange5};
  }

  &[data-tone='positive']::before {
    background: linear-gradient(
      180deg,
      ${themeCssVariables.color.jade9},
      ${themeCssVariables.color.green9}
    );
  }
`;

export const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  box-sizing: border-box;
  height: 8px;
  margin-top: 6px;
  overflow: hidden;
  padding: 1px;
  width: 100%;
`;

export const StyledProgressFill = styled.div`
  background: linear-gradient(
    90deg,
    ${themeCssVariables.color.iris9} 0%,
    ${themeCssVariables.color.cyan9} 100%
  );
  border-radius: 999px;
  box-shadow: 0 0 10px ${themeCssVariables.color.transparent.iris5};
  height: 100%;
  transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);

  &[data-tone='warning'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.amber9} 0%,
      ${themeCssVariables.color.orange9} 100%
    );
    box-shadow: 0 0 10px ${themeCssVariables.color.transparent.orange5};
  }

  &[data-tone='danger'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.red9} 0%,
      ${themeCssVariables.color.crimson9} 100%
    );
    box-shadow: 0 0 10px ${themeCssVariables.color.transparent.red5};
  }

  &[data-tone='positive'] {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.jade9} 0%,
      ${themeCssVariables.color.green9} 100%
    );
    box-shadow: 0 0 10px ${themeCssVariables.color.transparent.jade5};
  }
`;

export const StyledFilterTabs = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 11px;
  box-shadow: inset 0 1px 2px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 3px;
`;

export const StyledFilterTab = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 600;
  gap: 6px;
  min-height: 28px;
  padding: 4px 11px;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease,
    color 150ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-pressed='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris8};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 3px 10px -2px ${themeCssVariables.color.transparent.iris7};
    color: ${GRAY_SCALE_LIGHT.gray1};
  }

  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledDataHealthDrawer = styled.details`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    420px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris1},
    transparent 60%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 10px -4px ${themeCssVariables.boxShadow.color};
  padding: 16px 20px;
  transition: border-color 180ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }

  > summary {
    align-items: center;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    flex-wrap: wrap;
    font-size: 13.5px;
    font-weight: 600;
    gap: 8px 12px;
    justify-content: space-between;
    list-style: none;
  }

  > summary::-webkit-details-marker {
    display: none;
  }
`;

export const StyledDirectoryAvatar = styled.span`
  align-items: center;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.transparent.iris3} 0%,
    ${themeCssVariables.color.transparent.violet4} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.iris6};
  border-radius: 11px;
  box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray3};
  color: ${themeCssVariables.color.iris11};
  display: inline-flex;
  flex: 0 0 auto;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 12px;
  font-weight: 600;
  height: 36px;
  justify-content: center;
  letter-spacing: 0.03em;
  width: 36px;

  &[data-accent='cyan'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.cyan3} 0%,
      ${themeCssVariables.color.transparent.blue4} 100%
    );
    border-color: ${themeCssVariables.color.transparent.cyan6};
    color: ${themeCssVariables.color.cyan11};
  }

  &[data-accent='violet'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.violet3} 0%,
      ${themeCssVariables.color.transparent.purple4} 100%
    );
    border-color: ${themeCssVariables.color.transparent.violet6};
    color: ${themeCssVariables.color.violet11};
  }

  &[data-accent='jade'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.jade3} 0%,
      ${themeCssVariables.color.transparent.green4} 100%
    );
    border-color: ${themeCssVariables.color.transparent.jade6};
    color: ${themeCssVariables.color.jade11};
  }

  &[data-accent='amber'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.amber3} 0%,
      ${themeCssVariables.color.transparent.orange4} 100%
    );
    border-color: ${themeCssVariables.color.transparent.orange6};
    color: ${themeCssVariables.color.orange11};
  }

  &[data-accent='blue'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.blue3} 0%,
      ${themeCssVariables.color.transparent.iris4} 100%
    );
    border-color: ${themeCssVariables.color.transparent.blue6};
    color: ${themeCssVariables.color.blue11};
  }
`;
