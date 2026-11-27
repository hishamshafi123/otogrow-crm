import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import {
  ANALYZE_DELIVERY_STUDIO_VIDEO_PROMPT,
  BATCH_GENERATE_DELIVERY_STUDIO_VIDEOS,
  GENERATE_DELIVERY_STUDIO_CHARACTER_SHEET,
  GENERATE_DELIVERY_STUDIO_VIDEO,
  GET_DELIVERY_STUDIO_WORKSPACE,
  IMPORT_DELIVERY_STUDIO_PRODUCT_FROM_URL,
  REMOVE_DELIVERY_STUDIO_PRODUCT_KIT_ASSET,
  SET_DELIVERY_STUDIO_ASSET_APPROVED,
  UPDATE_DELIVERY_STUDIO_PRODUCT_ASSETS,
  UPSERT_DELIVERY_STUDIO_PRODUCT_KIT,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  estimateModelCostUsd,
  formatUsdEstimate,
  type StudioApiInputImageRefDTO,
  type StudioApiInputVideoRefDTO,
  type StudioApiRequestSnapshotDTO,
  type StudioAssetDTO,
  type StudioProductKitDTO,
  type StudioProviderId,
  type StudioStageKey,
  type StudioWorkspacePayload,
  studioMediaUrl,
} from '@/delivery/studio/delivery-studio.types';
import { DeliveryStudioApiInputInspector } from '@/delivery/studio/DeliveryStudioApiInputInspector';
import { DeliveryStudioHooksStage } from '@/delivery/studio/DeliveryStudioHooksStage';
import {
  DeliveryStudioLibraryModal,
  type StudioLibraryMode,
} from '@/delivery/studio/DeliveryStudioLibraryModal';
import { DeliveryStudioPresetModal } from '@/delivery/studio/DeliveryStudioPresetModal';
import { DeliveryStudioProviderModal } from '@/delivery/studio/DeliveryStudioProviderModal';
import { DeliveryStudioQueueDock } from '@/delivery/studio/DeliveryStudioQueueDock';
import { DeliveryStudioSettingsDrawer } from '@/delivery/studio/DeliveryStudioSettingsDrawer';
import {
  closeStudioTab,
  createEmptyStudioTab,
  focusOrCreateClientTab,
  formatStudioTabLabel,
  loadStudioTabsState,
  saveStudioTabsState,
  type StudioTabDraft,
  type StudioTabsState,
} from '@/delivery/studio/studio-tabs-storage';
import { uploadStudioMultipart } from '@/delivery/studio/studio-upload';

const StyledShell = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 148px);
  overflow: hidden;
`;

const StyledTopBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 8px 14px;
`;

const StyledTabsRow = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
`;

const StyledTabPill = styled.div`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
  max-width: 210px;
  padding: 5px 10px;
  white-space: nowrap;

  &[data-active='true'] {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.border.color.medium};
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const StyledTabClose = styled.button`
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledIconButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  height: 30px;
  justify-content: center;
  padding: 0 10px;

  &:hover {
    border-color: ${themeCssVariables.font.color.primary};
  }

  &[data-pulse='true'] {
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledTopRight = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;

const StyledClientSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 12px;
  font-weight: 500;
  height: 30px;
  max-width: 220px;
  padding: 0 10px;
`;

const StyledClothingBadge = styled.span`
  background: ${themeCssVariables.color.transparent.blue2};
  border: 1px solid ${themeCssVariables.color.blue5};
  border-radius: 999px;
  color: ${themeCssVariables.color.blue};
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  white-space: nowrap;
`;

const StyledStepperBar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 10px 16px;
`;

const StyledStepButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 500;
  gap: 7px;
  padding: 6px 14px;
  transition: background 120ms ease, color 120ms ease;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }

  &[data-active='true'] {
    background: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.inverted};
    font-weight: 600;
  }
`;

const StyledStepNum = styled.span`
  font-size: 11px;
  opacity: 0.75;
`;

const StyledCanvas = styled.div`
  flex: 1;
  margin: 0 auto;
  max-width: 1240px;
  padding: 22px 24px 32px;
  width: 100%;
`;

const StyledTwoCol = styled.div`
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(340px, 430px) minmax(0, 1fr);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const StyledBuilderStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const StyledSlotCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
`;

const StyledSlotHeader = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;

  h4 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledUrlForm = styled.form`
  display: flex;
  gap: 6px;

  input {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-size: 12px;
    min-width: 0;
    padding: 8px 10px;
  }

  button {
    background: ${themeCssVariables.font.color.primary};
    border: none;
    border-radius: 8px;
    color: ${themeCssVariables.font.color.inverted};
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 0 13px;
    white-space: nowrap;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
`;

const StyledClothControls = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;

  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    flex: 1;
    font-size: 12px;
    min-width: 0;
    padding: 6px 8px;
  }
`;

const StyledSubtleBtn = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.font.color.primary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledNumberedGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
`;

