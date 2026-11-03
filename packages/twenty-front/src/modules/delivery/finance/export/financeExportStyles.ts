import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledExportBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledExportFields = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledExportRow = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  overflow-wrap: anywhere;
  padding: 12px 0;
`;
export const StyledExportTotals = styled.dl`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin: 0;
  dd {
    font-weight: 600;
    margin: 4px 0 0;
    overflow-wrap: anywhere;
  }
`;
