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
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    padding: ${themeCssVariables.spacing[4]} 0;
    overflow-wrap: anywhere;
  }
  > li:first-child {
    border-top: 0;
  }
  time {
    color: ${themeCssVariables.font.color.secondary};
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
    border-left: 2px solid ${themeCssVariables.border.color.medium};
    padding-left: ${themeCssVariables.spacing[3]};
  }
  dt {
    font-weight: 500;
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
