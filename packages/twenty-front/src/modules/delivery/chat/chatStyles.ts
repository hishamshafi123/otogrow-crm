import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledChatBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledChatShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    0 12px 32px -18px ${themeCssVariables.boxShadow.color},
    0 2px 6px -2px ${themeCssVariables.boxShadow.color};
  display: grid;
  grid-template-columns: minmax(260px, 316px) minmax(0, 1fr);
  height: clamp(560px, calc(100vh - 180px), 840px);
  min-width: 0;
  overflow: hidden;
  position: relative;

  @media (max-width: 860px) {
    grid-template-columns: minmax(0, 1fr);
    height: clamp(540px, calc(100vh - 150px), 780px);
  }
`;

export const StyledChatSidebar = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;

  @media (max-width: 860px) {
    border-right: 0;

    &[data-mobile-hidden='true'] {
      display: none;
    }
  }
`;

export const StyledSidebarHeader = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
`;

export const StyledSidebarTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;

  h2 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin: 0;
  }
`;

export const StyledUnreadPill = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.iris9};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  height: 19px;
  justify-content: center;
  min-width: 19px;
  padding: 0 6px;
`;

export const StyledSearchWrap = styled.div`
  align-items: center;
  display: flex;
  position: relative;

  svg {
    color: ${themeCssVariables.font.color.tertiary};
    left: 10px;
    pointer-events: none;
    position: absolute;
  }

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 10px;
    font-size: 13px;
    padding: 7px 10px 7px 32px;
    width: 100%;
  }

  input:focus {
    border-color: ${themeCssVariables.color.iris8};
  }
`;

export const StyledSidebarFilterRow = styled.div`
  display: flex;
  gap: 6px;
`;

export const StyledFilterChip = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  padding: 4px 10px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-pressed='true'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris7};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledChatPeopleList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
`;

export const StyledPersonButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  gap: 11px;
  padding: 9px 10px;
  position: relative;
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow: 0 2px 8px -6px ${themeCssVariables.boxShadow.color};
  }

  &[aria-pressed='true']::before {
    background: ${themeCssVariables.color.iris9};
    border-radius: 999px;
    content: '';
    height: 22px;
    left: 0;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
  }
`;

export const StyledAvatar = styled.span`
  align-items: center;
  border-radius: 12px;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  height: 38px;
  justify-content: center;
  letter-spacing: 0.02em;
  position: relative;
  width: 38px;

  &[data-size='sm'] {
    border-radius: 9px;
    font-size: 11px;
    height: 28px;
    width: 28px;
  }

  &[data-tone='iris'] {
    background: ${themeCssVariables.color.transparent.iris3};
    color: ${themeCssVariables.color.iris11};
  }
  &[data-tone='blue'] {
    background: ${themeCssVariables.color.transparent.blue3};
    color: ${themeCssVariables.color.blue11};
  }
  &[data-tone='cyan'] {
    background: ${themeCssVariables.color.transparent.cyan3};
    color: ${themeCssVariables.color.cyan11};
  }
  &[data-tone='emerald'] {
    background: ${themeCssVariables.color.transparent.green3};
    color: ${themeCssVariables.color.green11};
  }
  &[data-tone='amber'] {
    background: ${themeCssVariables.color.transparent.amber3};
    color: ${themeCssVariables.color.amber11};
  }
  &[data-tone='violet'] {
    background: ${themeCssVariables.color.transparent.violet3};
    color: ${themeCssVariables.color.violet11};
  }
  &[data-tone='pink'] {
    background: ${themeCssVariables.color.transparent.pink3};
    color: ${themeCssVariables.color.pink11};
  }
  &[data-tone='orange'] {
    background: ${themeCssVariables.color.transparent.orange3};
    color: ${themeCssVariables.color.orange11};
  }
`;

export const StyledAvatarDot = styled.span`
  background: ${themeCssVariables.color.green9};
  border: 2px solid ${themeCssVariables.background.secondary};
  border-radius: 999px;
  bottom: -2px;
  height: 9px;
  position: absolute;
  right: -2px;
  width: 9px;

  &[data-active='false'] {
    background: ${themeCssVariables.color.gray8};
  }
`;

export const StyledPersonBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const StyledPersonTop = styled.div`
  align-items: baseline;
  display: flex;
  gap: 6px;
  justify-content: space-between;
