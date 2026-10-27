import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCommitmentActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;
export const StyledCommitmentList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 14px 0;
  }
  > li:last-child {
    border-bottom: 0;
  }
`;
export const StyledCommitmentCounts = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin: 8px 0;
  dt {
    color: ${themeCssVariables.font.color.secondary};
  }
  dd {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
  }
`;
