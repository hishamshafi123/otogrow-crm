import { styled } from '@linaria/react';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledClientLayout = styled.div`
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(236px, 284px) minmax(0, 1fr);
  min-width: 0;

  @media (max-width: 960px) {
    gap: 20px;
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledClientCommandBar = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.primary};
  background-image:
    radial-gradient(
      440px circle at 0% 0%,
      ${themeCssVariables.color.transparent.iris2},
      transparent 58%
    ),
    radial-gradient(
      360px circle at 100% 100%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 60%
    );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 12px 28px -18px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  justify-content: space-between;
  padding: 16px 20px;
`;

export const StyledClientCommandMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    margin: 0;
  }
`;

export const StyledClientActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  > a {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    min-height: 36px;
    padding: 0 13px;
    text-decoration: none;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      color 140ms ease;
  }

  > a:hover {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.strong};
  }

  > a[data-primary='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.iris9} 0%,
      ${themeCssVariables.color.violet9} 100%
    );
    border-color: transparent;
    box-shadow: 0 8px 18px -10px ${themeCssVariables.color.iris9};
    color: ${GRAY_SCALE_LIGHT.gray1};
    font-weight: 600;
  }

  > a[data-primary='true']:hover {
    filter: brightness(1.06);
  }
`;

export const StyledClientDirectory = styled.aside`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    320px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 10px 26px -18px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 18px;

  .client-directory-toggle {
    display: none;
  }

  .client-directory-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  @media (max-width: 960px) {
    .client-directory-toggle {
      display: block;
      width: 100%;
    }

    &[data-collapsed='true'] .client-directory-content {
      display: none;
    }
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  ul {
    list-style: none;
    margin: 0;
    max-height: 520px;
    overflow: auto;
    padding: 0;
  }

  li + li {
    margin-top: 4px;
  }

  li a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 10px;
    color: inherit;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    overflow-wrap: anywhere;
    padding: 9px 11px;
    text-decoration: none;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  li a:hover {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.light};
  }

  li a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet2} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow: inset 3px 0 0 ${themeCssVariables.color.iris9};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }

  @media (max-width: 960px) {
    ul {
      max-height: 220px;
    }
  }
`;

export const StyledDirectoryOverviewLink = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding-bottom: 10px;

  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 10px;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    font-size: 13px;
    font-weight: 600;
    justify-content: space-between;
    padding: 9px 11px;
    text-decoration: none;
    transition:
      background-color 140ms ease,
      border-color 140ms ease;
  }

  a:hover {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.light};
  }

  a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.cyan2} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
  }
`;

export const StyledDirectoryBadge = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding: 2px 7px;

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red3};
    border-color: ${themeCssVariables.color.transparent.red6};
    color: ${themeCssVariables.color.red11};
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber3};
    border-color: ${themeCssVariables.color.transparent.amber6};
    color: ${themeCssVariables.color.amber11};
  }

  &[data-tone='accent'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
  }
`;

export const StyledDirectoryFooter = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
`;

export const StyledClientMain = styled.section`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;

  > header {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
  }

  h2 {
    overflow-wrap: anywhere;
  }
`;

export const StyledClientTabs = styled.nav`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 4px 14px -8px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  width: fit-content;

  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    padding: 8px 14px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
  }

  a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledClientKpiGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
`;

export const StyledClientKpiCard = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    220px circle at 100% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 62%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 8px 20px -16px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;

  &[data-tone='danger'] {
    background-image: radial-gradient(
      220px circle at 100% 0%,
      ${themeCssVariables.color.transparent.red3},
      transparent 62%
    );
    border-color: ${themeCssVariables.color.transparent.red5};
  }

  &[data-tone='warning'] {
    background-image: radial-gradient(
      220px circle at 100% 0%,
      ${themeCssVariables.color.transparent.amber3},
      transparent 62%
    );
    border-color: ${themeCssVariables.color.transparent.amber5};
  }

  &[data-tone='success'] {
    background-image: radial-gradient(
      220px circle at 100% 0%,
      ${themeCssVariables.color.transparent.green3},
      transparent 62%
    );
    border-color: ${themeCssVariables.color.transparent.green5};
  }

  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 500;
  }

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
  }
`;

export const StyledClientFilterBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  justify-content: space-between;
`;

export const StyledClientFilterPills = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const StyledClientFilterPill = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
  padding: 6px 12px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
  }

  &[data-active='true'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris7};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledClientPortfolioGrid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
`;