`;

export const StyledPersonName = styled.span`
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StyledPersonTime = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
  font-size: 11px;
`;

export const StyledPersonBottom = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
  justify-content: space-between;
`;

export const StyledPersonPreview = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-unread='true'] {
    color: ${themeCssVariables.font.color.primary};
    font-weight: 500;
  }
`;

export const StyledPersonMetaTag = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StyledSidebarFooter = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  font-size: 12px;
  padding: 10px 12px;
`;

export const StyledTelegramStatus = styled.div`
  align-items: flex-start;
  background: ${themeCssVariables.color.transparent.green2};
  border: 1px solid ${themeCssVariables.color.transparent.green5};
  border-radius: 10px;
  color: ${themeCssVariables.color.green11};
  display: flex;
  gap: 8px;
  line-height: 1.4;
  padding: 8px 10px;

  &[data-ready='false'] {
    background: ${themeCssVariables.color.transparent.amber2};
    border-color: ${themeCssVariables.color.transparent.amber6};
    color: ${themeCssVariables.color.amber11};
  }

  a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
  }
`;

export const StyledChatMain = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  position: relative;

  @media (max-width: 860px) {
    &[data-mobile-hidden='true'] {
      display: none;
    }
  }
`;

export const StyledConversationHeader = styled.header`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 12px 18px;
`;

export const StyledHeaderIdentity = styled.div`
  align-items: center;
  display: flex;
  gap: 11px;
  min-width: 0;

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }
`;

export const StyledHeaderSubtext = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px;
`;

export const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const StyledIconButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  gap: 5px;
  height: 32px;
  justify-content: center;
  padding: 0 8px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-pressed='true'],
  &[data-active='true'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
  }

  &[data-danger='true']:hover {
    background: ${themeCssVariables.color.transparent.red3};
    color: ${themeCssVariables.color.red11};
  }
`;

export const StyledMobileBackButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  display: none;
  font-size: 12px;
  font-weight: 600;
  gap: 4px;
  padding: 5px 9px;

  @media (max-width: 860px) {
    display: inline-flex;
  }
`;

export const StyledProjectPillBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 9px 18px;
  scrollbar-width: thin;
`;

export const StyledProjectPill = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 500;
  gap: 7px;
  max-width: 240px;
  padding: 5px 12px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;

  &:hover {
    border-color: ${themeCssVariables.color.transparent.iris7};
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-selected='true'] {
    background: ${themeCssVariables.color.iris9};
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 3px 10px -4px ${themeCssVariables.color.transparent.iris8};
    color: ${themeCssVariables.font.color.inverted};
    font-weight: 600;
  }

  &[aria-selected='true'] span[data-pill-badge='true'] {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.color.iris11};
  }

  &[aria-selected='true'] span[data-project-dot='true'] {
    background: ${themeCssVariables.font.color.inverted};
  }
`;

export const StyledProjectPillLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StyledProjectDot = styled.span`
  border-radius: 999px;
  flex-shrink: 0;
  height: 8px;
  width: 8px;

  &[data-tone='iris'] {
    background: ${themeCssVariables.color.iris9};
  }
  &[data-tone='blue'] {
    background: ${themeCssVariables.color.blue9};
  }
  &[data-tone='cyan'] {
    background: ${themeCssVariables.color.cyan9};
  }
  &[data-tone='emerald'] {
    background: ${themeCssVariables.color.green9};
  }
  &[data-tone='amber'] {
    background: ${themeCssVariables.color.amber9};
  }
  &[data-tone='violet'] {
    background: ${themeCssVariables.color.violet9};
  }
  &[data-tone='pink'] {
    background: ${themeCssVariables.color.pink9};
  }
  &[data-tone='orange'] {
    background: ${themeCssVariables.color.orange9};
  }
`;

export const StyledPillCountBadge = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.iris9};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  font-size: 10.5px;
  font-weight: 700;
  height: 17px;
  justify-content: center;
  min-width: 17px;
  padding: 0 5px;
`;

export const StyledAddProjectSelect = styled.select`
  background: transparent;
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  max-width: 155px;
  padding: 4px 10px;
`;

export const StyledChatToolbarBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 18px;
`;

export const StyledPinnedBanner = styled.div`
  background: ${themeCssVariables.color.transparent.amber2};
  border-bottom: 1px solid ${themeCssVariables.color.transparent.amber5};
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px 18px;
`;

