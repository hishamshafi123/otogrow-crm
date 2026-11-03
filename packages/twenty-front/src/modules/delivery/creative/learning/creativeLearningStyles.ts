import { styled } from '@linaria/react';
export const StyledLearningBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  width: 100%;
  &[hidden] {
    display: none;
  }
  input,
  textarea,
  select {
    box-sizing: border-box;
    max-width: 100%;
  }
  textarea {
    min-height: 90px;
    width: 100%;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  details {
    overflow-wrap: anywhere;
  }
  h2,
  h3,
  h4 {
    font-size: inherit;
    margin: 0;
  }
  p {
    margin: 0;
  }
`;
export const StyledLearningFacts = styled.dl`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow-wrap: anywhere;
  dt {
    color: var(--color-text-secondary);
    font-size: 12px;
  }
  dd {
    margin: 4px 0 0;
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledLearningText = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;
