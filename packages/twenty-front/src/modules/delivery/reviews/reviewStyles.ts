import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
export const StyledReviewQueueCard = styled.section`
  min-width: 0;
`;
export const StyledReviewQueueHeading = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
  button {
    flex-shrink: 0;
  }
`;
export const StyledReviewQueueSummary = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  min-width: 0;
`;
export const StyledReviewQueueEntry = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 20px 0;
  h3 {
    font-size: 16px;
  }
`;
export const StyledReviewQueueAction = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  min-width: 0;
  > a,
  > label {
    align-items: center;
    display: inline-flex;
    min-height: 44px;
  }
`;
export const StyledReviewQueueFacts = styled.dl`
  display: grid;
  gap: 12px 24px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  max-width: 760px;
  min-width: 0;
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
  }
  dd {
    margin: 2px 0 0;
  }
  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledReviewQueueDetails = styled.details`
  min-width: 0;
  p {
    max-width: 76ch;
  }
  > p + p {
    margin-top: 8px;
  }
`;
export const StyledReviewQueueEmpty = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 76ch;
  padding: 24px 0;
`;
export const StyledReviewQueueItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  overflow-wrap: anywhere;
  padding: 16px 0;
  > a {
    align-items: center;
    display: inline-flex;
    min-height: 36px;
  }
  @media (max-width: 700px) {
    padding: 12px 0;
  }
`;
export const StyledReviewQueueStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 700px) {
    gap: 8px;
  }
`;
export const StyledAssignmentBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
