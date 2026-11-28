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
  const driveConfigQuery = useQuery<{
    deliveryDriveConfig: DeliveryDriveConfig;
  }>(GET_DELIVERY_DRIVE_CONFIG, { fetchPolicy: 'cache-and-network' });

  const driveFoldersQuery = useQuery<{
    deliveryStudioClientDriveFolders: StudioDriveFoldersResponseDTO;
  }>(GET_DELIVERY_STUDIO_CLIENT_DRIVE_FOLDERS, {
    variables: { companyId },
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

  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [folderWebUrl, setFolderWebUrl] = useState<string | null>(null);
  const [monthStartDayInput, setMonthStartDayInput] = useState('1');
  const [patternOverride, setPatternOverride] = useState('');
  const [driveFeedback, setDriveFeedback] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    if (existingMapping) {
      setFolderId(existingMapping.rootFolderId);
      setFolderName(existingMapping.rootFolderName);
      setFolderWebUrl(existingMapping.rootFolderWebUrl);
      setMonthStartDayInput(String(existingMapping.monthStartDay ?? 1));
      setPatternOverride(existingMapping.monthFolderPatternOverride ?? '');
    } else if (driveInfo?.clientMapped && driveInfo.rootFolderId) {
      setFolderId(driveInfo.rootFolderId);
      setFolderName(driveInfo.rootFolderName ?? '');
      setFolderWebUrl(driveInfo.rootFolderWebUrl ?? null);
      setMonthStartDayInput(String(driveInfo.monthStartDay ?? 1));
      setPatternOverride('');
    } else {
      setFolderId('');
      setFolderName('');
      setFolderWebUrl(null);
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
    existingMapping,
  ]);

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

    try {
      await bindClientFolder({
        variables: {
          input: {
            companyId,
            companyName,
            autoCreate,
            rootFolderId: autoCreate ? undefined : folderId || undefined,
            rootFolderName: autoCreate ? undefined : folderName || undefined,
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
      setDriveFeedback({
        text: `Saved Google Drive folder & month cycle (starts day ${clampedDay}) for ${companyName}.`,
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
    driveConfig?.googleEmail || (driveConfig?.clientMappings?.length ?? 0) > 0 || driveConfig?.connected,
  );

  return (
    <StyledGrid>
      <StyledCard>
        <StyledHeader>
          <div>
            <h3>Google Drive Folder &amp; Month Cycle</h3>
            <p>
              Connect {companyName}’s Google Drive folder and set which day of
              the month their billing/content cycle starts.
            </p>
          </div>
          {driveConnected && (folderId || driveInfo?.clientMapped) ? (
            <StyledBadge $tone="ok">Folder Linked</StyledBadge>
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
            <DeliveryDriveFolderPicker
              selectedFolderId={folderId}
              selectedFolderName={folderName}
              selectedFolderWebUrl={folderWebUrl}
              placeholder={`Search Google Drive for ${companyName}’s folder…`}
              onSelect={(folder) => {
                setFolderId(folder.id);
                setFolderName(folder.name);
                setFolderWebUrl(folder.webViewLink);
              }}
              onClear={() => {
                setFolderId('');
                setFolderName('');
                setFolderWebUrl(null);
              }}
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
                      ✓ Auto-matched existing month folder:{' '}
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
                      No matching month subfolder found yet — will create{' '}
                      <strong>📁 {driveInfo.expectedMonthFolderName}</strong> on
                      first upload.
                    </div>
                  )
                ) : (
                  <div>
                    Select a Drive folder above so AI Studio automatically
                    routes uploads into the active month folder.
                  </div>
                )}
              </StyledCycleBox>
            )}

            {canManageDrive && (
              <StyledActionsRow>
                <StyledButton
                  type="button"
                  $primary
                  disabled={savingDrive || !folderId}
                  onClick={() => void handleSaveDrive(false)}
                >
                  {savingDrive ? 'Saving…' : 'Save Drive Folder & Cycle'}
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