export const StyledPinnedItem = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: 12.5px;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 10px;
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.color.transparent.iris6};
  }
`;

export const StyledChatLog = styled.div`
  background: ${themeCssVariables.background.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 20px;
`;

export const StyledDayDivider = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: 11px;
  font-weight: 600;
  gap: 10px;
  margin: 10px 0 6px;

  &::before,
  &::after {
    background: ${themeCssVariables.border.color.light};
    content: '';
    flex: 1;
    height: 1px;
  }

  span {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 999px;
    padding: 2px 10px;
  }
`;

export const StyledUnreadDivider = styled.div`
  align-items: center;
  color: ${themeCssVariables.color.iris11};
  display: flex;
  font-size: 11px;
  font-weight: 700;
  gap: 10px;
  margin: 8px 0;
  text-transform: uppercase;

  &::before,
  &::after {
    background: ${themeCssVariables.color.transparent.iris6};
    content: '';
    flex: 1;
    height: 1px;
  }
`;

export const StyledMessageRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: 8px;
  margin-top: 8px;
  position: relative;

  &[data-grouped='true'] {
    margin-top: 2px;
  }

  &[data-outgoing='true'] {
    flex-direction: row-reverse;
  }

  &:hover > div[data-message-actions='true'],
  &:focus-within > div[data-message-actions='true'] {
    opacity: 1;
    pointer-events: auto;
  }
`;

export const StyledChatBubble = styled.article`
  align-self: flex-start;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px 16px 16px 4px;
  box-shadow: 0 2px 8px -6px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: min(76%, 620px);
  min-width: 120px;
  overflow-wrap: anywhere;
  padding: 10px 13px;
  position: relative;
  transition: border-color 140ms ease;

  &[data-outgoing='true'] {
    align-self: flex-end;
    background: linear-gradient(
      145deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    border-radius: 16px 16px 4px 16px;
  }

  &[data-highlighted='true'] {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 2px ${themeCssVariables.color.transparent.iris5};
  }

  &[data-deleted='true'] {
    font-style: italic;
    opacity: 0.72;
  }
`;

export const StyledBubbleHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  strong {
    font-size: 12px;
    font-weight: 600;
  }
`;

export const StyledMessageProjectTag = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 5px;
  max-width: 220px;
  padding: 2px 8px;

  &:hover {
    border-color: ${themeCssVariables.color.iris7};
    color: ${themeCssVariables.color.iris11};
  }
`;

export const StyledReplyQuote = styled.button`
  align-items: flex-start;
  background: ${themeCssVariables.background.transparent.light};
  border: 0;
  border-left: 3px solid ${themeCssVariables.color.iris8};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  gap: 2px;
  padding: 5px 8px;
  text-align: left;
  width: 100%;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 11.5px;
  }

  span {
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    display: -webkit-box;
    overflow: hidden;
  }
`;

export const StyledMessageText = styled.p`
  font-size: 13.8px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;

  a {
    color: ${themeCssVariables.color.iris11};
    text-decoration: underline;
    word-break: break-all;
  }
`;

export const StyledBubbleMeta = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 2px;
`;

export const StyledStatusBadge = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 3px;

  &[data-state='VIEWED'] {
    color: ${themeCssVariables.color.iris11};
    font-weight: 500;
  }

  &[data-state='SENT'] {
    color: ${themeCssVariables.color.blue11};
    font-weight: 500;
  }

  &[data-state='FAILED'],
  &[data-state='UNCERTAIN'] {
    color: ${themeCssVariables.color.red11};
  }
`;

export const StyledMessageActions = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-shadow: 0 4px 14px -6px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  gap: 2px;
  opacity: 0;
  padding: 3px 4px;
  pointer-events: none;
  transition: opacity 120ms ease;

  button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    height: 26px;
    justify-content: center;
    min-width: 26px;
    padding: 0 4px;
  }

  button:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }
`;

export const StyledReactionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
`;

export const StyledReactionPill = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  padding: 2px 7px;

  &[aria-pressed='true'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.iris7};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledAttachmentStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
`;

export const StyledImagePreviewButton = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: block;
  max-width: 300px;
  overflow: hidden;
  padding: 0;

  img {
    display: block;
    max-height: 220px;
    max-width: 100%;
    object-fit: cover;
  }
`;

export const StyledFileCard = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 11px;
  display: flex;
  gap: 10px;
  max-width: 320px;
  padding: 8px 10px;
`;

export const StyledFileIconBox = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris3};
  border-radius: 9px;
  color: ${themeCssVariables.color.iris11};
  display: inline-flex;
  flex-shrink: 0;
  height: 34px;
  justify-content: center;
  width: 34px;
