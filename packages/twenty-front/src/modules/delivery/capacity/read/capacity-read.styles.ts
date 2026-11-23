import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCapacityWorkspace = styled.section`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const StyledCapacityIntroduction = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 76ch;
`;

export const StyledCapacityToolbar = styled.div`
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;

  label {
    max-width: 220px;
  }

  small {
    color: ${themeCssVariables.font.color.secondary};
    max-width: 46ch;
  }
`;

export const StyledCapacityMember = styled.details`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  padding: 14px 16px;
  transition: border-color 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }

  > summary {
    min-height: 40px;
  }
`;

export const StyledCapacityMemberHeading = styled.span`
  display: inline-grid;
  gap: 8px 20px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  vertical-align: top;
  width: calc(100% - 22px);

  strong {
    font-size: 15.5px;
  }

  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledCapacitySignals = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;

  [data-warning='true'] {
    background: ${themeCssVariables.color.transparent.orange3};
    border: 1px solid ${themeCssVariables.color.transparent.orange6};
    border-radius: 999px;
    color: ${themeCssVariables.color.orange11};
    font-size: 12px;
    font-weight: 600;
    padding: 1px 10px;
  }
`;

export const StyledCapacityDays = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

export const StyledCapacityDay = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
`;

export const StyledCapacityDayHeading = styled.div`
  align-items: baseline;
  display: grid;
  gap: 8px 20px;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 3fr);

  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledCapacityFacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  min-width: 0;

  > span {
    min-width: 0;
  }
`;

export const StyledCapacityBreakdown = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;

  > summary {
    min-height: 32px;
  }

  p + p {
    margin-top: 8px;
  }
`;

export const StyledCapacityAssignment = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 18px 20px;

  strong > a {
    font-size: 16px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
