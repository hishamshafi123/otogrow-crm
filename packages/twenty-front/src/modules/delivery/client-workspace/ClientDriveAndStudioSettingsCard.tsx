import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  BIND_DELIVERY_CLIENT_DRIVE_FOLDER,
  GET_DELIVERY_DRIVE_CONFIG,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import { type DeliveryDriveConfig } from '@/delivery/deliverables/delivery-deliverables.types';
import { DeliveryDriveFolderPicker } from '@/delivery/deliverables/DeliveryDriveFolderPicker';
import {
  GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS,
  GET_DELIVERY_STUDIO_WORKSPACE,
  UPSERT_DELIVERY_STUDIO_PRESET,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  DEFAULT_TEXT_HOOK_MASTER_PROMPT,
  type StudioDriveFoldersResponseDTO,
  type StudioWorkspacePayload,
} from '@/delivery/studio/delivery-studio.types';

const StyledGrid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
`;

const StyledCard = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`;

const StyledHeader = styled.div`
  align-items: flex-start;
  display: flex;
  gap: 10px;
  justify-content: space-between;

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 14px;
    font-weight: 700;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    margin: 4px 0 0;
  }
`;

const StyledBadge = styled.span<{ $tone?: 'ok' | 'muted' | 'info' }>`
  background: ${({ $tone }) =>
    $tone === 'ok'
      ? themeCssVariables.background.transparent.light
      : $tone === 'info'
        ? themeCssVariables.background.transparent.blue
        : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'ok'
        ? themeCssVariables.color.green
        : $tone === 'info'
          ? themeCssVariables.color.blue
          : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === 'ok'
      ? themeCssVariables.color.green
      : $tone === 'info'
        ? themeCssVariables.color.blue
        : themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
`;

const StyledFieldRow = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: 140px 1fr;
`;

const StyledLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 600;
  gap: 5px;

  input,
  textarea {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 7px;
    color: ${themeCssVariables.font.color.primary};
    font-family: inherit;
    font-size: 12px;
    padding: 7px 10px;
  }

  textarea {
    line-height: 1.45;
    min-height: 86px;
    resize: vertical;
  }
`;

const StyledCycleBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  gap: 4px;
  padding: 9px 11px;

  strong {
    color: ${themeCssVariables.font.color.primary};
  }

  a {
    color: ${themeCssVariables.color.blue};
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const StyledActionsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const StyledButton = styled.button<{ $primary?: boolean }>`
  background: ${({ $primary }) =>
    $primary
      ? themeCssVariables.color.blue
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $primary }) =>
      $primary
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${({ $primary }) =>
    $primary
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const StyledMessage = styled.div<{ $error?: boolean }>`
  background: ${({ $error }) =>
    $error
      ? themeCssVariables.background.danger
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ $error }) =>
      $error
        ? themeCssVariables.border.color.danger
        : themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${({ $error }) =>
    $error
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.primary};
  font-size: 12px;
  padding: 7px 10px;
