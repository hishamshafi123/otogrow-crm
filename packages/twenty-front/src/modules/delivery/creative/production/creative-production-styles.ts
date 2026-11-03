import { styled } from '@linaria/react';

export const StyledCreativeBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledCreativeText = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  h2,
  h3,
  h4,
  p {
    overflow-wrap: anywhere;
  }
  input,
  select {
    box-sizing: border-box;
    max-width: 100%;
  }
`;
