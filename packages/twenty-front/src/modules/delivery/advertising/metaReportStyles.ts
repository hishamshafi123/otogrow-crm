import { styled } from '@linaria/react';

export const StyledReportFilters = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
`;
export const StyledReportActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
export const StyledReportStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;

  > button {
    align-self: flex-start;
    max-width: 100%;
  }
`;

export const StyledReportBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
`;
