import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledChatLayout = styled.div`
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  min-width: 0;

  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledChatPeople = styled.div`
  display: grid;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;

  button {
    justify-content: flex-start;
    text-align: left;
  }

  button[aria-pressed='true'] {
    border-color: ${themeCssVariables.color.iris7};
  }

  @media (max-width: 700px) {
    max-height: 180px;
  }
`;

export const StyledChatLog = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(50vh, 520px);
  min-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px;
`;

export const StyledChatBubble = styled.article`
  align-self: flex-start;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px 14px 14px 4px;
  box-shadow: 0 2px 8px -6px ${themeCssVariables.boxShadow.color};
  max-width: 85%;
  overflow-wrap: anywhere;
  padding: 12px 14px;

  &[data-outgoing='true'] {
    align-self: flex-end;
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    border-radius: 14px 14px 4px 14px;
  }

  p {
    margin: 6px 0;
    white-space: pre-wrap;
  }

  small {
    display: block;
  }
`;

export const StyledChatBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;