const StyledClothThumb = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1.5px solid ${themeCssVariables.border.color.light};
  border-radius: 9px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  &[data-included='true'] {
    border-color: ${themeCssVariables.color.blue};
  }

  &[data-included='false'] {
    opacity: 0.45;
  }

  img {
    aspect-ratio: 1 / 1;
    cursor: pointer;
    display: block;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledImageNumBadge = styled.span`
  background: ${themeCssVariables.background.transparent.strong};
  border-radius: 5px;
  color: ${themeCssVariables.font.color.inverted};
  font-size: 10px;
  font-weight: 600;
  left: 5px;
  padding: 2px 6px;
  position: absolute;
  top: 5px;
`;

const StyledThumbActions = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: 3px 4px;

  button {
    background: transparent;
    border: none;
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px;

    &:hover:not(:disabled) {
      color: ${themeCssVariables.font.color.primary};
    }

    &:disabled {
      opacity: 0.3;
    }
  }
`;

const StyledUploadLabel = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  white-space: nowrap;

  &:hover {
    border-color: ${themeCssVariables.font.color.primary};
  }

  &[data-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  input {
    display: none;
  }
`;

const StyledPickerTrigger = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  display: flex;
  gap: 12px;
  padding: 10px;
  text-align: left;
  transition: border-color 120ms ease;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledPickerThumb = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  height: 46px;
  justify-content: center;
  overflow: hidden;
  width: 46px;

  img,
  video {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledPickerMeta = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledChangeLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11px;
  font-weight: 500;
`;

const StyledPrimaryCta = styled.button`
  align-items: center;
  background: ${themeCssVariables.font.color.primary};
  border: none;
  border-radius: 10px;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
  justify-content: center;
  padding: 12px 18px;
  width: 100%;

  &:hover:not(:disabled) {
    opacity: 0.92;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

const StyledGalleryColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const StyledGalleryHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
  }
`;

const StyledAssetGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
`;

const StyledAssetCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1.5px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &[data-selected='true'] {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledAssetMedia = styled.div`
  aspect-ratio: 3 / 4;
  background: ${themeCssVariables.background.tertiary};
  overflow: hidden;
  position: relative;
  width: 100%;

  &[data-video='true'] {
    aspect-ratio: 9 / 16;
  }

  img,
  video {
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledAssetFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledMetaChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const StyledMiniChip = styled.span`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 10px;
  padding: 2px 7px;
`;

const StyledLockedEnvPill = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 10px;

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledProgressCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
`;

const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  height: 5px;
  overflow: hidden;
  width: 100%;
`;

const StyledProgressFill = styled.div`
  background: ${themeCssVariables.color.blue};
  height: 100%;
  transition: width 240ms ease;
`;

const StyledEmptyState = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;
  padding: 44px 20px;
  text-align: center;
`;

const StyledMessage = styled.div`
  border-radius: 8px;
  font-size: 12px;
  padding: 9px 12px;

  &[data-tone='error'] {
    background: ${themeCssVariables.color.transparent.red2};
    color: ${themeCssVariables.color.red};
  }

  &[data-tone='info'] {
    background: ${themeCssVariables.color.transparent.blue2};
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledBatchRowCard = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 9px;
  display: grid;
  gap: 8px;
  grid-template-columns: 1.2fr 1fr 1fr auto;
  padding: 10px;

  select,
  input {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    padding: 6px 8px;
  }
`;

const StyledClientPicker = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 12px auto 0;
  max-width: 780px;
  width: 100%;
`;

const StyledClientPickerHeader = styled.div`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  justify-content: space-between;

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    margin: 4px 0 0;
  }

  a {
    color: ${themeCssVariables.color.blue};
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const StyledClientPickerSearch = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 9px 12px;
  width: 100%;
`;

const StyledClientPickerGrid = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
`;

const StyledClientPickerCard = styled.button`
  align-items: flex-start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  text-align: left;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.blue};
    transform: translateY(-1px);
  }
`;

const StyledClientPickerCardTop = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  width: 100%;
`;

const StyledClientPickerAvatar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  height: 34px;
  justify-content: center;
  width: 34px;
`;

const StyledClientPickerName = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
  }
`;

const StyledClientPickerTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const StyledClientPickerTag = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;

  &[data-clothing='true'] {
    background: ${themeCssVariables.color.transparent.blue2};
    border-color: ${themeCssVariables.color.blue5};
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledTogglePill = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 6px;
  padding: 4px 10px;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;

  &[data-on='true'] {
    background: ${themeCssVariables.color.transparent.blue2};
    border-color: ${themeCssVariables.color.blue5};
    color: ${themeCssVariables.color.blue};
  }
`;

const StyledToggleDot = styled.span`
  background: ${themeCssVariables.font.color.tertiary};
  border-radius: 999px;
  display: inline-block;
  height: 7px;
  width: 7px;

  &[data-on='true'] {
    background: ${themeCssVariables.color.blue};
  }
`;

const StyledPromptActionsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
`;

const StyledPromptHint = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 11px;
  line-height: 1.4;
`;

const StyledPromptTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  min-height: 132px;
  padding: 9px 10px;
  resize: vertical;
  width: 100%;
`;

const StyledCostCaption = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 11px;
  text-align: center;
`;

const StyledDismissBtn = styled.button`
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const isClothingTagLabel = (tag: string): boolean => {
  const normalized = tag.trim().toLowerCase();
  return (
    normalized === 'clothing brand' ||
    normalized === 'clothing' ||
    normalized === 'apparel'
  );
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const DeliveryAiStudioPage = () => {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabsState, setTabsState] = useState<StudioTabsState>(() =>
    loadStudioTabsState(),
  );
  const [pickerTabIds, setPickerTabIds] = useState<Set<string>>(() => new Set());
  const [clientPickerSearch, setClientPickerSearch] = useState('');

  // Overlays & modals
  const [libraryModal, setLibraryModal] = useState<StudioLibraryMode | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // Product URL import & manual upload state
  const [productUrlInput, setProductUrlInput] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Reference video duration detection, Gemini prompt analysis & dismissed failure cards
  const [detectedRefDurations, setDetectedRefDurations] = useState<
    Record<string, number>
  >({});
  const [analyzingPrompt, setAnalyzingPrompt] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [dismissedFailedJobIds, setDismissedFailedJobIds] = useState<
    Set<string>
  >(() => new Set());

  const [busyGenerate, setBusyGenerate] = useState(false);
  const [banner, setBanner] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    saveStudioTabsState(tabsState);
  }, [tabsState]);

  const activeTab = useMemo(
    () =>
      tabsState.tabs.find((t) => t.id === tabsState.activeTabId) ??
      tabsState.tabs[0],
    [tabsState],
  );

  const patchActiveTab = useCallback((patch: Partial<StudioTabDraft>) => {
    setTabsState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeTabId ? { ...t, ...patch } : t,
      ),
    }));
  }, []);

  // Deep-link support (?companyId=...&projectId=...)
  useEffect(() => {
    const deepCompany = searchParams.get('companyId');
    const deepProject = searchParams.get('projectId');
    const deepStage = searchParams.get('stage') as StudioStageKey | null;
    if (!deepCompany) return;
    setTabsState((prev) =>
      focusOrCreateClientTab(prev, {
        companyId: deepCompany,
        projectId: deepProject,
        stage: deepStage ?? undefined,
      }),
    );
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('companyId');
    nextParams.delete('projectId');
    nextParams.delete('stage');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const workspaceQuery = useQuery<{
    deliveryStudioWorkspace: StudioWorkspacePayload;
  }>(GET_DELIVERY_STUDIO_WORKSPACE, {
    variables: {
      companyId: activeTab.companyId,
      projectId: activeTab.projectId,
    },
    fetchPolicy: 'cache-and-network',
  });

  const workspace = workspaceQuery.data?.deliveryStudioWorkspace;

  // Keep active tab synced with Delivery Clients roster without overriding new client-picker tabs
  useEffect(() => {
    if (!workspace) return;
    if (workspace.clients.length === 0) return;

    if (!activeTab.companyId) {
      // Only auto-pick the first client on initial cold boot (single tab not opened via "+")
      if (tabsState.tabs.length === 1 && !pickerTabIds.has(activeTab.id)) {
        const first = workspace.clients[0];
        patchActiveTab({
          companyId: first.id,
          projectId: null,
          label: first.name,
        });
      }
      return;
    }

    const validClient = workspace.clients.find(
      (c) => c.id === activeTab.companyId,
    );
    if (!validClient) {
      // Saved tab pointed to a client removed from Clients section -> let user pick cleanly
      setPickerTabIds((prev) => {
        if (prev.has(activeTab.id)) return prev;
        const next = new Set(prev);
        next.add(activeTab.id);
        return next;
      });
      patchActiveTab({
        companyId: null,
        projectId: null,
        label: 'New Tab',
      });
    } else if (
      activeTab.label === 'New Studio Tab' ||
      activeTab.label === 'Client Studio' ||
      activeTab.label === 'New Tab'
    ) {
      patchActiveTab({
        label: formatStudioTabLabel(
          workspace.clients,
          activeTab.companyId,
          activeTab.projectId,
        ),
      });
    }
  }, [
    workspace,
    activeTab.id,
    activeTab.companyId,
    activeTab.projectId,
    activeTab.label,
    tabsState.tabs.length,
    pickerTabIds,
    patchActiveTab,
  ]);

  // Poll automatically when any job is active
  const activeJobs = useMemo(
    () =>
      (workspace?.jobs ?? []).filter((j) =>
        ['QUEUED', 'STAGING', 'PROCESSING', 'DOWNLOADING'].includes(j.status),
      ),
    [workspace?.jobs],
  );
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = window.setInterval(() => {
      void workspaceQuery.refetch();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [activeJobs.length, workspaceQuery]);

  // Mutations
  const [importFromUrlMutation] = useMutation<{
    importDeliveryStudioProductFromUrl: {
      productKit: StudioProductKitDTO;
      importedCount: number;
    };
  }>(IMPORT_DELIVERY_STUDIO_PRODUCT_FROM_URL);

  const [upsertProductMutation] = useMutation<{
    upsertDeliveryStudioProductKit: StudioProductKitDTO;
  }>(UPSERT_DELIVERY_STUDIO_PRODUCT_KIT);

  const [updateProductAssetsMutation] = useMutation(
    UPDATE_DELIVERY_STUDIO_PRODUCT_ASSETS,
  );
  const [removeProductAssetMutation] = useMutation(
    REMOVE_DELIVERY_STUDIO_PRODUCT_KIT_ASSET,
  );
  const [generateCharSheetMutation] = useMutation(
    GENERATE_DELIVERY_STUDIO_CHARACTER_SHEET,
  );
  const [generateVideoMutation] = useMutation(GENERATE_DELIVERY_STUDIO_VIDEO);
  const [batchVideosMutation] = useMutation(
    BATCH_GENERATE_DELIVERY_STUDIO_VIDEOS,
  );
  const [approveAssetMutation] = useMutation(
    SET_DELIVERY_STUDIO_ASSET_APPROVED,
  );
  const [analyzeVideoPromptMutation] = useMutation<{
    analyzeDeliveryStudioVideoPrompt: {
      prompt: string;
      source: string;
      modelId: string | null;
      summary: string;
      analyzedImageCount: number;
      referenceVideoDurationSec: number | null;
    };
  }>(ANALYZE_DELIVERY_STUDIO_VIDEO_PROMPT);

  // Derived data
  const clients = useMemo(
    () => workspace?.clients ?? [],
    [workspace?.clients],
  );
  const selectedClient = clients.find((c) => c.id === activeTab.companyId);
  const isClothingBrandClient = Boolean(
    activeTab.companyId &&
      (selectedClient?.isClothingBrand ??
        workspace?.selectedClientIsClothingBrand),
  );
  const effectiveLayout: 'CLOTHING' | 'GENERAL' =
    activeTab.layoutModeOverride === 'AUTO'
      ? isClothingBrandClient
        ? 'CLOTHING'
        : 'GENERAL'
      : activeTab.layoutModeOverride;

  const openClientIds = useMemo(
    () =>
      new Set(
        tabsState.tabs
          .filter((tab) => tab.id !== activeTab.id && Boolean(tab.companyId))
          .map((tab) => tab.companyId as string),
      ),
    [tabsState.tabs, activeTab.id],
  );

  const filteredPickerClients = useMemo(() => {
    const q = clientPickerSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [clients, clientPickerSearch]);

  const presets = useMemo(() => workspace?.presets ?? [], [workspace?.presets]);
  const avatarPresets = useMemo(
    () => presets.filter((p) => p.kind === 'CASTING_PERSONA'),
    [presets],
  );
  const environmentPresets = useMemo(
    () => presets.filter((p) => p.kind === 'ENVIRONMENT'),
    [presets],
  );
  const characterPresets = useMemo(
    () => presets.filter((p) => p.kind === 'CHARACTER_SHEET'),
    [presets],
  );
  const videoPresets = useMemo(
    () => presets.filter((p) => p.kind === 'VIDEO_GENERATION'),
    [presets],
  );
  const hookPresets = useMemo(
    () => presets.filter((p) => p.kind === 'TEXT_HOOK'),
    [presets],
  );

  const imageModels = useMemo(
    () => (workspace?.catalog ?? []).filter((m) => m.kind === 'IMAGE'),
    [workspace?.catalog],
  );
  const videoModels = useMemo(
    () => (workspace?.catalog ?? []).filter((m) => m.kind === 'VIDEO'),
    [workspace?.catalog],
  );

  const currentImageModel = useMemo(
    () => imageModels.find((m) => m.key === activeTab.imageModelKey),
    [imageModels, activeTab.imageModelKey],
  );
  const currentVideoModel = useMemo(
    () => videoModels.find((m) => m.key === activeTab.videoModelKey),
    [videoModels, activeTab.videoModelKey],
  );
  const compareVideoModel = useMemo(
    () =>
      activeTab.compareMode &&
      activeTab.compareModelKey !== activeTab.videoModelKey
        ? videoModels.find((m) => m.key === activeTab.compareModelKey)
        : undefined,
    [
      videoModels,
      activeTab.compareMode,
      activeTab.compareModelKey,
      activeTab.videoModelKey,
    ],
  );

  const garments = useMemo(
    () => workspace?.productKits ?? [],
    [workspace?.productKits],
  );
  const selectedGarment = useMemo(
    () =>
      garments.find((g) => g.id === activeTab.selectedProductKitId) ??
      garments[0] ??
      null,
    [garments, activeTab.selectedProductKitId],
  );

  // Keep included image IDs synced when switching garments
  const includedAssetIdSet = useMemo(() => {
    if (!selectedGarment) return new Set<string>();
    const validIds = selectedGarment.assets.map((a) => a.id);
    if (activeTab.selectedProductAssetIds.length === 0) {
      return new Set(validIds);
    }
    const intersection = activeTab.selectedProductAssetIds.filter((id) =>
      validIds.includes(id),
    );
    return new Set(intersection.length > 0 ? intersection : validIds);
  }, [selectedGarment, activeTab.selectedProductAssetIds]);

  const selectedAvatar = useMemo(
    () =>
      avatarPresets.find((p) => p.id === activeTab.selectedAvatarPresetId) ??
      null,
    [avatarPresets, activeTab.selectedAvatarPresetId],
  );

  const selectedEnvironment = useMemo(
    () =>
      environmentPresets.find(
        (p) => p.id === activeTab.selectedEnvironmentPresetId,
      ) ?? null,
    [environmentPresets, activeTab.selectedEnvironmentPresetId],
  );

  const referenceVideos = useMemo(
    () => workspace?.referenceVideos ?? [],
    [workspace?.referenceVideos],
  );
  const selectedRefVideo = useMemo(
    () =>
      referenceVideos.find((v) => v.id === activeTab.selectedReferenceVideoId) ??
      null,
    [referenceVideos, activeTab.selectedReferenceVideoId],
  );

  const effectiveRefDurationSec = useMemo(() => {
    const metaDur = selectedRefVideo?.mediaMeta?.durationSec;
    if (
      typeof metaDur === 'number' &&
      Number.isFinite(metaDur) &&
      metaDur > 0
    ) {
      return metaDur;
    }
    if (selectedRefVideo && detectedRefDurations[selectedRefVideo.id]) {
      return detectedRefDurations[selectedRefVideo.id];
    }
    return null;
  }, [selectedRefVideo, detectedRefDurations]);

  // Probe reference video duration client-side if server metadata didn't have it (e.g. older uploads before MP4 parser)
  useEffect(() => {
    if (!selectedRefVideo) return;
    const metaDur = selectedRefVideo.mediaMeta?.durationSec;
    if (
      typeof metaDur === 'number' &&
      Number.isFinite(metaDur) &&
      metaDur > 0
    ) {
      return;
    }
    if (detectedRefDurations[selectedRefVideo.id]) return;

    const url = studioMediaUrl(selectedRefVideo.streamPath);
    if (!url) return;

    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const cleanup = () => {
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        // ignore
      }
    };
    const onLoaded = () => {
      if (
        !cancelled &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        const dur = Number(video.duration.toFixed(2));
        setDetectedRefDurations((prev) =>
          prev[selectedRefVideo.id] === dur
            ? prev
            : { ...prev, [selectedRefVideo.id]: dur },
        );
      }
      cleanup();
    };
    const onError = () => cleanup();
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.src = url;
    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      cleanup();
    };
  }, [selectedRefVideo, detectedRefDurations]);

  // Auto-match output video duration to the selected reference video's real duration (clamped to model min/max)
  useEffect(() => {
    if (!activeTab.videoDurationAutoMatched) return;
    if (
      typeof effectiveRefDurationSec !== 'number' ||
      !Number.isFinite(effectiveRefDurationSec) ||
      effectiveRefDurationSec <= 0
    ) {
      return;
    }
    const minSec = currentVideoModel?.capabilities.minDurationSec ?? 4;
    const maxSec = currentVideoModel?.capabilities.maxDurationSec ?? 15;
    const matched = Math.max(
      minSec,
      Math.min(maxSec, Math.round(effectiveRefDurationSec)),
    );
    if (activeTab.videoDurationSec !== matched) {
      patchActiveTab({ videoDurationSec: matched });
    }
  }, [
    effectiveRefDurationSec,
    activeTab.videoDurationAutoMatched,
    activeTab.videoDurationSec,
    currentVideoModel?.capabilities.minDurationSec,
    currentVideoModel?.capabilities.maxDurationSec,
    patchActiveTab,
  ]);

  const characterSheets = useMemo(
    () => workspace?.characterSheets ?? [],
    [workspace?.characterSheets],
  );
  const selectedCharSheet = useMemo(
    () =>
      characterSheets.find((c) => c.id === activeTab.selectedCharacterAssetId) ??
      characterSheets[0] ??
      null,
    [characterSheets, activeTab.selectedCharacterAssetId],
  );

  const generatedVideos = useMemo(
    () => workspace?.generatedVideos ?? [],
    [workspace?.generatedVideos],
  );
  const selectedVideo = useMemo(
    () =>
      generatedVideos.find((v) => v.id === activeTab.selectedVideoAssetId) ??
      generatedVideos.find((v) => v.approved) ??
      generatedVideos[0] ??
      null,
    [generatedVideos, activeTab.selectedVideoAssetId],
  );

  // Environment inherited from the selected Character Sheet for Step 2
  const lockedEnvironmentName = useMemo(() => {
    const meta = selectedCharSheet?.metadata ?? {};
    if (typeof meta.environmentName === 'string' && meta.environmentName) {
      return meta.environmentName;
    }
    if (selectedEnvironment) return selectedEnvironment.name;
    return 'Matches Character Sheet';
  }, [selectedCharSheet, selectedEnvironment]);

  // Handlers
  const handleSelectClient = (companyId: string) => {
    if (!companyId) return;
    const client = clients.find((c) => c.id === companyId);
    setPickerTabIds((prev) => {
      if (!prev.has(activeTab.id)) return prev;
      const next = new Set(prev);
      next.delete(activeTab.id);
      return next;
    });
    setClientPickerSearch('');
    patchActiveTab({
      companyId,
      projectId: null,
      label: client?.name ?? 'Client Studio',
      selectedProductKitId: null,
      selectedProductAssetIds: [],
      selectedCharacterAssetId: null,
      selectedVideoAssetId: null,
    });
    setBanner(null);
  };

  const handleFetchProductUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTab.companyId || !productUrlInput.trim()) return;
    setBanner(null);
    setImportingUrl(true);
    try {
      const res = await importFromUrlMutation({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            url: productUrlInput.trim(),
            maxImages: 8,
          },
        },
      });
      const imported = res.data?.importDeliveryStudioProductFromUrl;
      if (imported?.productKit) {
        patchActiveTab({
          selectedProductKitId: imported.productKit.id,
          selectedProductAssetIds: imported.productKit.assets.map((a) => a.id),
        });
        setProductUrlInput('');
        setBanner({
          tone: 'info',
          text: `Imported ${imported.importedCount} numbered product image${imported.importedCount === 1 ? '' : 's'} from link.`,
        });
        await workspaceQuery.refetch();
      }
    } catch (err) {
      setBanner({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Could not extract images from that link. Try uploading photos directly.',
      });
    } finally {
      setImportingUrl(false);
    }
  };

  const handleManualPhotoUpload = async (
    files: File[],
    opts?: { createNew?: boolean },
  ) => {
    if (!activeTab.companyId || files.length === 0) return;
    setBanner(null);
    setUploadingPhoto(true);
    try {
      let targetKitId: string | undefined = opts?.createNew
        ? undefined
        : selectedGarment?.id;
      let nextIndex = opts?.createNew ? 0 : (selectedGarment?.assets.length ?? 0);
      if (!targetKitId) {
        const created = await upsertProductMutation({
          variables: {
            input: {
              companyId: activeTab.companyId,
              projectId: activeTab.projectId,
              name: files[0].name.replace(/\.[^.]+$/, '') || 'Garment',
            },
          },
        });
        targetKitId = created.data?.upsertDeliveryStudioProductKit?.id;
      }
      if (!targetKitId) throw new Error('Could not prepare garment folder.');
      let latestUpdated: StudioProductKitDTO | null = null;
      for (const file of files) {
        nextIndex += 1;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('role', nextIndex === 1 ? 'FRONT' : 'DETAIL');
        formData.append('label', `Image ${nextIndex}`);
        latestUpdated = await uploadStudioMultipart<StudioProductKitDTO>({
          store,
          endpointPath: `/portal/delivery-studio/product-kits/${targetKitId}/assets/upload`,
          formData,
        });
      }
      if (latestUpdated?.id) {
        patchActiveTab({
          selectedProductKitId: latestUpdated.id,
          selectedProductAssetIds: latestUpdated.assets.map((a) => a.id),
        });
      }
      await workspaceQuery.refetch();
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Photo upload failed.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleMoveGarmentAsset = async (index: number, delta: -1 | 1) => {
    if (!selectedGarment) return;
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= selectedGarment.assets.length) return;
    const nextList = [...selectedGarment.assets];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(nextIdx, 0, moved);
    await updateProductAssetsMutation({
      variables: {
        input: {
          productKitId: selectedGarment.id,
          assets: nextList.map((a, idx) => ({
            id: a.id,
            label: `Image ${idx + 1}`,
          })),
        },
      },
    });
    await workspaceQuery.refetch();
  };

  const handleRemoveGarmentAsset = async (assetId: string) => {
    if (!selectedGarment) return;
    await removeProductAssetMutation({
      variables: { productKitId: selectedGarment.id, assetId },
    });
    patchActiveTab({
      selectedProductAssetIds: activeTab.selectedProductAssetIds.filter(
        (id) => id !== assetId,
      ),
    });
    await workspaceQuery.refetch();
  };

  const handleToggleGarmentAsset = (assetId: string) => {
    if (!selectedGarment) return;
    const current = Array.from(includedAssetIdSet);
    const exists = current.includes(assetId);
    const next = exists
      ? current.filter((id) => id !== assetId)
      : [...current, assetId];
    if (next.length === 0) return; // keep at least 1 image selected
    patchActiveTab({ selectedProductAssetIds: next });
  };

  const handleGenerateCharacterSheet = async () => {
    if (!activeTab.companyId) return;
    setBanner(null);
    setBusyGenerate(true);
    try {
      const selectedIds = Array.from(includedAssetIdSet);
      await generateCharSheetMutation({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            productKitId: selectedGarment?.id ?? null,
            productAssetIds: selectedIds.length > 0 ? selectedIds : undefined,
            presetId: activeTab.characterPresetId ?? undefined,
            castingPresetId: selectedAvatar?.id ?? undefined,
            environmentPresetId: selectedEnvironment?.id ?? undefined,
            modelKey: activeTab.imageModelKey,
            routingMode: activeTab.routingMode,
            angles: activeTab.characterAngles,
            angleLayout: activeTab.characterAngleLayout,
            aspectRatio: activeTab.imageAspectRatio,
            resolution: activeTab.imageResolution,
            candidateCount: activeTab.imageCandidateCount,
            customNotes: activeTab.characterCustomNotes || undefined,
          },
        },
      });
      setBanner({
        tone: 'info',
        text: 'Generating Character Sheet… it will appear on the right as soon as ready.',
      });
      await workspaceQuery.refetch();
    } catch (err) {
      setBanner({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Could not start Character Sheet generation.',
      });
    } finally {
      setBusyGenerate(false);
    }
  };

  const handleUseCharacterSheetForVideo = (sheet: StudioAssetDTO) => {
    const meta = sheet.metadata ?? {};
    const envPresetId =
      typeof meta.environmentPresetId === 'string'
        ? meta.environmentPresetId
        : activeTab.selectedEnvironmentPresetId;
    patchActiveTab({
      selectedCharacterAssetId: sheet.id,
      selectedProductKitId: sheet.productKitId ?? activeTab.selectedProductKitId,
      selectedEnvironmentPresetId: envPresetId ?? null,
      stage: 'VIDEO_GENERATION',
    });
    setBanner(null);
  };

  const effectiveCharSheet = activeTab.useCharacterSheet
    ? selectedCharSheet
    : null;

  const selectedVideoGarment = useMemo(() => {
    const kitId =
      effectiveCharSheet?.productKitId ?? selectedGarment?.id ?? null;
    if (!kitId) return null;
    return garments.find((g) => g.id === kitId) ?? null;
  }, [garments, effectiveCharSheet?.productKitId, selectedGarment?.id]);

  const selectedVideoProductAssets = useMemo(() => {
    if (!selectedVideoGarment) return [];
    const charMeta = (effectiveCharSheet?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const savedIds =
      effectiveCharSheet?.productKitId === selectedVideoGarment.id &&
      Array.isArray(charMeta.productAssetIds)
        ? charMeta.productAssetIds.filter(
            (v): v is string => typeof v === 'string',
          )
        : [];
    if (savedIds.length > 0) {
      const filtered = selectedVideoGarment.assets.filter((a) =>
        savedIds.includes(a.id),
      );
      if (filtered.length > 0) return filtered;
    }
    if (selectedGarment && selectedVideoGarment.id === selectedGarment.id) {
      const filtered = selectedVideoGarment.assets.filter((a) =>
        includedAssetIdSet.has(a.id),
      );
      if (filtered.length > 0) return filtered;
    }
    return selectedVideoGarment.assets;
  }, [
    selectedVideoGarment,
    effectiveCharSheet,
    selectedGarment,
    includedAssetIdSet,
  ]);

  const videoPromptInputKey = useMemo(
    () =>
      [
        activeTab.useCharacterSheet ? 'char' : 'direct',
        effectiveCharSheet?.id ?? '',
        selectedVideoProductAssets.map((a) => a.id).join(','),
        selectedRefVideo?.id ?? '',
        activeTab.videoModelKey,
      ].join('|'),
    [
      activeTab.useCharacterSheet,
      effectiveCharSheet?.id,
      selectedVideoProductAssets,
      selectedRefVideo?.id,
      activeTab.videoModelKey,
    ],
  );

  const handleAnalyzeVideoPrompt = async () => {
    if (!activeTab.companyId || !selectedRefVideo) return;
    setBanner(null);
    setAnalyzingPrompt(true);
    try {
      const videoProductAssetIds = selectedVideoProductAssets.map((a) => a.id);
      const res = await analyzeVideoPromptMutation({
        variables: {
          input: {
            companyId: activeTab.companyId,
            referenceVideoId: selectedRefVideo.id,
            characterAssetId: effectiveCharSheet?.id ?? null,
            productKitId: selectedVideoGarment?.id ?? null,
            productAssetIds:
              videoProductAssetIds.length > 0 ? videoProductAssetIds : undefined,
            environmentPresetId: !effectiveCharSheet
              ? activeTab.selectedEnvironmentPresetId ?? null
              : undefined,
            modelKey: activeTab.videoModelKey,
            environmentOverride:
              activeTab.videoEnvironmentOverride.trim() || undefined,
            customNotes: activeTab.videoCustomNotes.trim() || undefined,
          },
        },
      });
      const analyzed = res.data?.analyzeDeliveryStudioVideoPrompt;
      if (analyzed?.prompt) {
        patchActiveTab({
          videoMasterPrompt: analyzed.prompt,
          geminiPromptMeta: {
            source: analyzed.source,
            modelId: analyzed.modelId,
            summary: analyzed.summary,
            key: videoPromptInputKey,
          },
        });
        setPromptExpanded(true);
        setBanner({
          tone: 'info',
          text:
            analyzed.source === 'GEMINI'
              ? `Gemini (${analyzed.modelId ?? 'multimodal'}) wrote a tailored prompt from ${analyzed.analyzedImageCount} image${analyzed.analyzedImageCount === 1 ? '' : 's'} + reference video. Review or edit below before generating.`
              : analyzed.summary,
        });
      }
    } catch (err) {
      setBanner({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Could not analyze media with Gemini.',
      });
    } finally {
      setAnalyzingPrompt(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!activeTab.companyId || !selectedRefVideo) return;
    setBanner(null);
    setBusyGenerate(true);
    try {
      const modelKeys =
        activeTab.compareMode && activeTab.compareModelKey !== activeTab.videoModelKey
          ? [activeTab.videoModelKey, activeTab.compareModelKey]
          : [activeTab.videoModelKey];
      const videoProductAssetIds = selectedVideoProductAssets.map((a) => a.id);
      await generateVideoMutation({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            referenceVideoId: selectedRefVideo.id,
            characterAssetId: effectiveCharSheet?.id ?? null,
            productKitId: selectedVideoGarment?.id ?? null,
            productAssetIds:
              videoProductAssetIds.length > 0 ? videoProductAssetIds : undefined,
            environmentPresetId: !effectiveCharSheet
              ? activeTab.selectedEnvironmentPresetId ?? null
              : undefined,
            presetId: activeTab.videoPresetId ?? undefined,
            modelKeys,
            routingMode: activeTab.routingMode,
            masterPrompt: activeTab.videoMasterPrompt.trim() || undefined,
            autoPromptWithGemini: activeTab.autoPromptWithGemini,
            environmentOverride:
              activeTab.videoEnvironmentOverride.trim() || undefined,
            customNotes: activeTab.videoCustomNotes.trim() || undefined,
            aspectRatio: activeTab.videoAspectRatio,
            resolution: activeTab.videoResolution,
            durationSec: activeTab.videoDurationSec,
            generateAudio: activeTab.generateAudio,
          },
        },
      });
      setBanner({
        tone: 'info',
        text:
          activeTab.autoPromptWithGemini && !activeTab.videoMasterPrompt.trim()
            ? 'Gemini analyzed your inputs & queued AI Video generation…'
            : effectiveCharSheet
              ? 'Generating AI Video in the locked environment…'
              : 'Generating AI Video directly from Product Photos + Reference Video…',
      });
      await workspaceQuery.refetch();
    } catch (err) {
      setBanner({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Could not start AI Video generation.',
      });
    } finally {
      setBusyGenerate(false);
    }
  };

  const handleApproveVideoAndContinue = async (video: StudioAssetDTO) => {
    setBanner(null);
    try {
      if (!video.approved) {
        await approveAssetMutation({
          variables: { assetId: video.id, approved: true },
        });
      }
      patchActiveTab({
        selectedVideoAssetId: video.id,
        stage: 'TEXT_HOOKS',
      });
      await workspaceQuery.refetch();
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Failed to approve video.',
      });
    }
  };

  const handleRunBatch = async () => {
    if (!activeTab.companyId || activeTab.batchRows.length === 0) return;
    setBanner(null);
    setBusyGenerate(true);
    try {
      const validItems = activeTab.batchRows
        .filter((r) => r.referenceVideoId)
        .map((r) => ({
          title: r.title || undefined,
          referenceVideoId: r.referenceVideoId,
          characterAssetId: r.characterAssetId || null,
          productKitId: r.productKitId || null,
        }));
      if (validItems.length === 0) {
        throw new Error('Pick a reference video for at least one batch row.');
      }
      await batchVideosMutation({
        variables: {
          input: {
            companyId: activeTab.companyId,
            projectId: activeTab.projectId,
            modelKey: activeTab.videoModelKey,
            routingMode: activeTab.routingMode,
            resolution: activeTab.videoResolution,
            durationSec: activeTab.videoDurationSec,
            generateAudio: activeTab.generateAudio,
            items: validItems,
          },
        },
      });
      setBanner({
        tone: 'info',
        text: `Queued ${validItems.length} batch video${validItems.length === 1 ? '' : 's'}.`,
      });
      await workspaceQuery.refetch();
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Batch generation failed.',
      });
    } finally {
      setBusyGenerate(false);
    }
  };

  // Resolve primary provider for accurate pricing preview
  const effectiveProvider = useMemo<StudioProviderId>(() => {
    if (activeTab.routingMode === 'WAVESPEED_ONLY') return 'wavespeed';
    if (activeTab.routingMode === 'KIE_ONLY') return 'kie';
    const cfg = workspace?.providerConfig;
    if (cfg) {
      if (cfg.defaultRoutingMode === 'KIE_ONLY') return 'kie';
      if (cfg.defaultRoutingMode === 'WAVESPEED_ONLY') return 'wavespeed';
      if (cfg.wavespeedConfigured && cfg.wavespeedEnabled) return 'wavespeed';
      if (cfg.kieConfigured && cfg.kieEnabled) return 'kie';
    }
    return 'wavespeed';
  }, [activeTab.routingMode, workspace?.providerConfig]);

  const sheetCost = formatUsdEstimate(
    estimateModelCostUsd(currentImageModel, {
      resolution: activeTab.imageResolution,
      count: activeTab.imageCandidateCount,
      provider: effectiveProvider,
    }),
  );

  const estimatedVideoCostUsd = useMemo(() => {
    const refDur = effectiveRefDurationSec ?? activeTab.videoDurationSec;
    const primary = estimateModelCostUsd(currentVideoModel, {
      resolution: activeTab.videoResolution,
      durationSec: activeTab.videoDurationSec,
      referenceVideoDurationSec: selectedRefVideo ? refDur : null,
      provider: effectiveProvider,
    });
    const compare = compareVideoModel
      ? estimateModelCostUsd(compareVideoModel, {
          resolution: activeTab.videoResolution,
          durationSec: activeTab.videoDurationSec,
          referenceVideoDurationSec: selectedRefVideo ? refDur : null,
          provider: effectiveProvider,
        })
      : 0;
    return Number((primary + compare).toFixed(4));
  }, [
    currentVideoModel,
    compareVideoModel,
    activeTab.videoResolution,
    activeTab.videoDurationSec,
    effectiveRefDurationSec,
    selectedRefVideo,
    effectiveProvider,
  ]);
  const videoCost = formatUsdEstimate(estimatedVideoCostUsd);

  const videoCostCaption = useMemo(() => {
    const providerLabel =
      effectiveProvider === 'kie' ? 'Kie.ai' : 'WaveSpeedAI';
    const modelLabel = currentVideoModel?.label ?? activeTab.videoModelKey;
    const outSec = activeTab.videoDurationSec;
    if (
      selectedRefVideo &&
      currentVideoModel?.pricing.billsInputVideoDuration
    ) {
      const refSec = Math.ceil(effectiveRefDurationSec ?? outSec);
      const minRatio = currentVideoModel.pricing.minRefVideoRatioOfOutput ?? 0;
      const billedIn = Math.max(
        2,
        Math.min(currentVideoModel.capabilities.maxInputVideoSec ?? 15, refSec),
        minRatio ? Math.ceil(outSec * minRatio) : 0,
      );
      const totalBilled = outSec + billedIn;
      return `${providerLabel} · ${modelLabel} · ${activeTab.videoResolution} · ${billedIn}s ref + ${outSec}s out (${totalBilled}s billed)${compareVideoModel ? ` + ${compareVideoModel.label}` : ''}`;
    }
    return `${providerLabel} · ${modelLabel} · ${activeTab.videoResolution} · ${outSec}s output${compareVideoModel ? ` + ${compareVideoModel.label}` : ''}`;
  }, [
    effectiveProvider,
    currentVideoModel,
    compareVideoModel,
    activeTab.videoModelKey,
    activeTab.videoResolution,
    activeTab.videoDurationSec,
    selectedRefVideo,
    effectiveRefDurationSec,
  ]);

  const activeCharJobs = activeJobs.filter(
    (j) =>
      j.jobKind === 'CHARACTER_SHEET' && j.companyId === activeTab.companyId,
  );
  const activeVideoJobs = activeJobs.filter(
    (j) =>
      j.jobKind === 'VIDEO_GENERATION' && j.companyId === activeTab.companyId,
  );
  // Hide stale failure cards once a newer video job is active or completed, or after 30 min, or when dismissed
  const recentFailedVideoJobs = useMemo(() => {
    const companyVideoJobs = (workspace?.jobs ?? []).filter(
      (j) =>
        j.jobKind === 'VIDEO_GENERATION' && j.companyId === activeTab.companyId,
    );
    const latestHealthyTs = companyVideoJobs
      .filter((j) =>
        ['QUEUED', 'STAGING', 'PROCESSING', 'DOWNLOADING', 'COMPLETED'].includes(
          j.status,
        ),
      )
      .reduce((max, j) => {
        const ts = Date.parse(j.createdAt || '');
        return Number.isFinite(ts) && ts > max ? ts : max;
      }, 0);
    const cutoffTs = Date.now() - 30 * 60 * 1000;

    return companyVideoJobs
      .filter((j) => {
        if (j.status !== 'FAILED') return false;
        if (dismissedFailedJobIds.has(j.id)) return false;
        const ts = Date.parse(j.createdAt || '');
        if (!Number.isFinite(ts)) return false;
        if (ts < cutoffTs) return false;
        if (latestHealthyTs > 0 && ts < latestHealthyTs) return false;
        return true;
      })
      .slice(0, 2);
  }, [workspace?.jobs, activeTab.companyId, dismissedFailedJobIds]);

  const plannedVideoApiSnapshot = useMemo<StudioApiRequestSnapshotDTO>(() => {
    const model = currentVideoModel;
    const usesAtTokens = activeTab.videoModelKey.startsWith('seedance');
    const imgPrefix = usesAtTokens ? '@image' : 'Image ';
    const vidPrefix = usesAtTokens ? '@video' : 'Video ';
    const maxImages = model?.capabilities.maxReferenceImages ?? 9;

    const images: StudioApiInputImageRefDTO[] = [];
    if (effectiveCharSheet) {
      images.push({
        index: 1,
        token: `${imgPrefix}1`,
        role: 'CHARACTER_SHEET',
        label: effectiveCharSheet.title || 'Character Sheet',
        fileName: `character-${effectiveCharSheet.id}.png`,
        mimeType: effectiveCharSheet.mimeType,
        mediaPath: effectiveCharSheet.mediaPath,
        stagedUrl: null,
      });
    }
    const maxProductImgs = Math.max(0, maxImages - images.length);
    for (const item of selectedVideoProductAssets.slice(0, maxProductImgs)) {
      const idx = images.length + 1;
      images.push({
        index: idx,
        token: `${imgPrefix}${idx}`,
        role: 'PRODUCT',
        label: item.label || item.role || `Product Image ${idx}`,
        fileName: item.originalFileName || `${item.role.toLowerCase()}.png`,
        mimeType: item.mimeType,
        mediaPath: item.imagePath,
        stagedUrl: null,
      });
    }

    const videos: StudioApiInputVideoRefDTO[] = selectedRefVideo
      ? [
          {
            index: 1,
            token: `${vidPrefix}1`,
            role: 'REFERENCE_VIDEO',
            label: selectedRefVideo.title || selectedRefVideo.originalFileName,
            fileName: selectedRefVideo.originalFileName,
            mimeType: selectedRefVideo.mimeType,
            durationSec: effectiveRefDurationSec ?? null,
            mediaPath: selectedRefVideo.streamPath,
            thumbnailPath: selectedRefVideo.thumbnailPath,
            stagedUrl: null,
          },
        ]
      : [];

    const selectedVideoPreset =
      videoPresets.find((p) => p.id === activeTab.videoPresetId) ??
      videoPresets.find((p) => p.isDefault) ??
      videoPresets[0] ??
      null;
    const charMeta = (effectiveCharSheet?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const envPrompt =
      activeTab.videoEnvironmentOverride.trim() ||
      (typeof charMeta.environmentPrompt === 'string' &&
      charMeta.environmentPrompt.trim()
        ? charMeta.environmentPrompt.trim()
        : selectedEnvironment?.masterPrompt ||
          (effectiveCharSheet
            ? `the exact environment and lighting shown in the Character Sheet (${imgPrefix}1)`
            : `the exact environment and lighting shown in the reference video (${vidPrefix}1)`));
    const productName =
      selectedVideoGarment?.name ||
      effectiveCharSheet?.title ||
      'featured garment';
    const productRefs = images.filter((i) => i.role === 'PRODUCT');
    const prodRefList =
      productRefs.length > 0
        ? productRefs.map((i) => i.token).join(' and ')
        : `${imgPrefix}1`;
    const rawTemplate =
      activeTab.videoMasterPrompt.trim() ||
      (effectiveCharSheet
        ? selectedVideoPreset?.masterPrompt ||
          `Recreate ${vidPrefix}1 shot for shot, keeping exact camera motion, pacing, and subject actions. Replace the subject and outfit with the model from ${imgPrefix}1 wearing the exact ${productName}. Keep the scene in ${envPrompt}.`
        : `Recreate ${vidPrefix}1 shot for shot, keeping the same person, camera motion, pacing, and subject actions. Replace the featured garment/product in ${vidPrefix}1 with the exact ${productName} shown in ${prodRefList}. Keep the scene in ${envPrompt}.`);
    const previewBase = rawTemplate
      .replace(/\{\{\s*product_name\s*\}\}/g, productName)
      .replace(/\{\{\s*environment\s*\}\}/g, envPrompt)
      .replace(
        /\{\{\s*custom_notes\s*\}\}/g,
        activeTab.videoCustomNotes.trim(),
      )
      .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '')
      .trim();

    const refParts: string[] = [];
    if (effectiveCharSheet) {
      refParts.push(
        `${imgPrefix}1 is the Character Sheet (locked model identity, outfit fit, and environment)`,
      );
    }
    if (productRefs.length > 0) {
      refParts.push(
        `${productRefs.map((i) => i.token).join(', ')} ${productRefs.length === 1 ? 'is the exact product photo' : 'are exact product photos'} of "${productName}" (match every front/back graphic, logo, neckline, and fabric detail)`,
      );
    }
    if (selectedRefVideo) {
      refParts.push(
        `${vidPrefix}1 is the reference video (preserve exact camera angles, subject motion, shot transitions, and pacing)`,
      );
    }
    const previewPrompt =
      refParts.length > 0 && !/(?:@?image\s*2\b)/i.test(previewBase)
        ? `${previewBase}\nReference inputs: ${refParts.join('; ')}.`
        : previewBase;

    return {
      capturedAt: new Date().toISOString(),
      provider: effectiveProvider,
      endpoint: null,
      modelKey: activeTab.videoModelKey,
      modelLabel: model?.label ?? activeTab.videoModelKey,
      routingMode: activeTab.routingMode,
      failoverTriggered: false,
      externalTaskId: null,
      prompt: previewPrompt,
      images,
      videos,
      rawPayload: null,
    };
  }, [
    currentVideoModel,
    effectiveProvider,
    effectiveRefDurationSec,
    activeTab.videoModelKey,
    activeTab.videoPresetId,
    activeTab.videoMasterPrompt,
    activeTab.videoEnvironmentOverride,
    activeTab.videoCustomNotes,
    activeTab.routingMode,
    effectiveCharSheet,
    selectedVideoProductAssets,
    selectedRefVideo,
    videoPresets,
    selectedEnvironment,
    selectedVideoGarment,
  ]);

  const resolveVideoApiSnapshot = useCallback(
    (
      vid: StudioAssetDTO,
    ): { snapshot: StudioApiRequestSnapshotDTO; legacyNote?: string } => {
      const meta = (vid.metadata ?? {}) as Record<string, unknown>;
      const recorded = meta.apiRequest as
        | StudioApiRequestSnapshotDTO
        | undefined;
      if (recorded && typeof recorded === 'object') {
        return { snapshot: recorded };
      }

      // Graceful reconstruction for videos generated before API payload snapshotting
      const usesAtTokens = vid.modelKey.startsWith('seedance');
      const imgPrefix = usesAtTokens ? '@image' : 'Image ';
      const vidPrefix = usesAtTokens ? '@video' : 'Video ';
      const images: StudioApiInputImageRefDTO[] = [];

      const charSheet = vid.characterAssetId
        ? characterSheets.find((c) => c.id === vid.characterAssetId) ?? null
        : null;
      if (charSheet) {
        images.push({
          index: 1,
          token: `${imgPrefix}1`,
          role: 'CHARACTER_SHEET',
          label: charSheet.title || 'Character Sheet',
          fileName: `character-${charSheet.id}.png`,
          mimeType: charSheet.mimeType,
          mediaPath: charSheet.mediaPath,
          stagedUrl: null,
        });
      }

      const kit = vid.productKitId
        ? garments.find((g) => g.id === vid.productKitId) ?? null
        : null;
      if (kit) {
        for (const item of kit.assets) {
          const idx = images.length + 1;
          images.push({
            index: idx,
            token: `${imgPrefix}${idx}`,
            role: 'PRODUCT',
            label: item.label || item.role || `Product Image ${idx}`,
            fileName: item.originalFileName || `${item.role.toLowerCase()}.png`,
            mimeType: item.mimeType,
            mediaPath: item.imagePath,
            stagedUrl: null,
          });
        }
      }

      const refVid = vid.referenceVideoId
        ? referenceVideos.find((r) => r.id === vid.referenceVideoId) ?? null
        : null;
      const videos: StudioApiInputVideoRefDTO[] = refVid
        ? [
            {
              index: 1,
              token: `${vidPrefix}1`,
              role: 'REFERENCE_VIDEO',
              label: refVid.title || refVid.originalFileName,
              fileName: refVid.originalFileName,
              mimeType: refVid.mimeType,
              durationSec: refVid.mediaMeta?.durationSec ?? null,
              mediaPath: refVid.streamPath,
              thumbnailPath: refVid.thumbnailPath,
              stagedUrl: null,
            },
          ]
        : [];

      const modelSpec = videoModels.find((m) => m.key === vid.modelKey);
      const provider: 'wavespeed' | 'kie' | null =
        vid.providerUsed === 'wavespeed' || vid.providerUsed === 'kie'
          ? vid.providerUsed
          : null;

      return {
        snapshot: {
          capturedAt: vid.createdAt,
          provider,
          endpoint: null,
          modelKey: vid.modelKey,
          modelLabel: modelSpec?.label ?? vid.modelKey,
          routingMode: 'AUTO_FAILOVER',
          failoverTriggered: Boolean(meta.failoverTriggered),
          externalTaskId:
            typeof meta.externalTaskId === 'string'
              ? meta.externalTaskId
              : null,
          prompt: vid.promptUsed || '',
          images,
          videos,
          rawPayload: null,
        },
        legacyNote:
          'Generated before API payload snapshotting — showing linked Character Sheet, Garment, Reference Video & prompt. New videos also capture exact staged URLs and raw JSON sent to the provider.',
      };
    },
    [characterSheets, garments, referenceVideos, videoModels],
  );

  const stepItems: Array<{ key: StudioStageKey; num: string; label: string }> =
    effectiveLayout === 'GENERAL'
      ? [
          { key: 'CHARACTER_SHEET', num: '1', label: 'Character Sheet' },
          { key: 'VIDEO_GENERATION', num: '2', label: 'AI Video' },
          { key: 'BATCH_MATRIX', num: '3', label: 'Batch' },
          { key: 'TEXT_HOOKS', num: '4', label: 'Text Hooks & Drive' },
        ]
      : [
          { key: 'CHARACTER_SHEET', num: '1', label: 'Character Sheet' },
          { key: 'VIDEO_GENERATION', num: '2', label: 'AI Video' },
          { key: 'TEXT_HOOKS', num: '3', label: 'Text Hooks & Drive' },
        ];

  return (
    <DeliveryOperationalPage view="studio">
      <StyledShell>
        {/* Slim, ultra-clean Top Bar */}
        <StyledTopBar>
          <StyledTabsRow>
            {tabsState.tabs.map((tab) => (
              <StyledTabPill
                key={tab.id}
                data-active={tab.id === activeTab.id}
                onClick={() =>
                  setTabsState((prev) => ({ ...prev, activeTabId: tab.id }))
                }
              >
                <span>{tab.label}</span>
                {tabsState.tabs.length > 1 && (
                  <StyledTabClose
                    type="button"
                    aria-label="Close tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickerTabIds((prev) => {
                        if (!prev.has(tab.id)) return prev;
                        const next = new Set(prev);
                        next.delete(tab.id);
                        return next;
                      });
                      setTabsState((prev) => closeStudioTab(prev, tab.id));
                    }}
                  >
                    ×
                  </StyledTabClose>
                )}
              </StyledTabPill>
            ))}
            <StyledIconButton
              type="button"
              title="Open another client tab"
              onClick={() => {
                const next = createEmptyStudioTab({ label: 'New Tab' });
                setPickerTabIds((prev) => {
                  const updated = new Set(prev);
                  updated.add(next.id);
                  return updated;
                });
                setClientPickerSearch('');
                setTabsState((prev) => ({
                  activeTabId: next.id,
                  tabs: [...prev.tabs, next],
                }));
              }}
            >
              +
            </StyledIconButton>
          </StyledTabsRow>

          <StyledTopRight>
            <StyledClientSelect
              aria-label="Select Delivery Client"
              value={activeTab.companyId ?? ''}
              onChange={(e) => handleSelectClient(e.target.value)}
            >
              {clients.length === 0 ? (
                <option value="">No Delivery Clients yet</option>
              ) : (
                <>
                  {!activeTab.companyId && (
                    <option value="" disabled>
                      Select a client…
                    </option>
                  )}
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </StyledClientSelect>

            {isClothingBrandClient && (
              <StyledClothingBadge>Clothing Brand</StyledClothingBadge>
            )}

            <StyledIconButton
              type="button"
              data-pulse={activeJobs.length > 0}
              onClick={() => setQueueOpen((prev) => !prev)}
            >
              Queue{activeJobs.length > 0 ? ` (${activeJobs.length})` : ''}
            </StyledIconButton>

            <StyledIconButton
              type="button"
              title="Studio settings, models, presets & API keys"
              aria-label="Studio settings"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </StyledIconButton>
          </StyledTopRight>
        </StyledTopBar>

        {/* Clean 3-step Stepper */}
        {activeTab.companyId && (
          <StyledStepperBar>
            {stepItems.map((step) => (
              <StyledStepButton
                key={step.key}
                type="button"
                data-active={activeTab.stage === step.key}
                onClick={() => patchActiveTab({ stage: step.key })}
              >
                <StyledStepNum>{step.num}</StyledStepNum>
                {step.label}
              </StyledStepButton>
            ))}
          </StyledStepperBar>
        )}

        {/* Main Canvas */}
        <StyledCanvas>
          {banner && (
            <div style={{ marginBottom: 16 }}>
              <StyledMessage data-tone={banner.tone}>
                {banner.text}
              </StyledMessage>
            </div>
          )}

          {!activeTab.companyId ? (
            clients.length === 0 ? (
              <StyledEmptyState>
                {workspaceQuery.loading ? (
                  'Loading your clients…'
                ) : (
                  <>
                    Add a client in the{' '}
                    <Link to="/delivery?view=clients">Clients section</Link> to
                    start creating Character Sheets and AI Videos.
                  </>
                )}
              </StyledEmptyState>
            ) : (
              <StyledClientPicker>
                <StyledClientPickerHeader>
                  <div>
                    <h2>Select a client for this tab</h2>
                    <p>
                      Choose any active client from your Clients section to open
                      their AI Studio workspace.
                    </p>
                  </div>
                  <Link to="/delivery?view=clients">Manage clients →</Link>
                </StyledClientPickerHeader>

                {clients.length > 4 && (
                  <StyledClientPickerSearch
                    type="search"
                    placeholder="Search clients or tags (e.g. Belfort, Clothing Brand)…"
                    value={clientPickerSearch}
                    onChange={(e) => setClientPickerSearch(e.target.value)}
                    autoFocus
                  />
                )}

                {filteredPickerClients.length === 0 ? (
                  <StyledEmptyState>
                    No clients match “{clientPickerSearch}”.
                  </StyledEmptyState>
                ) : (
                  <StyledClientPickerGrid>
                    {filteredPickerClients.map((client) => {
                      const tags = client.tags ?? [];
                      const isAlreadyOpen = openClientIds.has(client.id);
                      return (
                        <StyledClientPickerCard
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client.id)}
                        >
                          <StyledClientPickerCardTop>
                            <StyledClientPickerAvatar>
                              {initials(client.name) || 'C'}
                            </StyledClientPickerAvatar>
                            <StyledClientPickerName>
                              <strong>{client.name}</strong>
                              <small>
                                {client.projects.length === 1
                                  ? '1 project'
                                  : `${client.projects.length} projects`}
                                {isAlreadyOpen ? ' · Open in another tab' : ''}
                              </small>
                            </StyledClientPickerName>
                          </StyledClientPickerCardTop>

                          {tags.length > 0 && (
                            <StyledClientPickerTags>
                              {tags.map((tag) => (
                                <StyledClientPickerTag
                                  key={tag}
                                  data-clothing={isClothingTagLabel(tag)}
                                >
                                  {tag}
                                </StyledClientPickerTag>
                              ))}
                            </StyledClientPickerTags>
                          )}
                        </StyledClientPickerCard>
                      );
                    })}
                  </StyledClientPickerGrid>
                )}
              </StyledClientPicker>
            )
          ) : activeTab.stage === 'CHARACTER_SHEET' ? (
            /* ================= STEP 1: CHARACTER SHEET ================= */
            <StyledTwoCol>
              <StyledBuilderStack>
                {/* Slot 1: Cloth */}
                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>1 · Cloth</h4>
                    <span>
                      {selectedGarment
                        ? `${includedAssetIdSet.size} of ${selectedGarment.assets.length} images active`
                        : 'Paste link or upload'}
                    </span>
                  </StyledSlotHeader>

                  <StyledUrlForm onSubmit={(e) => void handleFetchProductUrl(e)}>
                    <input
                      type="url"
                      placeholder="Paste product URL to auto-extract images…"
                      value={productUrlInput}
                      onChange={(e) => setProductUrlInput(e.target.value)}
                      disabled={importingUrl}
                    />
                    <button
                      type="submit"
                      disabled={importingUrl || !productUrlInput.trim()}
                    >
                      {importingUrl ? 'Fetching…' : 'Fetch'}
                    </button>
                  </StyledUrlForm>

                  <StyledClothControls>
                    {garments.length > 0 ? (
                      <select
                        value={selectedGarment?.id ?? ''}
                        onChange={(e) => {
                          const g = garments.find(
                            (item) => item.id === e.target.value,
                          );
                          patchActiveTab({
                            selectedProductKitId: e.target.value || null,
                            selectedProductAssetIds:
                              g?.assets.map((a) => a.id) ?? [],
                          });
                        }}
                      >
                        {garments.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.assets.length})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          opacity: 0.65,
                        }}
                      >
                        No garment loaded yet
                      </span>
                    )}

                    <StyledUploadLabel data-disabled={uploadingPhoto}>
                      {uploadingPhoto ? 'Uploading…' : '+ Upload'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={uploadingPhoto}
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          if (list.length > 0) {
                            void handleManualPhotoUpload(list);
                          }
                          e.target.value = '';
                        }}
                      />
                    </StyledUploadLabel>

                    {selectedGarment && (
                      <StyledUploadLabel
                        data-disabled={uploadingPhoto}
                        title="Start a new garment with these photos"
                      >
                        + New
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          disabled={uploadingPhoto}
                          onChange={(e) => {
                            const list = Array.from(e.target.files ?? []);
                            if (list.length > 0) {
                              void handleManualPhotoUpload(list, {
                                createNew: true,
                              });
                            }
                            e.target.value = '';
                          }}
                        />
                      </StyledUploadLabel>
                    )}
                  </StyledClothControls>

                  {selectedGarment && selectedGarment.assets.length > 0 && (
                    <StyledNumberedGrid>
                      {selectedGarment.assets.map((item, idx) => {
                        const included = includedAssetIdSet.has(item.id);
                        return (
                          <StyledClothThumb
                            key={item.id}
                            data-included={included}
                          >
                            <StyledImageNumBadge>
                              Image {idx + 1}
                            </StyledImageNumBadge>
                            <img
                              src={studioMediaUrl(item.imagePath)}
                              alt={`Image ${idx + 1}`}
                              title="Click to include/exclude this image"
                              onClick={() => handleToggleGarmentAsset(item.id)}
                            />
                            <StyledThumbActions>
                              <button
                                type="button"
                                disabled={idx === 0}
                                title="Move left"
                                onClick={() =>
                                  void handleMoveGarmentAsset(idx, -1)
                                }
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                disabled={
                                  idx === selectedGarment.assets.length - 1
                                }
                                title="Move right"
                                onClick={() =>
                                  void handleMoveGarmentAsset(idx, 1)
                                }
                              >
                                →
                              </button>
                              <button
                                type="button"
                                title="Remove image"
                                onClick={() =>
                                  void handleRemoveGarmentAsset(item.id)
                                }
                              >
                                ×
                              </button>
                            </StyledThumbActions>
                          </StyledClothThumb>
                        );
                      })}
                    </StyledNumberedGrid>
                  )}
                </StyledSlotCard>

                {/* Slot 2: Avatar */}
                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>2 · Avatar</h4>
                    <span>Shared agency library</span>
                  </StyledSlotHeader>
                  <StyledPickerTrigger
                    type="button"
                    onClick={() => setLibraryModal('AVATAR')}
                  >
                    <StyledPickerThumb>
                      {selectedAvatar?.thumbnailPath ? (
                        <img
                          src={studioMediaUrl(selectedAvatar.thumbnailPath)}
                          alt={selectedAvatar.name}
                        />
                      ) : selectedAvatar ? (
                        initials(selectedAvatar.name)
                      ) : (
                        '+'
                      )}
                    </StyledPickerThumb>
                    <StyledPickerMeta>
                      <strong>
                        {selectedAvatar?.name ?? 'Choose an Avatar'}
                      </strong>
                      <span>
                        {selectedAvatar?.description ||
                          'Pick from saved models or add a new avatar'}
                      </span>
                    </StyledPickerMeta>
                    <StyledChangeLabel>Browse →</StyledChangeLabel>
                  </StyledPickerTrigger>
                </StyledSlotCard>

                {/* Slot 3: Environment */}
                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>3 · Environment</h4>
                    <span>Carried into AI Video</span>
                  </StyledSlotHeader>
                  <StyledPickerTrigger
                    type="button"
                    onClick={() => setLibraryModal('ENVIRONMENT')}
                  >
                    <StyledPickerThumb>
                      {selectedEnvironment?.thumbnailPath ? (
                        <img
                          src={studioMediaUrl(
                            selectedEnvironment.thumbnailPath,
                          )}
                          alt={selectedEnvironment.name}
                        />
                      ) : selectedEnvironment ? (
                        initials(selectedEnvironment.name)
                      ) : (
                        '+'
                      )}
                    </StyledPickerThumb>
                    <StyledPickerMeta>
                      <strong>
                        {selectedEnvironment?.name ?? 'Choose an Environment'}
                      </strong>
                      <span>
                        {selectedEnvironment?.description ||
                          'Pick a scene — locked into Step 2 automatically'}
                      </span>
                    </StyledPickerMeta>
                    <StyledChangeLabel>Browse →</StyledChangeLabel>
                  </StyledPickerTrigger>
                </StyledSlotCard>

                <StyledPrimaryCta
                  type="button"
                  disabled={busyGenerate || !selectedGarment}
                  onClick={() => void handleGenerateCharacterSheet()}
                >
                  {busyGenerate
                    ? 'Queuing…'
                    : `Generate Character Sheet · ${sheetCost}`}
                </StyledPrimaryCta>
              </StyledBuilderStack>

              {/* Right: Generated Character Sheets */}
              <StyledGalleryColumn>
                <StyledGalleryHeader>
                  <h3>Character Sheets</h3>
                  <span>{characterSheets.length} saved</span>
                </StyledGalleryHeader>

                {activeCharJobs.map((job) => (
                  <StyledProgressCard key={job.id}>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 12,
                        fontWeight: 600,
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{job.title}</span>
                      <span>
                        {job.status} · {job.progress}%
                      </span>
                    </div>
                    <StyledProgressTrack>
                      <StyledProgressFill style={{ width: `${job.progress}%` }} />
                    </StyledProgressTrack>
                  </StyledProgressCard>
                ))}

                {characterSheets.length === 0 ? (
                  <StyledEmptyState>
                    Pick your Cloth, Avatar, and Environment on the left to
                    generate your first Character Sheet.
                  </StyledEmptyState>
                ) : (
                  <StyledAssetGrid>
                    {characterSheets.map((sheet) => {
                      const meta = sheet.metadata ?? {};
                      const envName =
                        typeof meta.environmentName === 'string'
                          ? meta.environmentName
                          : null;
                      const avatarName =
                        typeof meta.avatarName === 'string'
                          ? meta.avatarName
                          : null;
                      return (
                        <StyledAssetCard
                          key={sheet.id}
                          data-selected={sheet.id === selectedCharSheet?.id}
                        >
                          <StyledAssetMedia>
                            <img
                              src={studioMediaUrl(sheet.mediaPath)}
                              alt={sheet.title}
                            />
                          </StyledAssetMedia>
                          <StyledAssetFooter>
                            <strong>{sheet.title}</strong>
                            {(avatarName || envName) && (
                              <StyledMetaChips>
                                {avatarName && (
                                  <StyledMiniChip>{avatarName}</StyledMiniChip>
                                )}
                                {envName && (
                                  <StyledMiniChip>{envName}</StyledMiniChip>
                                )}
                              </StyledMetaChips>
                            )}
                            <StyledPrimaryCta
                              type="button"
                              style={{ padding: '8px 12px', fontSize: 12 }}
                              onClick={() =>
                                handleUseCharacterSheetForVideo(sheet)
                              }
                            >
                              Use for Video →
                            </StyledPrimaryCta>
                          </StyledAssetFooter>
                        </StyledAssetCard>
                      );
                    })}
                  </StyledAssetGrid>
                )}
              </StyledGalleryColumn>
            </StyledTwoCol>
          ) : activeTab.stage === 'VIDEO_GENERATION' ? (
            /* ================= STEP 2: AI VIDEO ================= */
            <StyledTwoCol>
              <StyledBuilderStack>
                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>Character Sheet (Optional)</h4>
                    <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
                      <StyledTogglePill
                        type="button"
                        data-on={activeTab.useCharacterSheet ? 'true' : 'false'}
                        aria-pressed={activeTab.useCharacterSheet}
                        onClick={() =>
                          patchActiveTab({
                            useCharacterSheet: !activeTab.useCharacterSheet,
                          })
                        }
                      >
                        <StyledToggleDot
                          data-on={
                            activeTab.useCharacterSheet ? 'true' : 'false'
                          }
                        />
                        {activeTab.useCharacterSheet ? 'ON' : 'Skipped'}
                      </StyledTogglePill>
                      {activeTab.useCharacterSheet && (
                        <StyledSubtleBtn
                          type="button"
                          onClick={() =>
                            patchActiveTab({ stage: 'CHARACTER_SHEET' })
                          }
                        >
                          Change
                        </StyledSubtleBtn>
                      )}
                    </div>
                  </StyledSlotHeader>

                  {activeTab.useCharacterSheet ? (
                    effectiveCharSheet ? (
                      <>
                        <div
                          style={{
                            alignItems: 'center',
                            display: 'flex',
                            gap: 12,
                          }}
                        >
                          <StyledPickerThumb style={{ height: 64, width: 50 }}>
                            <img
                              src={studioMediaUrl(effectiveCharSheet.mediaPath)}
                              alt={effectiveCharSheet.title}
                            />
                          </StyledPickerThumb>
                          <StyledPickerMeta>
                            <strong>{effectiveCharSheet.title}</strong>
                            <span>
                              {selectedVideoGarment
                                ? `${selectedVideoGarment.name} · ${selectedVideoProductAssets.length} product photo${selectedVideoProductAssets.length === 1 ? '' : 's'}`
                                : 'Character Sheet ready'}
                            </span>
                          </StyledPickerMeta>
                        </div>

                        <StyledLockedEnvPill>
                          <span>🔒 {lockedEnvironmentName}</span>
                          <small>Same environment</small>
                        </StyledLockedEnvPill>
                      </>
                    ) : (
                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: 0.72 }}>
                          No Character Sheet selected yet — pick one in Step 1, or
                          skip and use Product Photos + Reference Video directly.
                        </span>
                        <StyledSubtleBtn
                          type="button"
                          onClick={() =>
                            patchActiveTab({ useCharacterSheet: false })
                          }
                        >
                          Skip Character Sheet →
                        </StyledSubtleBtn>
                      </div>
                    )
                  ) : (
                    <>
                      <StyledPromptHint>
                        Skipped — generates directly from your{' '}
                        <strong>Product Photos + Reference Video</strong>{' '}
                        (keeps the person &amp; motion from your Reference
                        Video).
                      </StyledPromptHint>
                      <StyledPickerTrigger
                        type="button"
                        onClick={() => setLibraryModal('ENVIRONMENT')}
                      >
                        <StyledPickerThumb>
                          {selectedEnvironment?.thumbnailPath ? (
                            <img
                              src={studioMediaUrl(
                                selectedEnvironment.thumbnailPath,
                              )}
                              alt={selectedEnvironment.name}
                            />
                          ) : (
                            '🌄'
                          )}
                        </StyledPickerThumb>
                        <StyledPickerMeta>
                          <strong>
                            {selectedEnvironment
                              ? `Environment: ${selectedEnvironment.name}`
                              : "Keep Reference Video's environment"}
                          </strong>
                          <span>
                            {selectedEnvironment
                              ? 'Overriding background setting'
                              : 'Optional — click to pick a custom environment'}
                          </span>
                        </StyledPickerMeta>
                        <StyledChangeLabel>
                          {selectedEnvironment ? 'Change →' : 'Optional →'}
                        </StyledChangeLabel>
                      </StyledPickerTrigger>
                      {selectedEnvironment && (
                        <StyledSubtleBtn
                          type="button"
                          onClick={() =>
                            patchActiveTab({
                              selectedEnvironmentPresetId: null,
                            })
                          }
                        >
                          Reset to Reference Video environment
                        </StyledSubtleBtn>
                      )}
                    </>
                  )}
                </StyledSlotCard>

                {!effectiveCharSheet && (
                  <StyledSlotCard>
                    <StyledSlotHeader>
                      <h4>Product Photos</h4>
                      <span>
                        {selectedVideoProductAssets.length} selected for API
                      </span>
                    </StyledSlotHeader>

                    <StyledUrlForm onSubmit={handleFetchProductUrl}>
                      <input
                        type="url"
                        value={productUrlInput}
                        onChange={(e) => setProductUrlInput(e.target.value)}
                        placeholder="Paste product URL to auto-import images…"
                        disabled={importingUrl}
                      />
                      <button
                        type="submit"
                        disabled={importingUrl || !productUrlInput.trim()}
                      >
                        {importingUrl ? 'Fetching…' : 'Fetch'}
                      </button>
                    </StyledUrlForm>

                    <StyledClothControls>
                      {garments.length > 0 ? (
                        <select
                          value={selectedGarment?.id ?? ''}
                          onChange={(e) => {
                            const g = garments.find(
                              (item) => item.id === e.target.value,
                            );
                            patchActiveTab({
                              selectedProductKitId: e.target.value || null,
                              selectedProductAssetIds:
                                g?.assets.map((a) => a.id) ?? [],
                            });
                          }}
                        >
                          {garments.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.assets.length})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.65 }}>
                          No product kit yet
                        </span>
                      )}

                      <StyledUploadLabel data-disabled={uploadingPhoto}>
                        {uploadingPhoto ? 'Uploading…' : '+ Upload'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          disabled={uploadingPhoto}
                          onChange={(e) => {
                            const list = Array.from(e.target.files ?? []);
                            if (list.length > 0) {
                              void handleManualPhotoUpload(list);
                            }
                            e.target.value = '';
                          }}
                        />
                      </StyledUploadLabel>
                    </StyledClothControls>

                    {selectedGarment && selectedGarment.assets.length > 0 && (
                      <StyledNumberedGrid>
                        {selectedGarment.assets.map((item, idx) => {
                          const included = includedAssetIdSet.has(item.id);
                          return (
                            <StyledClothThumb
                              key={item.id}
                              data-included={included}
                            >
                              <StyledImageNumBadge>
                                Image {idx + 1}
                              </StyledImageNumBadge>
                              <img
                                src={studioMediaUrl(item.imagePath)}
                                alt={`Image ${idx + 1}`}
                                title="Click to include/exclude this photo"
                                onClick={() =>
                                  handleToggleGarmentAsset(item.id)
                                }
                              />
                              <StyledThumbActions>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  title="Move left"
                                  onClick={() =>
                                    void handleMoveGarmentAsset(idx, -1)
                                  }
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    idx === selectedGarment.assets.length - 1
                                  }
                                  title="Move right"
                                  onClick={() =>
                                    void handleMoveGarmentAsset(idx, 1)
                                  }
                                >
                                  →
                                </button>
                                <button
                                  type="button"
                                  title="Remove image"
                                  onClick={() =>
                                    void handleRemoveGarmentAsset(item.id)
                                  }
                                >
                                  ×
                                </button>
                              </StyledThumbActions>
                            </StyledClothThumb>
                          );
                        })}
                      </StyledNumberedGrid>
                    )}
                  </StyledSlotCard>
                )}

                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>Reference Video</h4>
                    <span>Motion &amp; camera guide</span>
                  </StyledSlotHeader>
                  <StyledPickerTrigger
                    type="button"
                    onClick={() => setLibraryModal('REFERENCE_VIDEO')}
                  >
                    <StyledPickerThumb>
                      {selectedRefVideo?.thumbnailPath ? (
                        <img
                          src={studioMediaUrl(selectedRefVideo.thumbnailPath)}
                          alt={selectedRefVideo.title}
                        />
                      ) : selectedRefVideo ? (
                        '▶'
                      ) : (
                        '+'
                      )}
                    </StyledPickerThumb>
                    <StyledPickerMeta>
                      <strong>
                        {selectedRefVideo?.title ?? 'Choose Reference Video'}
                      </strong>
                      <span>
                        {selectedRefVideo
                          ? effectiveRefDurationSec !== null
                            ? `${Math.round(effectiveRefDurationSec)}s · Output ${activeTab.videoDurationAutoMatched ? 'auto-matched to' : 'set to'} ${activeTab.videoDurationSec}s`
                            : `Detecting length… · ${selectedRefVideo.notes || selectedRefVideo.originalFileName}`
                          : 'Pick from Reference Video Library or upload new'}
                      </span>
                    </StyledPickerMeta>
                    <StyledChangeLabel>Library →</StyledChangeLabel>
                  </StyledPickerTrigger>
                </StyledSlotCard>

                <StyledSlotCard>
                  <StyledSlotHeader>
                    <h4>Auto-Prompt (Gemini)</h4>
                    <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
                      {workspace?.providerConfig?.geminiConfigured ? (
                        <span
                          style={{
                            color: themeCssVariables.color.green11,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                          title={`Active via ${workspace.providerConfig.geminiSource ?? 'API key'}`}
                        >
                          ● Gemini live
                        </span>
                      ) : (
                        <StyledSubtleBtn
                          type="button"
                          onClick={() => setProviderModalOpen(true)}
                          title="Add your Google Gemini API key so Analyze Images & Video uses live multimodal Gemini"
                        >
                          ○ Add Gemini key →
                        </StyledSubtleBtn>
                      )}
                      <StyledTogglePill
                        type="button"
                        data-on={
                          activeTab.autoPromptWithGemini ? 'true' : 'false'
                        }
                        aria-pressed={activeTab.autoPromptWithGemini}
                        onClick={() => {
                          const next = !activeTab.autoPromptWithGemini;
                          if (!next && activeTab.geminiPromptMeta) {
                            patchActiveTab({
                              autoPromptWithGemini: false,
                              videoMasterPrompt: '',
                              geminiPromptMeta: null,
                            });
                          } else {
                            patchActiveTab({ autoPromptWithGemini: next });
                          }
                        }}
                      >
                        <StyledToggleDot
                          data-on={
                            activeTab.autoPromptWithGemini ? 'true' : 'false'
                          }
                        />
                        {activeTab.autoPromptWithGemini ? 'ON' : 'OFF'}
                      </StyledTogglePill>
                    </div>
                  </StyledSlotHeader>

                  {activeTab.autoPromptWithGemini ? (
                    <>
                      <StyledPromptHint>
                        {effectiveCharSheet
                          ? 'Gemini watches your Reference Video + inspects your Character Sheet & Product Photos to write a tailored shot-by-shot prompt with strict anti-leakage rules.'
                          : 'Gemini watches your Reference Video + inspects your Product Photos to write a direct product-swap prompt keeping the reference person & motion.'}
                      </StyledPromptHint>
                      {activeTab.geminiPromptMeta && (
                        <StyledPromptHint>
                          {activeTab.geminiPromptMeta.key !==
                          videoPromptInputKey
                            ? 'Inputs changed since last analysis — click Re-analyze or Reset to regenerate.'
                            : activeTab.geminiPromptMeta.source === 'GEMINI'
                              ? `Prompt ready (${activeTab.geminiPromptMeta.modelId ?? 'Gemini'})`
                              : activeTab.geminiPromptMeta.summary}
                        </StyledPromptHint>
                      )}
                      <StyledPromptActionsRow>
                        <StyledSubtleBtn
                          type="button"
                          disabled={analyzingPrompt || !selectedRefVideo}
                          onClick={() => void handleAnalyzeVideoPrompt()}
                        >
                          {analyzingPrompt
                            ? 'Analyzing media…'
                            : activeTab.videoMasterPrompt.trim()
                              ? 'Re-analyze Media'
                              : 'Analyze Images & Video'}
                        </StyledSubtleBtn>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <StyledSubtleBtn
                            type="button"
                            onClick={() => setPromptExpanded((v) => !v)}
                          >
                            {promptExpanded
                              ? 'Hide Prompt'
                              : activeTab.videoMasterPrompt.trim()
                                ? 'Edit Prompt'
                                : 'Custom Prompt'}
                          </StyledSubtleBtn>
                          {activeTab.videoMasterPrompt.trim() && (
                            <StyledSubtleBtn
                              type="button"
                              onClick={() =>
                                patchActiveTab({
                                  videoMasterPrompt: '',
                                  geminiPromptMeta: null,
                                })
                              }
                            >
                              Reset
                            </StyledSubtleBtn>
                          )}
                        </div>
                      </StyledPromptActionsRow>
                    </>
                  ) : (
                    <>
                      <StyledPromptHint>
                        Off — uses the built-in shot-by-shot recreation template
                        (or your custom prompt below) without calling Gemini.
                      </StyledPromptHint>
                      <StyledPromptActionsRow>
                        <StyledSubtleBtn
                          type="button"
                          onClick={() => setPromptExpanded((v) => !v)}
                        >
                          {promptExpanded
                            ? 'Hide Prompt'
                            : activeTab.videoMasterPrompt.trim()
                              ? 'Edit Custom Prompt'
                              : 'Write Custom Prompt'}
                        </StyledSubtleBtn>
                        {activeTab.videoMasterPrompt.trim() && (
                          <StyledSubtleBtn
                            type="button"
                            onClick={() =>
                              patchActiveTab({
                                videoMasterPrompt: '',
                                geminiPromptMeta: null,
                              })
                            }
                          >
                            Reset
                          </StyledSubtleBtn>
                        )}
                      </StyledPromptActionsRow>
                    </>
                  )}

                  {promptExpanded && (
                    <StyledPromptTextarea
                      value={activeTab.videoMasterPrompt}
                      placeholder="Leave empty to auto-generate with Gemini (when ON) or use the default recreation prompt (when OFF)…"
                      onChange={(e) =>
                        patchActiveTab({
                          videoMasterPrompt: e.target.value,
                        })
                      }
                    />
                  )}
                </StyledSlotCard>

                <StyledPrimaryCta
                  type="button"
                  disabled={
                    busyGenerate ||
                    analyzingPrompt ||
                    !selectedRefVideo ||
                    (!effectiveCharSheet &&
                      selectedVideoProductAssets.length === 0 &&
                      !activeTab.videoMasterPrompt.trim())
                  }
                  onClick={() => void handleGenerateVideo()}
                >
                  {busyGenerate
                    ? activeTab.autoPromptWithGemini &&
                      !activeTab.videoMasterPrompt.trim()
                      ? 'Analyzing & Queuing…'
                      : 'Queuing…'
                    : `Generate AI Video · ${videoCost}`}
                </StyledPrimaryCta>
                <StyledCostCaption>{videoCostCaption}</StyledCostCaption>

                {(effectiveCharSheet ||
                  selectedVideoProductAssets.length > 0 ||
                  selectedRefVideo) && (
                  <DeliveryStudioApiInputInspector
                    snapshot={plannedVideoApiSnapshot}
                    buttonLabel="Inspect API Input (Preview)"
                    isPreview
                  />
                )}
              </StyledBuilderStack>

              {/* Right: Generated AI Videos */}
              <StyledGalleryColumn>
                <StyledGalleryHeader>
                  <h3>Generated AI Videos</h3>
                  <span>{generatedVideos.length} videos</span>
                </StyledGalleryHeader>

                {activeVideoJobs.map((job) => (
                  <StyledProgressCard key={job.id}>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 12,
                        fontWeight: 600,
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{job.title}</span>
                      <span>
                        {job.status} · {job.progress}%
                      </span>
                    </div>
                    <StyledProgressTrack>
                      <StyledProgressFill style={{ width: `${job.progress}%` }} />
                    </StyledProgressTrack>
                    {job.apiRequest && (
                      <DeliveryStudioApiInputInspector
                        snapshot={job.apiRequest}
                        buttonLabel="Inspect API Input"
                      />
                    )}
                  </StyledProgressCard>
                ))}

                {recentFailedVideoJobs.map((job) => (
                  <StyledProgressCard key={job.id}>
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        fontSize: 12,
                        fontWeight: 600,
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{job.title}</span>
                      <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
                        <span style={{ color: themeCssVariables.font.color.danger }}>
                          FAILED
                        </span>
                        <StyledDismissBtn
                          type="button"
                          title="Dismiss failure notice"
                          onClick={() =>
                            setDismissedFailedJobIds((prev) => {
                              const next = new Set(prev);
                              next.add(job.id);
                              return next;
                            })
                          }
                        >
                          ×
                        </StyledDismissBtn>
                      </div>
                    </div>
                    {job.errorMessage && (
                      <div style={{ fontSize: 11, opacity: 0.85 }}>
                        {job.errorMessage}
                      </div>
                    )}
                    {job.apiRequest && (
                      <DeliveryStudioApiInputInspector
                        snapshot={job.apiRequest}
                        buttonLabel="Inspect API Input"
                      />
                    )}
                  </StyledProgressCard>
                ))}

                {generatedVideos.length === 0 ? (
                  <StyledEmptyState>
                    Pick a Reference Video on the left and click Generate AI
                    Video.
                  </StyledEmptyState>
                ) : (
                  <StyledAssetGrid>
                    {generatedVideos.map((vid) => {
                      const resolvedApi = resolveVideoApiSnapshot(vid);
                      return (
                        <StyledAssetCard
                          key={vid.id}
                          data-selected={vid.id === selectedVideo?.id}
                        >
                          <StyledAssetMedia data-video="true">
                            <video
                              src={studioMediaUrl(vid.mediaPath)}
                              poster={studioMediaUrl(vid.thumbnailPath)}
                              controls
                              playsInline
                            />
                          </StyledAssetMedia>
                          <StyledAssetFooter>
                            <strong>{vid.title}</strong>
                            <DeliveryStudioApiInputInspector
                              snapshot={resolvedApi.snapshot}
                              buttonLabel="Inspect API Input"
                              legacyNote={resolvedApi.legacyNote}
                            />
                            <StyledPrimaryCta
                              type="button"
                              style={{ padding: '8px 12px', fontSize: 12 }}
                              onClick={() =>
                                void handleApproveVideoAndContinue(vid)
                              }
                            >
                              {vid.approved
                                ? 'Open Text Hooks & Drive →'
                                : 'Approve & Continue →'}
                            </StyledPrimaryCta>
                          </StyledAssetFooter>
                        </StyledAssetCard>
                      );
                    })}
                  </StyledAssetGrid>
                )}
              </StyledGalleryColumn>
            </StyledTwoCol>
          ) : activeTab.stage === 'BATCH_MATRIX' ? (
            /* ================= OPTIONAL BATCH (GENERAL MODE) ================= */
            <StyledBuilderStack>
              <StyledSlotCard>
                <StyledSlotHeader>
                  <h4>Batch Video Matrix</h4>
                  <StyledSubtleBtn
                    type="button"
                    onClick={() =>
                      patchActiveTab({
                        batchRows: [
                          ...activeTab.batchRows,
                          {
                            id: `row-${Date.now()}`,
                            title: `Cut ${activeTab.batchRows.length + 1}`,
                            referenceVideoId: selectedRefVideo?.id ?? '',
                            characterAssetId: selectedCharSheet?.id ?? '',
                            productKitId: selectedGarment?.id ?? '',
                            environmentOverride: '',
                          },
                        ],
                      })
                    }
                  >
                    + Add video row
                  </StyledSubtleBtn>
                </StyledSlotHeader>

                {activeTab.batchRows.map((row, idx) => (
                  <StyledBatchRowCard key={row.id}>
                    <input
                      type="text"
                      value={row.title}
                      placeholder={`Video ${idx + 1}`}
                      onChange={(e) =>
                        patchActiveTab({
                          batchRows: activeTab.batchRows.map((r) =>
                            r.id === row.id
                              ? { ...r, title: e.target.value }
                              : r,
                          ),
                        })
                      }
                    />
                    <select
                      value={row.characterAssetId}
                      onChange={(e) =>
                        patchActiveTab({
                          batchRows: activeTab.batchRows.map((r) =>
                            r.id === row.id
                              ? { ...r, characterAssetId: e.target.value }
                              : r,
                          ),
                        })
                      }
                    >
                      <option value="">Character Sheet…</option>
                      {characterSheets.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.referenceVideoId}
                      onChange={(e) =>
                        patchActiveTab({
                          batchRows: activeTab.batchRows.map((r) =>
                            r.id === row.id
                              ? { ...r, referenceVideoId: e.target.value }
                              : r,
                          ),
                        })
                      }
                    >
                      <option value="">Reference Video…</option>
                      {referenceVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                    <StyledSubtleBtn
                      type="button"
                      onClick={() =>
                        patchActiveTab({
                          batchRows: activeTab.batchRows.filter(
                            (r) => r.id !== row.id,
                          ),
                        })
                      }
                    >
                      ×
                    </StyledSubtleBtn>
                  </StyledBatchRowCard>
                ))}

                <StyledPrimaryCta
                  type="button"
                  disabled={busyGenerate || activeTab.batchRows.length === 0}
                  onClick={() => void handleRunBatch()}
                >
                  {busyGenerate
                    ? 'Queuing batch…'
                    : `Generate ${activeTab.batchRows.length} Videos`}
                </StyledPrimaryCta>
              </StyledSlotCard>
            </StyledBuilderStack>
          ) : (
            /* ================= STEP 3: TEXT HOOKS & DRIVE ================= */
            <DeliveryStudioHooksStage
              companyId={activeTab.companyId}
              projectId={activeTab.projectId}
              selectedVideo={selectedVideo}
              videos={generatedVideos}
              onSelectVideo={(vid) =>
                patchActiveTab({ selectedVideoAssetId: vid.id })
              }
              hookPresets={hookPresets}
              hookDefault={workspace?.hookDefault ?? null}
              hasClientHookDefault={Boolean(workspace?.hasClientHookDefault)}
              onRefreshWorkspace={() => void workspaceQuery.refetch()}
            />
          )}
        </StyledCanvas>

        {/* Queue Dock — hidden unless toggled open or jobs are actively running */}
        {queueOpen && (
          <DeliveryStudioQueueDock
            jobs={workspace?.jobs ?? []}
            clients={clients}
            onJumpToClient={(companyId, projectId) => {
              setTabsState((prev) =>
                focusOrCreateClientTab(prev, { companyId, projectId }),
              );
            }}
            onRefresh={() => void workspaceQuery.refetch()}
          />
        )}
      </StyledShell>

      {/* Visual Library Modal (Avatars / Environments / Reference Videos) */}
      {libraryModal && (
        <DeliveryStudioLibraryModal
          mode={libraryModal}
          companyId={activeTab.companyId}
          projectId={activeTab.projectId}
          selectedId={
            libraryModal === 'AVATAR'
              ? activeTab.selectedAvatarPresetId
              : libraryModal === 'ENVIRONMENT'
                ? activeTab.selectedEnvironmentPresetId
                : activeTab.selectedReferenceVideoId
          }
          presets={presets}
          referenceVideos={referenceVideos}
          onSelectPreset={(preset) => {
            if (preset.kind === 'CASTING_PERSONA') {
              patchActiveTab({ selectedAvatarPresetId: preset.id });
            } else if (preset.kind === 'ENVIRONMENT') {
              patchActiveTab({ selectedEnvironmentPresetId: preset.id });
            }
          }}
          onSelectReferenceVideo={(video) => {
            const minSec = currentVideoModel?.capabilities.minDurationSec ?? 4;
            const maxSec = currentVideoModel?.capabilities.maxDurationSec ?? 15;
            const knownDur =
              typeof video.mediaMeta?.durationSec === 'number' &&
              Number.isFinite(video.mediaMeta.durationSec) &&
              video.mediaMeta.durationSec > 0
                ? video.mediaMeta.durationSec
                : (detectedRefDurations[video.id] ?? null);
            patchActiveTab({
              selectedReferenceVideoId: video.id,
              videoDurationAutoMatched: true,
              ...(knownDur !== null
                ? {
                    videoDurationSec: Math.max(
                      minSec,
                      Math.min(maxSec, Math.round(knownDur)),
                    ),
                  }
                : {}),
            });
          }}
          onCreated={async () => {
            await workspaceQuery.refetch();
          }}
          onClose={() => setLibraryModal(null)}
        />
      )}

      {/* Slide-over Studio Settings Drawer (behind tiny ⚙ icon) */}
      {settingsOpen && (
        <DeliveryStudioSettingsDrawer
          tab={activeTab}
          isClothingBrandClient={isClothingBrandClient}
          canManageProviders={Boolean(workspace?.canManageProviders)}
          imageModels={imageModels}
          videoModels={videoModels}
          characterPresets={characterPresets}
          videoPresets={videoPresets}
          referenceVideoDurationSec={effectiveRefDurationSec}
          onPatchTab={patchActiveTab}
          onOpenProviders={() => setProviderModalOpen(true)}
          onOpenPresets={() => setPresetModalOpen(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Provider API Keys & Failover Modal (opened from Settings) */}
      {workspace && (
        <DeliveryStudioProviderModal
          open={providerModalOpen}
          canManage={workspace.canManageProviders}
          config={workspace.providerConfig}
          catalog={workspace.catalog}
          onClose={() => setProviderModalOpen(false)}
          onSaved={() => void workspaceQuery.refetch()}
        />
      )}

      {/* Master Prompt Presets Modal (opened from Settings) */}
      <DeliveryStudioPresetModal
        open={presetModalOpen}
        presets={presets}
        companyId={activeTab.companyId}
        projectId={activeTab.projectId}
        onClose={() => setPresetModalOpen(false)}
        onSaved={() => void workspaceQuery.refetch()}
      />
    </DeliveryOperationalPage>
  );
};
