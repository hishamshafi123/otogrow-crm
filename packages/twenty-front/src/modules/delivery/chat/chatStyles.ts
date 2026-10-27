import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledChatLayout = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  min-width: 0;
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledChatPeople = styled.div`
  display: grid;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
  button {
    text-align: left;
  }
  button[aria-pressed='true'] {
    border-color: ${themeCssVariables.color.blue};
  }
  @media (max-width: 700px) {
    max-height: 180px;
  }
`;
export const StyledChatLog = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(50vh, 520px);
  min-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
`;
export const StyledChatBubble = styled.article`
  align-self: flex-start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  max-width: 85%;
  overflow-wrap: anywhere;
  padding: 12px;
  &[data-outgoing='true'] {
    align-self: flex-end;
    background: ${themeCssVariables.background.tertiary};
  }
  p {
    margin: 8px 0;
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
