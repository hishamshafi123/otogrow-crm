import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
export const StyledInboxBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  width: 100%;
  &[hidden] {
    display: none;
  }
  input,
  select,
  textarea {
    box-sizing: border-box;
    max-width: 100%;
  }
  textarea {
    min-height: 120px;
    width: 100%;
  }
  h2,
  h3,
  h4 {
    font-size: inherit;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
`;
export const StyledInboxLayout = styled.div`
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
  min-width: 0;
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledInboxMessage = styled.article`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 16px;
  white-space: pre-wrap;
`;
export const StyledInboxFacts = styled.dl`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow-wrap: anywhere;
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
  }
  dd {
    margin: 4px 0 0;
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledInboxGrant = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 0;
  strong {
    flex: 1 1 180px;
    overflow-wrap: anywhere;
  }
  label {
    align-items: center;
    display: flex;
    flex-direction: row;
    gap: 4px;
  }
`;