export const StyledClientCard = styled.article`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    280px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 55%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 10px 24px -18px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  overflow: hidden;
  padding: 18px 20px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: ${themeCssVariables.color.transparent.iris7};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
      0 18px 34px -20px ${themeCssVariables.boxShadow.color};
    transform: translateY(-2px);
  }

  &[data-attention='true'] {
    border-color: ${themeCssVariables.color.transparent.amber6};
  }

  &[data-overdue='true'] {
    border-color: ${themeCssVariables.color.transparent.red6};
  }
`;

export const StyledClientCardHeader = styled.div`
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
`;

export const StyledClientIdentity = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
  min-width: 0;
`;

export const StyledClientAvatar = styled.div`
  align-items: center;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.transparent.iris4} 0%,
    ${themeCssVariables.color.transparent.violet4} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.iris6};
  border-radius: 12px;
  color: ${themeCssVariables.color.iris11};
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  height: 40px;
  justify-content: center;
  letter-spacing: 0.02em;
  width: 40px;

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red3};
    border-color: ${themeCssVariables.color.transparent.red6};
    color: ${themeCssVariables.color.red11};
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber3};
    border-color: ${themeCssVariables.color.transparent.amber6};
    color: ${themeCssVariables.color.amber11};
  }
`;

export const StyledClientTitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }

  h3 a {
    color: inherit;
    text-decoration: none;
  }

  h3 a:hover {
    color: ${themeCssVariables.color.iris11};
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledClientTagRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const StyledClientTag = styled.span`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 9px;

  &[data-tone='iris'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris5};
    color: ${themeCssVariables.color.iris11};
  }

  &[data-tone='cyan'] {
    background: ${themeCssVariables.color.transparent.cyan2};
    border-color: ${themeCssVariables.color.transparent.cyan5};
    color: ${themeCssVariables.color.cyan11};
  }

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red3};
    border-color: ${themeCssVariables.color.transparent.red6};
    color: ${themeCssVariables.color.red11};
    font-weight: 600;
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber3};
    border-color: ${themeCssVariables.color.transparent.amber6};
    color: ${themeCssVariables.color.amber11};
    font-weight: 600;
  }

  &[data-tone='success'] {
    background: ${themeCssVariables.color.transparent.green3};
    border-color: ${themeCssVariables.color.transparent.green6};
    color: ${themeCssVariables.color.green11};
    font-weight: 600;
  }
`;

export const StyledClientMetricStrip = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 10px 12px;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
`;

export const StyledDueWorkList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const StyledDueWorkItem = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 8px 11px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.medium};
  }

  &[data-overdue='true'] {
    border-left: 3px solid ${themeCssVariables.color.red9};
  }

  &[data-due-soon='true'] {
    border-left: 3px solid ${themeCssVariables.color.amber9};
  }

  a {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a:hover {
    color: ${themeCssVariables.color.iris11};
    text-decoration: underline;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    flex-shrink: 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
`;

export const StyledClientCardFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 12px;

  a {
    color: ${themeCssVariables.color.iris11};
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const StyledClientSubtleButton = styled.button`
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.color.transparent.red2};
    border-color: ${themeCssVariables.color.transparent.red5};
    color: ${themeCssVariables.color.red11};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const StyledClientProject = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-wrap: anywhere;
  padding: 18px 20px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
    box-shadow: 0 8px 20px -14px ${themeCssVariables.boxShadow.color};
  }

  p {
    max-width: 68ch;
  }
`;

export const StyledClientBoundary = styled.fieldset`
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }

  > header {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
  }
`;

export const StyledRosterModalOverlay = styled.div`
  align-items: center;
  backdrop-filter: blur(6px);
  background: ${themeCssVariables.background.overlayPrimary};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 60;
`;

export const StyledRosterModalDialog = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    420px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 55%
  );
  border: 1px solid ${themeCssVariables.border.color.strong};
  border-radius: 20px;
  box-shadow: 0 28px 64px -20px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: min(82vh, 720px);
  max-width: 640px;
  padding: 22px 24px;
  width: 100%;
`;

export const StyledRosterModalHeader = styled.div`
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 18px;
    font-weight: 700;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    margin: 4px 0 0;
  }
`;

export const StyledRosterCandidateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
`;

export const StyledRosterCandidateRow = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 13px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.medium};
  }

  &[data-selected='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
  }

  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.iris9};
    flex-shrink: 0;
    height: 16px;
    width: 16px;
  }
`;

export const StyledRosterCandidateInfo = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: 10px;
  min-width: 0;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledRosterModalFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  justify-content: space-between;
  padding-top: 14px;
`;

export const StyledUndoBanner = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.color.transparent.iris6};
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 14px;

  p {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    margin: 0;
  }
`;
