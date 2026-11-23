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
    min-height: 40px;
    width: fit-content;
  }

  > div {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
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
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const StyledCreativeQueueItem = styled.li`
  align-items: start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  padding: 20px;

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
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 2px;
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
    line-height: 1.3;
  }
`;

export const StyledCreativeStageButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  > button {
    background: transparent;
    border-color: transparent;
  }

  > button[aria-current='step'],
  > button[aria-current='step']:hover:not(:disabled) {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
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
