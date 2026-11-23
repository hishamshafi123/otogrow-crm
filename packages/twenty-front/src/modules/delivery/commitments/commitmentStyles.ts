import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCommitmentActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

export const StyledCommitmentList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;

  > li {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    padding: 14px 16px;
    transition: border-color 150ms ease;
  }

  > li:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

export const StyledCommitmentCounts = styled.dl`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  margin: 8px 0;

  > div {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    padding: 12px 14px;
  }

  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    letter-spacing: -0.02em;
    margin: 4px 0 0;
  }
`;