`;

export const StyledFileMeta = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;

  strong {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

export const StyledVoicePlayer = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  gap: 10px;
  max-width: 320px;
  min-width: 230px;
  padding: 8px 11px;
`;

export const StyledVoicePlayBtn = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.iris9};
  border: 0;
  border-radius: 999px;
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  flex-shrink: 0;
  height: 32px;
  justify-content: center;
  width: 32px;

  &:hover {
    background: ${themeCssVariables.color.iris10};
  }
`;

export const StyledWaveformBars = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  flex: 1;
  gap: 2px;
  height: 28px;
  min-width: 100px;
`;

export const StyledWaveformBar = styled.span`
  background: ${themeCssVariables.border.color.strong};
  border-radius: 999px;
  flex: 1;
  min-width: 2px;
  transition: background-color 100ms ease;

  &[data-played='true'] {
    background: ${themeCssVariables.color.iris9};
  }
`;

export const StyledVoiceMeta = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;

  small {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
`;

export const StyledSpeedButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
`;

export const StyledComposerArea = styled.div`
  background: ${themeCssVariables.background.primary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px 12px;
`;

export const StyledComposerContextBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-left: 3px solid ${themeCssVariables.color.iris9};
  border-radius: 10px;
  display: flex;
  font-size: 12.5px;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 10px;
`;

export const StyledPendingAttachmentBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const StyledPendingChip = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  display: inline-flex;
  font-size: 12px;
  gap: 7px;
  max-width: 240px;
  padding: 5px 8px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledComposerDock = styled.div`
  align-items: flex-end;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  transition: border-color 140ms ease;

  &:focus-within {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.iris8};
  }

  textarea {
    background: transparent;
    border: 0;
    box-shadow: none;
    flex: 1;
    font-size: 13.8px;
    line-height: 1.45;
    max-height: 140px;
    min-height: 36px;
    outline: none;
    padding: 6px 4px;
    resize: none;
  }
`;

export const StyledSendButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.iris9};
  border: 0;
  border-radius: 10px;
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  height: 36px;
  justify-content: center;
  padding: 0 14px;
  transition: background-color 140ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.color.iris10};
  }
`;

export const StyledComposerFooter = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: 11.5px;
  gap: 10px;
  justify-content: space-between;
`;

export const StyledProjectContextSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 12px;
  font-weight: 500;
  max-width: 220px;
  padding: 3px 10px;
`;

export const StyledRecorderBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.transparent.red2};
  border: 1px solid ${themeCssVariables.color.transparent.red6};
  border-radius: 14px;
  display: flex;
  gap: 10px;
  padding: 8px 12px;
`;

export const StyledRecordingDot = styled.span`
  background: ${themeCssVariables.color.red9};
  border-radius: 999px;
  flex-shrink: 0;
  height: 10px;
  width: 10px;
`;

export const StyledDropOverlay = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris3};
  border: 2px dashed ${themeCssVariables.color.iris9};
  border-radius: 14px;
  color: ${themeCssVariables.color.iris11};
  display: flex;
  font-size: 15px;
  font-weight: 600;
  inset: 10px;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  z-index: 20;
`;

export const StyledEmptyState = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
  padding: 36px 24px;
  text-align: center;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 16px;
    margin: 0;
  }

  p {
    max-width: 380px;
  }
`;

export const StyledLightboxBackdrop = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.overlayPrimary};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 1000;
`;

export const StyledLightboxCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 90vh;
  max-width: min(92vw, 960px);
  overflow: hidden;
  padding: 14px;

  img {
    border-radius: 10px;
    max-height: 75vh;
    max-width: 100%;
    object-fit: contain;
  }
`;

export const StyledInlineAlert = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.transparent.red2};
  border: 1px solid ${themeCssVariables.color.transparent.red6};
  border-radius: 10px;
  color: ${themeCssVariables.color.red11};
  display: flex;
  flex-wrap: wrap;
  font-size: 12.5px;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 12px;
`;

export const StyledLoadMoreRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 4px 0 8px;
`;
