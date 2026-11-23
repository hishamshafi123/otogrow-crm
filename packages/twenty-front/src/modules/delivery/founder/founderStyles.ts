import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFounderFilters = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledFounderList = styled.ul`
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
`;

export const StyledFounderHeading = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  justify-content: space-between;
  overflow-wrap: anywhere;
`;

export const StyledFounderEvidence = styled.dl`
  display: grid;
  gap: 8px 16px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin: 0;

  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    margin: 3px 0 0;
    overflow-wrap: anywhere;
  }
`;
