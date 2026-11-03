import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledReleaseBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }
  &[hidden] {
    display: none;
  }
`;
export const StyledReleaseItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 0;
`;
export const StyledReleaseFacts = styled.dl`
  display: grid;
  gap: 10px 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow-wrap: anywhere;
  dt {
    color: ${themeCssVariables.font.color.secondary};
  }
  dd {
    margin: 2px 0 0;
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledReleaseText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;
export const StyledReleaseActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
