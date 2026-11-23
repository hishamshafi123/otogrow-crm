import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCreativeBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledCreativeText = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;

  h2,
  h3,
  h4,
  p {
    overflow-wrap: anywhere;
  }

  input,
  select {
    box-sizing: border-box;
    max-width: 100%;
  }
`;

export const StyledCreativeToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-width: 0;
`;

export const StyledCreativeSearch = styled.div`
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  max-width: 620px;
`;

export const StyledCreativeFilters = styled.details`
  margin-top: 12px;
  min-width: 0;

  > summary {
    align-content: center;
    color: ${themeCssVariables.font.color.secondary};
    font-weight: 500;
    min-height: 40px;
    width: fit-content;
  }

  > div {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 14px;
    box-shadow: 0 8px 22px -16px ${themeCssVariables.boxShadow.color};
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
  }
`;

export const StyledCreativeFilterFields = styled.div`
  align-items: end;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
`;

export const StyledCreativeAppliedFilters = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;
  line-height: 1.5;
  margin-top: 8px;
`;

export const StyledCreativeQueue = styled.ul`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    420px circle at 0% 0%,
    ${themeCssVariables.color.transparent.violet2},
    transparent 52%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 12px 28px -20px ${themeCssVariables.boxShadow.color};
  list-style: none;
  margin: 0;
  overflow: hidden;
  padding: 0;
`;

export const StyledCreativeQueueItem = styled.li`
  align-items: start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  padding: 20px 22px;
  transition: background-color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }

  &:last-child {
    border-bottom: 0;
  }

  > div {
    min-width: 0;
  }

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }
`;

export const StyledCreativeFacts = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin: 0;
  min-width: 0;

  > div {
    flex: 1 1 120px;
    min-width: 0;
  }

  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    line-height: 1.5;
    margin-bottom: 2px;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

export const StyledCreativeTaskHeading = styled.header`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;

  > h2 {
    font-size: 24px;
    letter-spacing: -0.025em;
    line-height: 1.25;
  }
`;

export const StyledCreativeStageButtons = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 13px;
  box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  width: fit-content;

  > button {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  > button[aria-current='step'],
  > button[aria-current='step']:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }

  @media (max-width: 700px) {
    display: none;
  }
`;

export const StyledCreativeStageSelect = styled.label`
  && {
    display: none;
  }

  @media (max-width: 700px) {
    && {
      display: flex;
    }
  }
`;

export const StyledCreativeFormSection = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;

  &:first-child {
    border-top: 0;
    padding-top: 0;
  }

  h4 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    margin: 0;
  }
`;

export const StyledCreativeBriefFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  max-width: 880px;
  width: 100%;

  textarea {
    width: 100%;
  }

  textarea[data-compact='true'] {
    min-height: 44px;
  }
`;