`;

const StyledFolderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledFolderRow = styled.div<{ $isDefault?: boolean }>`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid
    ${({ $isDefault }) =>
      $isDefault
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
`;

const StyledFolderTopRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
`;

const StyledFolderTitle = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  min-width: 140px;

  a {
    color: ${themeCssVariables.color.blue};
    font-size: 11px;
    font-weight: 600;
    margin-left: 4px;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const StyledFolderControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledMiniBtn = styled.button<{ $active?: boolean; $danger?: boolean }>`
  background: ${({ $active }) =>
    $active
      ? themeCssVariables.background.transparent.blue
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $active, $danger }) =>
      $danger
        ? themeCssVariables.border.color.danger
        : $active
          ? themeCssVariables.color.blue
          : themeCssVariables.border.color.medium};
  border-radius: 6px;
  color: ${({ $active, $danger }) =>
    $danger
      ? themeCssVariables.font.color.danger
      : $active
        ? themeCssVariables.color.blue
        : themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledFolderLabelInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.color.blue};
    outline: none;
  }
`;

const StyledPreviewTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 4px;
`;

const StyledPreviewPill = styled.button<{ $active?: boolean }>`
  background: ${({ $active }) =>
    $active
      ? themeCssVariables.background.transparent.blue
      : themeCssVariables.background.primary};
  border: 1px solid
    ${({ $active }) =>
      $active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ $active }) =>
    $active
      ? themeCssVariables.color.blue
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
`;

type LinkedFolderDraft = {
  id: string;
  name: string;
  webViewLink: string | null;
  label: string;
  isDefault: boolean;
};

type ClientDriveAndStudioSettingsCardProps = {
  companyId: string;
  companyName: string;
  projectId?: string | null;
};

export const ClientDriveAndStudioSettingsCard = ({
  companyId,
  companyName,
  projectId,
}: ClientDriveAndStudioSettingsCardProps) => {
  const [previewRootFolderId, setPreviewRootFolderId] = useState<string>('');

  const driveConfigQuery = useQuery<{
    deliveryDriveConfig: DeliveryDriveConfig;
  }>(GET_DELIVERY_DRIVE_CONFIG, { fetchPolicy: 'cache-and-network' });

  const driveFoldersQuery = useQuery<{
    deliveryStudioClientDriveFolders: StudioDriveFoldersResponseDTO;
  }>(GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS, {
    variables: {
      companyId,
      rootFolderId: previewRootFolderId || null,
    },
    skip: !companyId,
    fetchPolicy: 'cache-and-network',
  });

  const studioWorkspaceQuery = useQuery<{
    deliveryStudioWorkspace: StudioWorkspacePayload;
  }>(GET_DELIVERY_STUDIO_WORKSPACE, {
    variables: { companyId, projectId: projectId ?? null },
    skip: !companyId,
    fetchPolicy: 'cache-and-network',
  });

  const [bindClientFolder, { loading: savingDrive }] = useMutation(
    BIND_DELIVERY_CLIENT_DRIVE_FOLDER,
  );
  const [upsertPreset, { loading: savingPrompt }] = useMutation(
    UPSERT_DELIVERY_STUDIO_PRESET,
  );

  const driveConfig = driveConfigQuery.data?.deliveryDriveConfig;
  const driveInfo = driveFoldersQuery.data?.deliveryStudioClientDriveFolders;
  const existingMapping = useMemo(
    () =>
      (driveConfig?.clientMappings ?? []).find(
        (m) => m.companyId === companyId,
      ) ?? null,
    [companyId, driveConfig?.clientMappings],
  );

  const [linkedFolders, setLinkedFolders] = useState<LinkedFolderDraft[]>([]);
  const [monthStartDayInput, setMonthStartDayInput] = useState('1');
  const [patternOverride, setPatternOverride] = useState('');
  const [driveFeedback, setDriveFeedback] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    setPreviewRootFolderId('');
  }, [companyId]);

  useEffect(() => {
    if (existingMapping) {
      const fromList =
        existingMapping.rootFolders && existingMapping.rootFolders.length > 0
          ? existingMapping.rootFolders.map((f, idx) => ({
              id: f.id,
              name: f.name,
              webViewLink: f.webViewLink,
              label: f.label ?? '',
              isDefault: Boolean(f.isDefault) || idx === 0,
            }))
          : existingMapping.rootFolderId
            ? [
                {
                  id: existingMapping.rootFolderId,
                  name: existingMapping.rootFolderName,
                  webViewLink: existingMapping.rootFolderWebUrl,
                  label: '',
                  isDefault: true,
                },
              ]
            : [];
      const hasDefault = fromList.some((f) => f.isDefault);
      setLinkedFolders(
        fromList.map((f, idx) => ({
          ...f,
          isDefault: hasDefault ? f.isDefault : idx === 0,
        })),
      );
      setMonthStartDayInput(String(existingMapping.monthStartDay ?? 1));
      setPatternOverride(existingMapping.monthFolderPatternOverride ?? '');
    } else if (driveInfo?.clientMapped) {
      const fromInfo =
        driveInfo.rootFolders && driveInfo.rootFolders.length > 0
          ? driveInfo.rootFolders.map((f, idx) => ({
              id: f.id,
              name: f.name,
              webViewLink: f.webViewLink,
              label: f.label ?? '',
              isDefault: Boolean(f.isDefault) || idx === 0,
            }))
          : driveInfo.rootFolderId
            ? [
                {
                  id: driveInfo.rootFolderId,
                  name: driveInfo.rootFolderName ?? '',
                  webViewLink: driveInfo.rootFolderWebUrl ?? null,
                  label: '',
                  isDefault: true,
                },
              ]
            : [];
      setLinkedFolders(fromInfo);
      setMonthStartDayInput(String(driveInfo.monthStartDay ?? 1));
      setPatternOverride('');
    } else {
      setLinkedFolders([]);
      setMonthStartDayInput(String(driveInfo?.monthStartDay ?? 1));
      setPatternOverride('');
    }
  }, [
    companyId,
    driveInfo?.clientMapped,
    driveInfo?.monthStartDay,
    driveInfo?.rootFolderId,
    driveInfo?.rootFolderName,
    driveInfo?.rootFolderWebUrl,
    driveInfo?.rootFolders,
    existingMapping,
  ]);

  const handleAddLinkedFolder = (folder: {
    id: string;
    name: string;
    webViewLink: string | null;
  }) => {
    setDriveFeedback(null);
    setLinkedFolders((prev) => {
      if (prev.some((f) => f.id === folder.id)) {
        return prev;
      }
      if (prev.length >= 15) {
        setDriveFeedback({
          text: 'You can link up to 15 main Drive folders per client.',
          isError: true,
        });
        return prev;
      }
      return [
        ...prev,
        {
          id: folder.id,
          name: folder.name,
          webViewLink: folder.webViewLink,
          label: '',
          isDefault: prev.length === 0,
        },
      ];
    });
  };

  const handleSetDefaultFolder = (folderIdToMakeDefault: string) => {
    setLinkedFolders((prev) =>
      prev.map((f) => ({
        ...f,
        isDefault: f.id === folderIdToMakeDefault,
      })),
    );
  };

  const handleUpdateFolderLabel = (folderIdToEdit: string, label: string) => {
    setLinkedFolders((prev) =>
      prev.map((f) => (f.id === folderIdToEdit ? { ...f, label } : f)),
    );
  };

  const handleRemoveLinkedFolder = (folderIdToRemove: string) => {
    setLinkedFolders((prev) => {
      const remaining = prev.filter((f) => f.id !== folderIdToRemove);
      if (remaining.length > 0 && !remaining.some((f) => f.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      return remaining;
    });
    if (previewRootFolderId === folderIdToRemove) {
      setPreviewRootFolderId('');
    }
  };

  // Brand Text-Hook Master Prompt state
  const brandHookPreset = useMemo(() => {
    const presets = studioWorkspaceQuery.data?.deliveryStudioWorkspace?.presets ?? [];
    const textHookPresets = presets.filter((p) => p.kind === 'TEXT_HOOK');
    return (
      textHookPresets.find((p) => p.companyId === companyId && p.isDefault) ??
      textHookPresets.find((p) => p.companyId === companyId) ??
      null
    );
  }, [companyId, studioWorkspaceQuery.data?.deliveryStudioWorkspace?.presets]);

  const [masterPrompt, setMasterPrompt] = useState(
    DEFAULT_TEXT_HOOK_MASTER_PROMPT,
  );
  const [exampleHooksText, setExampleHooksText] = useState('');
  const [promptFeedback, setPromptFeedback] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    if (brandHookPreset) {
      setMasterPrompt(
        brandHookPreset.masterPrompt?.trim() || DEFAULT_TEXT_HOOK_MASTER_PROMPT,
      );
      setExampleHooksText(
        (brandHookPreset.examplesJson ?? []).filter(Boolean).join('\n'),
      );
    } else {
      setMasterPrompt(DEFAULT_TEXT_HOOK_MASTER_PROMPT);
      setExampleHooksText('');
    }
  }, [brandHookPreset, companyId]);

  const handleSaveDrive = async (autoCreate: boolean) => {
    setDriveFeedback(null);
    const parsedDay = Math.round(Number(monthStartDayInput));
    const clampedDay =
      Number.isFinite(parsedDay) && parsedDay >= 1
        ? Math.min(31, parsedDay)
        : 1;
    setMonthStartDayInput(String(clampedDay));

    const defaultFolder =
      linkedFolders.find((f) => f.isDefault) ?? linkedFolders[0] ?? null;

    try {
      await bindClientFolder({
        variables: {
          input: {
            companyId,
            companyName,
            autoCreate,
            rootFolderId: autoCreate ? undefined : defaultFolder?.id || undefined,
            rootFolderName: autoCreate
              ? undefined
              : defaultFolder?.name || undefined,
            rootFolders:
              autoCreate || linkedFolders.length === 0
                ? undefined
                : linkedFolders.map((f) => ({
                    id: f.id,
                    name: f.name,
                    label: f.label.trim() ? f.label.trim() : null,
                    isDefault: f.id === defaultFolder?.id,
                  })),
            monthStartDay: clampedDay,
            monthFolderPatternOverride: patternOverride.trim()
              ? patternOverride.trim()
              : null,
          },
        },
      });
      await Promise.all([
        driveConfigQuery.refetch(),
        driveFoldersQuery.refetch(),
      ]);
      const countLabel = autoCreate
        ? 'Google Drive folder'
        : `${linkedFolders.length} main Google Drive folder${linkedFolders.length === 1 ? '' : 's'}`;
      setDriveFeedback({
        text: `Saved ${countLabel} & month cycle (starts day ${clampedDay}) for ${companyName}.`,
      });
    } catch (error) {
      setDriveFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not save Google Drive folder setup.',
        isError: true,
      });
    }
  };

  const handleSaveBrandHookPrompt = async () => {
    setPromptFeedback(null);
    const cleanedPrompt = masterPrompt.trim();
    if (!cleanedPrompt) {
      setPromptFeedback({
        text: 'Master prompt cannot be empty.',
        isError: true,
      });
      return;
    }
    const examplesJson = exampleHooksText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 20);

    try {
      await upsertPreset({
        variables: {
          input: {
            ...(brandHookPreset ? { id: brandHookPreset.id } : {}),
            companyId,
            projectId: projectId ?? null,
            kind: 'TEXT_HOOK',
            name: brandHookPreset?.name || `${companyName} Text Hooks`,
            description: `Brand text-hook master prompt for ${companyName}`,
            masterPrompt: cleanedPrompt,
            examplesJson,
            isDefault: true,
          },
        },
      });
      await studioWorkspaceQuery.refetch();
      setPromptFeedback({
        text: `Saved text-hook master prompt & ${examplesJson.length} working example${examplesJson.length === 1 ? '' : 's'} for ${companyName}.`,
      });
    } catch (error) {
      setPromptFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not save brand text-hook prompt.',
        isError: true,
      });
    }
  };

  const driveConnected = Boolean(
    driveConfig?.connected ?? driveInfo?.connected,
  );
  const canManageDrive = Boolean(
    driveConfig?.googleEmail ||
      (driveConfig?.clientMappings?.length ?? 0) > 0 ||
      driveConfig?.connected,
  );
  const savedRootFolders = driveInfo?.rootFolders ?? [];
  const activePreviewRootId =
    previewRootFolderId ||
    driveInfo?.selectedRootFolderId ||
    driveInfo?.rootFolderId ||
    '';

  return (
    <StyledGrid>
      <StyledCard>
        <StyledHeader>
          <div>
            <h3>Google Drive Main Folders &amp; Month Cycle</h3>
            <p>
              Link one or more main Google Drive folders for {companyName} (e.g.
              Reels, Paid Ads, UGC) and set their monthly cycle start day.
            </p>
          </div>
          {driveConnected && (linkedFolders.length > 0 || driveInfo?.clientMapped) ? (
            <StyledBadge $tone="ok">
              {linkedFolders.length > 1
                ? `${linkedFolders.length} Folders Linked`
                : 'Folder Linked'}
            </StyledBadge>
          ) : driveConnected ? (
            <StyledBadge $tone="muted">Unmapped</StyledBadge>
          ) : (
            <StyledBadge $tone="muted">Drive Not Connected</StyledBadge>
          )}
        </StyledHeader>

        {!driveConnected ? (
          <StyledCycleBox>
            <span>
              Google Drive is not connected for this workspace yet. Connect it
              once in Deliverables settings to browse and link client folders.
            </span>
            <Link to="/delivery?view=deliverables">
              Open Deliverables &amp; Connect Google Drive →
            </Link>
          </StyledCycleBox>
        ) : (
          <>
            {linkedFolders.length > 0 && (
              <StyledFolderList>
                {linkedFolders.map((folder) => (
                  <StyledFolderRow key={folder.id} $isDefault={folder.isDefault}>
                    <StyledFolderTopRow>
                      <StyledFolderTitle title={folder.name}>
                        <span>{folder.isDefault ? '★' : '📁'}</span>
                        <span>{folder.name || folder.id}</span>
                        <a
                          href={
                            folder.webViewLink ||
                            `https://drive.google.com/drive/folders/${folder.id}`
                          }
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open ↗
                        </a>
                      </StyledFolderTitle>
                      <StyledFolderControls>
                        {folder.isDefault ? (
                          <StyledMiniBtn type="button" $active disabled>
                            Default
                          </StyledMiniBtn>
                        ) : (
                          <StyledMiniBtn
                            type="button"
                            onClick={() => handleSetDefaultFolder(folder.id)}
                          >
                            Set default
                          </StyledMiniBtn>
                        )}
                        <StyledMiniBtn
                          type="button"
                          $danger
                          onClick={() => handleRemoveLinkedFolder(folder.id)}
                        >
                          Remove
                        </StyledMiniBtn>
                      </StyledFolderControls>
                    </StyledFolderTopRow>
                    <StyledFolderLabelInput
                      type="text"
                      maxLength={80}
                      placeholder="Optional label (e.g. Reels, Paid Ads, UGC, Raw Footage)"
                      value={folder.label}
                      onChange={(e) =>
                        handleUpdateFolderLabel(folder.id, e.target.value)
                      }
                    />
                  </StyledFolderRow>
                ))}
              </StyledFolderList>
            )}

            <DeliveryDriveFolderPicker
              selectedFolderIds={linkedFolders.map((f) => f.id)}
              selectLabel="+ Add"
              selectedLabel="✓ Added"
              placeholder={
                linkedFolders.length > 0
                  ? `Search Google Drive to add another main folder for ${companyName}…`
                  : `Search Google Drive for ${companyName}’s main folder…`
              }
              onSelect={handleAddLinkedFolder}
            />

            <StyledFieldRow>
              <StyledLabel>
                Month starts day (1–31)
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={monthStartDayInput}
                  onChange={(e) => setMonthStartDayInput(e.target.value)}
                />
              </StyledLabel>
              <StyledLabel>
                Month folder pattern override (optional)
                <input
                  type="text"
                  placeholder="Default: {Month} {YYYY}"
                  value={patternOverride}
                  onChange={(e) => setPatternOverride(e.target.value)}
                />
              </StyledLabel>
            </StyledFieldRow>

            {driveInfo && (
              <StyledCycleBox>
                {savedRootFolders.length > 1 && (
                  <StyledPreviewTabs>
                    {savedRootFolders.map((rf) => (
                      <StyledPreviewPill
                        key={rf.id}
                        type="button"
                        $active={activePreviewRootId === rf.id}
                        onClick={() => setPreviewRootFolderId(rf.id)}
                      >
                        {rf.isDefault ? '★ ' : '📁 '}
                        {rf.label ? `${rf.label} (${rf.name})` : rf.name}
                      </StyledPreviewPill>
                    ))}
                  </StyledPreviewTabs>
                )}
                <div>
                  Active cycle:{' '}
                  <strong>
                    {driveInfo.activeCycleLabel || driveInfo.activeMonthKey}
                  </strong>{' '}
                  (starts day {driveInfo.monthStartDay ?? 1}
                  {driveInfo.monthStartDaySource === 'BILLING_SCHEDULE'
                    ? ' · from billing schedule'
                    : ''}
                  )
                </div>
                {driveInfo.clientMapped ? (
                  driveInfo.matchedMonthFolder ? (
                    <div>
                      ✓ Auto-matched existing month folder
                      {driveInfo.rootFolderName
                        ? ` in ${driveInfo.rootFolderName}`
                        : ''}
                      :{' '}
                      <a
                        href={
                          driveInfo.matchedMonthFolder.webViewLink ??
                          `https://drive.google.com/drive/folders/${driveInfo.matchedMonthFolder.id}`
                        }
                        rel="noreferrer"
                        target="_blank"
                      >
                        📁 {driveInfo.matchedMonthFolder.name} ↗
                      </a>
                    </div>
                  ) : (
                    <div>
                      No matching month subfolder found yet
                      {driveInfo.rootFolderName
                        ? ` in ${driveInfo.rootFolderName}`
                        : ''}{' '}
                      — will create{' '}
                      <strong>📁 {driveInfo.expectedMonthFolderName}</strong> on
                      first upload.
                    </div>
                  )
                ) : (
                  <div>
                    Add one or more Drive folders above so AI Studio
                    automatically routes uploads into the active month folder.
                  </div>
                )}
              </StyledCycleBox>
            )}

            {canManageDrive && (
              <StyledActionsRow>
                <StyledButton
                  type="button"
                  $primary
                  disabled={savingDrive || linkedFolders.length === 0}
                  onClick={() => void handleSaveDrive(false)}
                >
                  {savingDrive
                    ? 'Saving…'
                    : linkedFolders.length > 1
                      ? `Save ${linkedFolders.length} Folders & Cycle`
                      : 'Save Drive Folder & Cycle'}
                </StyledButton>
                <StyledButton
                  type="button"
                  disabled={savingDrive}
                  onClick={() => void handleSaveDrive(true)}
                >
                  Auto-Create Folder
                </StyledButton>
              </StyledActionsRow>
            )}

            {driveFeedback && (
              <StyledMessage $error={driveFeedback.isError}>
                {driveFeedback.text}
              </StyledMessage>
            )}
          </>
        )}
      </StyledCard>

      <StyledCard>
        <StyledHeader>
          <div>
            <h3>AI Text-Hook Master Prompt</h3>
            <p>
              Control how AI writes on-screen text hooks for {companyName} in AI
              Studio &amp; feed in hooks that already convert.
            </p>
          </div>
          {brandHookPreset ? (
            <StyledBadge $tone="info">Brand Custom</StyledBadge>
          ) : (
            <StyledBadge $tone="muted">Workspace Default</StyledBadge>
          )}
        </StyledHeader>

        <StyledLabel>
          Brand Master Prompt
          <textarea
            value={masterPrompt}
            onChange={(e) => setMasterPrompt(e.target.value)}
            placeholder="Describe voice, structure, hook formulas, do's & don'ts for this brand…"
          />
        </StyledLabel>

        <StyledLabel>
          Working Example Hooks (one per line)
          <textarea
            value={exampleHooksText}
            onChange={(e) => setExampleHooksText(e.target.value)}
            placeholder={
              'POV: you finally stopped buying boxy tees that lose shape\n3 styling mistakes making your streetwear fit look cheap'
            }
          />
        </StyledLabel>

        <StyledActionsRow>
          <StyledButton
            type="button"
            $primary
            disabled={savingPrompt}
            onClick={() => void handleSaveBrandHookPrompt()}
          >
            {savingPrompt ? 'Saving…' : `Save Prompt for ${companyName}`}
          </StyledButton>
          <StyledButton
            type="button"
            disabled={savingPrompt}
            onClick={() => setMasterPrompt(DEFAULT_TEXT_HOOK_MASTER_PROMPT)}
          >
            Reset to Default
          </StyledButton>
        </StyledActionsRow>

        {promptFeedback && (
          <StyledMessage $error={promptFeedback.isError}>
            {promptFeedback.text}
          </StyledMessage>
        )}
      </StyledCard>
    </StyledGrid>
  );
};
