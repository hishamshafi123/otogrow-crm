import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledActivityActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const StyledActivityFilters = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));

  input,
  select {
    width: 100%;
  }
`;

export const StyledActivityList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;

  > li {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 14px;
    overflow-wrap: anywhere;
    padding: 16px 18px;
    transition: border-color 150ms ease;
  }

  > li:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }

  time {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
`;

export const StyledActivityEntry = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

export const StyledActivityBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledActivityChanges = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  margin: 0;

  > div {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-left: 3px solid ${themeCssVariables.color.iris8};
    border-radius: 10px;
    padding: 10px 14px;
  }

  dt {
    font-size: 13px;
    font-weight: 600;
  }

  dd {
    display: grid;
    gap: ${themeCssVariables.spacing[3]};
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: ${themeCssVariables.spacing[1]} 0 0;
    white-space: pre-wrap;
  }

  small {
    display: block;
  }

  @media (max-width: 500px) {
    dd {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;
