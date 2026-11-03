import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFounderFilters = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledFounderList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    overflow-wrap: anywhere;
    padding: 16px 0;
  }
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`;
export const StyledFounderHeading = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  justify-content: space-between;
  overflow-wrap: anywhere;
`;
export const StyledFounderEvidence = styled.dl`
  display: grid;
  gap: 6px 16px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin: 0;
  dd {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
  }
`;
