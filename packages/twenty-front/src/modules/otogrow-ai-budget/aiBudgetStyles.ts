import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAiBudgetActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
export const StyledAiBudgetList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 16px;
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding-bottom: 16px;
    overflow-wrap: anywhere;
  }
  > li:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
`;
export const StyledAiBudgetMetrics = styled.dl`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  margin: 0;
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
  }
  dd {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
    margin: 4px 0 0;
    overflow-wrap: anywhere;
  }
`;
