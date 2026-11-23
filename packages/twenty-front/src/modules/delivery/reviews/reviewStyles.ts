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
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 18px 20px;
  transition: border-color 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }

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
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  dd {
    margin: 3px 0 0;
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
  background: ${themeCssVariables.background.secondary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 76ch;
  padding: 24px;
`;

export const StyledReviewQueueItem = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  overflow-wrap: anywhere;
  padding: 14px 16px;
  transition: border-color 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }

  > a {
    align-items: center;
    display: inline-flex;
    min-height: 36px;
  }

  @media (max-width: 700px) {
    padding: 12px;
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
