import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledPerformanceViewNavigation = styled.nav`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 4px 14px -8px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  width: fit-content;

  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    padding: 7px 15px;
    text-decoration: none;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease,
      color 160ms ease;
  }

  a:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
  }

  a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 2px 8px -3px ${themeCssVariables.color.transparent.iris5};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }

  @media (pointer: coarse) {
    a {
      min-height: 44px;
    }
  }
`;

export const StyledPerformanceFilters = styled.form`
  align-items: end;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(150px, 210px)) auto;
  padding-top: 16px;

  label {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  input,
  select {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.font.family};
    font-size: 13px;
    letter-spacing: normal;
    min-height: 38px;
    padding: 7px 11px;
    text-transform: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  input:hover,
  select:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }

  input:focus,
  select:focus {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }

  > button {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border: 1px solid ${themeCssVariables.color.transparent.iris8};
    border-radius: 10px;
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 6px 16px -6px ${themeCssVariables.color.transparent.iris7};
    color: ${GRAY_SCALE_LIGHT.gray1};
    font-size: 12px;
    font-weight: 600;
    justify-self: end;
    min-height: 38px;
    padding: 7px 16px;
    transition:
      box-shadow 160ms ease,
      filter 160ms ease,
      transform 160ms ease;
  }

  > button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris9};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray4},
      0 8px 22px -6px ${themeCssVariables.color.transparent.iris8};
    color: ${GRAY_SCALE_LIGHT.gray1};
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  @media (prefers-reduced-motion: reduce) {
    > button {
      transition: none;
    }
    > button:hover:not(:disabled) {
      transform: none;
    }
  }

  @media (pointer: coarse) {
    > button {
      box-sizing: border-box;
      min-height: 44px;
    }
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceMetrics = styled.dl`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;

  > div {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
    box-sizing: border-box;
    min-width: 0;
    padding: 14px 16px;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      transform 160ms ease;
  }

  > div:hover {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.transparent.iris5};
    transform: translateY(-1px);
  }

  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    letter-spacing: -0.03em;
    margin: 7px 0 0;
    overflow-wrap: anywhere;
  }

  @media (prefers-reduced-motion: reduce) {
    > div {
      transition: none;
    }
    > div:hover {
      transform: none;
    }
  }

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    dd {
      font-size: 17px;
    }
  }

  @media (max-width: 360px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;

  > article {
    --card-border-glow: ${themeCssVariables.color.transparent.iris7};
    --card-dot-color: ${themeCssVariables.color.transparent.iris7};
    --card-glow: ${themeCssVariables.color.transparent.iris3};
    --spotlight-opacity: 0;
    --spotlight-x: 50%;
    --spotlight-y: 0%;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 14px;
    box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
    isolation: isolate;
    min-width: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    padding: 18px 20px;
    position: relative;
    transition:
      background-color 180ms ease,
      border-color 180ms ease,
      box-shadow 180ms ease;
  }

  > article::before {
    background-image:
      radial-gradient(
        280px circle at var(--spotlight-x) var(--spotlight-y),
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
      240px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 56%,
      transparent 100%
    );
    opacity: var(--spotlight-opacity);
    pointer-events: none;
    position: absolute;
    transition: opacity 240ms ease;
    -webkit-mask-image: radial-gradient(
      240px circle at var(--spotlight-x) var(--spotlight-y),
      ${themeCssVariables.font.color.primary} 0%,
      ${themeCssVariables.color.transparent.gray6} 56%,
      transparent 100%
    );
    z-index: 0;
  }

  > article::after {
    background: radial-gradient(
      240px circle at var(--spotlight-x) var(--spotlight-y),
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
    transition: opacity 240ms ease;
    -webkit-mask:
      linear-gradient(${themeCssVariables.font.color.primary} 0 0) content-box,
      linear-gradient(${themeCssVariables.font.color.primary} 0 0);
    -webkit-mask-composite: xor;
    z-index: 2;
  }

  > article > * {
    position: relative;
    z-index: 1;
  }

  > article:hover {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.border.color.medium};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 10px 26px -18px ${themeCssVariables.boxShadow.color};
  }

  @media (prefers-reduced-motion: reduce) {
    > article,
    > article::before,
    > article::after {
      transition: none;
    }
  }
`;

export const StyledPerformanceRecord = styled.div`
  display: grid;
  gap: 16px 24px;
  grid-template-columns: minmax(210px, 1.15fr) minmax(0, 2fr);
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceRecordMetrics = styled.dl`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;

  > div {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 10px;
    min-width: 0;
    padding: 10px 12px;
    transition: border-color 140ms ease;
  }

  > div:hover {
    border-color: ${themeCssVariables.color.transparent.iris5};
  }

  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  dd {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 14.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    margin: 5px 0 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

export const StyledPerformanceMuted = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
`;

export const StyledPerformanceFiltersDisclosure = styled.details`
  min-width: 0;
  > summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 44px;
  }
  @media (min-width: 701px) {
    > summary {
      display: none;
    }
  }
`;
