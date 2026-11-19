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
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding-top: 12px;

  > summary {
    min-height: 44px;
  }
`;

export const StyledCapacityMemberHeading = styled.span`
  display: inline-grid;
  gap: 8px 20px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  vertical-align: top;
  width: calc(100% - 22px);

  strong {
    font-size: 16px;
  }
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledCapacitySignals = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;

  [data-warning='true'] {
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
`;

export const StyledCapacityDays = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const StyledCapacityDay = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 16px 0;
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
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 20px 0;

  strong > a {
    font-size: 16px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
