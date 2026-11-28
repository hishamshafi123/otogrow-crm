import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  BIND_DELIVERY_CLIENT_DRIVE_FOLDER,
  CREATE_DELIVERY_DRIVE_FOLDER,
  DISCONNECT_DELIVERY_DRIVE,
  GET_DELIVERY_DRIVE_CONFIG,
  RUN_DELIVERY_VPS_CLEANUP,
  START_DELIVERY_DRIVE_OAUTH,
  UPDATE_DELIVERY_DRIVE_SETTINGS,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import {
  currentMonthKeyInput,
  type DeliveryDriveConfig,
  type DriveFolderMode,
  type DriveFolderOption,
  formatBytesHuman,
  previewDriveMonthFolder,
  type VpsCleanupSummary,
} from '@/delivery/deliverables/delivery-deliverables.types';
import { DeliveryDriveFolderPicker } from '@/delivery/deliverables/DeliveryDriveFolderPicker';

const StyledPanel = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: 15px;
  font-weight: 700;
  margin: 0;
`;

const StyledSubtext = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
  margin: 4px 0 0;
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const StyledGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
`;

const StyledLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 600;
  gap: 5px;
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 7px 10px;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 7px 10px;
`;

const StyledButton = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' }>`
  background: ${({ $variant }) =>
    $variant === 'primary'
      ? themeCssVariables.color.blue
      : $variant === 'danger'
        ? themeCssVariables.background.danger
        : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $variant }) =>
      $variant === 'primary'
        ? themeCssVariables.color.blue
        : $variant === 'danger'
          ? themeCssVariables.border.color.danger
          : themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${({ $variant }) =>
    $variant === 'primary'
      ? themeCssVariables.font.color.inverted
      : $variant === 'danger'
        ? themeCssVariables.font.color.danger
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

const StyledChip = styled.button<{ $active?: boolean }>`
  background: ${({ $active }) =>
    $active
      ? themeCssVariables.background.transparent.blue
      : themeCssVariables.background.secondary};
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
  padding: 4px 9px;
`;

const StyledBadge = styled.span<{ $tone?: 'ok' | 'warn' | 'muted' }>`
  background: ${({ $tone }) =>
    $tone === 'ok'
      ? themeCssVariables.background.transparent.light
      : $tone === 'warn'
        ? themeCssVariables.background.danger
        : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'ok'
        ? themeCssVariables.color.green
        : $tone === 'warn'
          ? themeCssVariables.border.color.danger
          : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === 'ok'
      ? themeCssVariables.color.green
      : $tone === 'warn'
        ? themeCssVariables.font.color.danger
        : themeCssVariables.font.color.secondary};
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
`;

const StyledPreviewBox = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
`;

const StyledCheckboxRow = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  gap: 8px;
`;

const StyledClientList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledClientRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 10px 12px;
`;

const StyledMessage = styled.div<{ $error?: boolean }>`
  background: ${({ $error }) =>
    $error
      ? themeCssVariables.background.danger
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $error }) =>
      $error
        ? themeCssVariables.border.color.danger
        : themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${({ $error }) =>
    $error
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.primary};
  font-size: 12px;
  padding: 8px 12px;
`;

const StyledLink = styled.a`
  color: ${themeCssVariables.color.blue};
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const StyledRootFolderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledRootFolderItem = styled.div<{ $isDefault?: boolean }>`
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

const StyledRootFolderMeta = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
`;

const StyledRootLabelInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 6px;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  width: 100%;
`;

const StyledFolderTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
`;

const StyledFolderTagLink = styled.a<{ $isDefault?: boolean }>`
  background: ${({ $isDefault }) =>
    $isDefault
      ? themeCssVariables.background.transparent.blue
      : themeCssVariables.background.primary};
  border: 1px solid
    ${({ $isDefault }) =>
      $isDefault
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${({ $isDefault }) =>
    $isDefault
      ? themeCssVariables.color.blue
      : themeCssVariables.font.color.primary};
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

type DeliveryDriveSettingsPanelProps = {
  clients: { id: string; name: string }[];
  onClose?: () => void;
};

export const DeliveryDriveSettingsPanel = ({
  clients,
  onClose,
}: DeliveryDriveSettingsPanelProps) => {
  const {
    data,
    loading,
    error: configError,
    refetch,
  } = useQuery<{
    deliveryDriveConfig: DeliveryDriveConfig;
  }>(GET_DELIVERY_DRIVE_CONFIG, { fetchPolicy: 'network-only' });

  const [startOAuth, { loading: oauthLoading }] = useMutation<{
    startDeliveryDriveOAuth: { authorizeUrl: string };
  }>(START_DELIVERY_DRIVE_OAUTH);
  const [updateSettings, { loading: saving }] = useMutation(
    UPDATE_DELIVERY_DRIVE_SETTINGS,
  );
  const [disconnectDrive, { loading: disconnecting }] = useMutation(
    DISCONNECT_DELIVERY_DRIVE,
  );
  const [createFolder, { loading: creatingFolder }] = useMutation<{
    createDeliveryDriveFolder: DriveFolderOption;
  }>(CREATE_DELIVERY_DRIVE_FOLDER);
  const [bindClientFolder, { loading: bindingClient }] = useMutation(
    BIND_DELIVERY_CLIENT_DRIVE_FOLDER,
  );
  const [runCleanup, { loading: cleaning }] = useMutation<{
    runDeliveryVpsCleanup: VpsCleanupSummary;
  }>(RUN_DELIVERY_VPS_CLEANUP);

  const config = data?.deliveryDriveConfig;

  const [monthPattern, setMonthPattern] = useState('{Month} {YYYY}');
  const [folderMode, setFolderMode] = useState<DriveFolderMode>('FLAT');
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(true);
  const [autoPurgeHoursInput, setAutoPurgeHoursInput] = useState('24');
  const [rootFolderId, setRootFolderId] = useState<string>('');
  const [rootFolderName, setRootFolderName] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientRootFolders, setClientRootFolders] = useState<
    Array<{
      id: string;
      name: string;
      webViewLink: string | null;
      label: string;
      isDefault: boolean;
    }>
  >([]);
  const [clientMonthStartDay, setClientMonthStartDay] = useState('1');
  const [clientPatternOverride, setClientPatternOverride] = useState('');
  const [feedback, setFeedback] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [cleanupSummary, setCleanupSummary] =
    useState<VpsCleanupSummary | null>(null);

  useEffect(() => {
    if (!config) return;
    setMonthPattern(config.monthFolderPattern || '{Month} {YYYY}');
    setFolderMode(config.folderMode || 'FLAT');
    setIncludeOriginal(Boolean(config.includeOriginalInVariationFolder));
    setAutoPurgeEnabled(Boolean(config.autoPurgeVpsEnabled));
    setAutoPurgeHoursInput(String(config.autoPurgeVpsAfterHours || 24));
    setRootFolderId(config.rootFolderId ?? '');
    setRootFolderName(config.rootFolderName ?? '');
  }, [config]);

  const sampleMonth = currentMonthKeyInput();
  const liveMonthPreview = useMemo(
    () => previewDriveMonthFolder(sampleMonth, monthPattern),
    [sampleMonth, monthPattern],
  );

  const mappingsByCompanyId = useMemo(() => {
    const map = new Map<string, DeliveryDriveConfig['clientMappings'][number]>();
    for (const m of config?.clientMappings ?? []) {
      map.set(m.companyId, m);
    }
    return map;
  }, [config?.clientMappings]);

  const loadClientDraft = (companyIdToLoad: string) => {
    setSelectedClientId(companyIdToLoad);
    const existing = mappingsByCompanyId.get(companyIdToLoad);
    if (existing?.rootFolders && existing.rootFolders.length > 0) {
      const mapped = existing.rootFolders.map((f, idx) => ({
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink,
        label: f.label ?? '',
        isDefault: Boolean(f.isDefault) || idx === 0,
      }));
      const hasDefault = mapped.some((f) => f.isDefault);
      setClientRootFolders(
        mapped.map((f, idx) => ({
          ...f,
          isDefault: hasDefault ? f.isDefault : idx === 0,
        })),
      );
    } else if (existing?.rootFolderId) {
      setClientRootFolders([
        {
          id: existing.rootFolderId,
          name: existing.rootFolderName,
          webViewLink: existing.rootFolderWebUrl,
          label: '',
          isDefault: true,
        },
      ]);
    } else {
      setClientRootFolders([]);
    }
    setClientMonthStartDay(String(existing?.monthStartDay ?? 1));
    setClientPatternOverride(existing?.monthFolderPatternOverride ?? '');
  };

  const handleAddClientRootFolder = (folder: DriveFolderOption) => {
    setFeedback(null);
    setClientRootFolders((prev) => {
      if (prev.some((f) => f.id === folder.id)) return prev;
      if (prev.length >= 15) {
        setFeedback({
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

  const handleSetClientDefaultFolder = (folderIdToMakeDefault: string) => {
    setClientRootFolders((prev) =>
      prev.map((f) => ({ ...f, isDefault: f.id === folderIdToMakeDefault })),
    );
  };

  const handleUpdateClientFolderLabel = (
    folderIdToEdit: string,
    label: string,
  ) => {
    setClientRootFolders((prev) =>
      prev.map((f) => (f.id === folderIdToEdit ? { ...f, label } : f)),
    );
  };

  const handleRemoveClientRootFolder = (folderIdToRemove: string) => {
    setClientRootFolders((prev) => {
      const remaining = prev.filter((f) => f.id !== folderIdToRemove);
      if (remaining.length > 0 && !remaining.some((f) => f.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      return remaining;
    });
  };

  const handleConnect = async () => {
    setFeedback(null);
    try {
      const res = await startOAuth({
        variables: { returnTo: '/delivery?view=deliverables' },
      });
      const url = res.data?.startDeliveryDriveOAuth?.authorizeUrl;
      if (url) {
        window.location.assign(url);
      }
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not start Google Drive connection.',
        isError: true,
      });
    }
  };

  const handleSaveSettings = async () => {
    setFeedback(null);
    const parsedHours = Math.round(Number(autoPurgeHoursInput));
    const clampedHours =
      Number.isFinite(parsedHours) && parsedHours >= 1
        ? Math.min(720, parsedHours)
        : 24;
    setAutoPurgeHoursInput(String(clampedHours));
    try {
      await updateSettings({
        variables: {
          input: {
            rootFolderId: rootFolderId || null,
            rootFolderName: rootFolderName || null,
            monthFolderPattern: monthPattern.trim(),
            folderMode,
            includeOriginalInVariationFolder: includeOriginal,
            autoPurgeVpsEnabled: autoPurgeEnabled,
            autoPurgeVpsAfterHours: clampedHours,
          },
        },
      });
      await refetch();
      setFeedback({
        text: 'Saved Google Drive naming rules and VPS auto-cleanup settings.',
      });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not save Google Drive settings.',
        isError: true,
      });
    }
  };

  const handleDisconnect = async () => {
    setFeedback(null);
    try {
      await disconnectDrive();
      await refetch();
      setFeedback({ text: 'Disconnected Google Drive.' });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not disconnect Google Drive.',
        isError: true,
      });
    }
  };

  const handleCreateRootFolder = async () => {
    if (!newFolderName.trim()) return;
    setFeedback(null);
    try {
      const res = await createFolder({
        variables: {
          name: newFolderName.trim(),
          parentId: null,
        },
      });
      const created = res.data?.createDeliveryDriveFolder;
      if (created) {
        setRootFolderId(created.id);
        setRootFolderName(created.name);
        setNewFolderName('');
        setFeedback({
          text: `Created top-level Drive folder "${created.name}". Click Save Settings to set it as workspace root.`,
        });
      }
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not create Drive folder.',
        isError: true,
      });
    }
  };

  const handleBindClient = async (autoCreate: boolean) => {
    if (!selectedClientId) {
      setFeedback({ text: 'Select a client first.', isError: true });
      return;
    }
    const client = clients.find((c) => c.id === selectedClientId);
    const parsedDay = Math.round(Number(clientMonthStartDay));
    const clampedDay =
      Number.isFinite(parsedDay) && parsedDay >= 1
        ? Math.min(31, parsedDay)
        : 1;
    setClientMonthStartDay(String(clampedDay));
    setFeedback(null);

    const defaultFolder =
      clientRootFolders.find((f) => f.isDefault) ??
      clientRootFolders[0] ??
      null;

    try {
      await bindClientFolder({
        variables: {
          input: {
            companyId: selectedClientId,
            companyName: client?.name,
            autoCreate,
            rootFolderId: autoCreate
              ? undefined
              : defaultFolder?.id || undefined,
            rootFolderName: autoCreate
              ? undefined
              : defaultFolder?.name || undefined,
            rootFolders:
              autoCreate || clientRootFolders.length === 0
                ? undefined
                : clientRootFolders.map((f) => ({
                    id: f.id,
                    name: f.name,
                    label: f.label.trim() ? f.label.trim() : null,
                    isDefault: f.id === defaultFolder?.id,
                  })),
            monthStartDay: clampedDay,
            monthFolderPatternOverride: clientPatternOverride.trim()
              ? clientPatternOverride.trim()
              : null,
          },
        },
      });
      await refetch();
      const folderCountText = autoCreate
        ? 'Google Drive folder'
        : `${clientRootFolders.length} main Google Drive folder${clientRootFolders.length === 1 ? '' : 's'}`;
      setFeedback({
        text: `Saved ${folderCountText} for ${client?.name ?? 'client'} (month starts on day ${clampedDay}).`,
      });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not bind client Drive folder.',
        isError: true,
      });
    }
  };

  const handleRunCleanup = async (dryRun: boolean) => {
    setFeedback(null);
    try {
      const res = await runCleanup({ variables: { dryRun } });
      if (res.data?.runDeliveryVpsCleanup) {
        setCleanupSummary(res.data.runDeliveryVpsCleanup);
      }
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : 'Could not run VPS cleanup.',
        isError: true,
      });
    }
  };

  return (
    <StyledPanel>
      <StyledHeader>
        <div>
          <StyledTitle>
            Google Drive Auto-Sync & 24-Hour VPS Storage Cleanup
          </StyledTitle>
          <StyledSubtext>
            Automatically organize client deliverables into dynamic month
            folders (`1.mp4`, `2.mp4`, `3/v1.mp4..v3.mp4`) and reclaim VPS disk
            space after confirmed Drive sync.
          </StyledSubtext>
        </div>
        <StyledRow>
          {config?.connected ? (
            <StyledBadge $tone="ok">
              Connected: {config.googleEmail}
            </StyledBadge>
          ) : (
            <StyledBadge $tone="muted">Not Connected</StyledBadge>
          )}
          {config?.connected ? (
            <StyledButton
              $variant="danger"
              disabled={disconnecting}
              onClick={handleDisconnect}
              type="button"
            >
              Disconnect
            </StyledButton>
          ) : (
            <StyledButton
              $variant="primary"
              disabled={oauthLoading || loading || !config?.oauthConfigured}
              onClick={handleConnect}
              type="button"
            >
              {oauthLoading ? 'Redirecting...' : 'Connect Google Drive'}
            </StyledButton>
          )}
          {onClose && (
            <StyledButton onClick={onClose} type="button">
              Close
            </StyledButton>
          )}
        </StyledRow>
      </StyledHeader>

      {configError && (
        <StyledMessage $error>
          Could not load Google Drive configuration: {configError.message}
        </StyledMessage>
      )}

      {!loading && !configError && config && !config.oauthConfigured && (
        <StyledMessage $error>
          Google OAuth credentials (`AUTH_GOOGLE_CLIENT_ID` and
          `AUTH_GOOGLE_CLIENT_SECRET`) are not configured on the server yet.
        </StyledMessage>
      )}

      {feedback && (
        <StyledMessage $error={feedback.isError}>{feedback.text}</StyledMessage>
      )}

      {config?.connected && (
        <>
          <StyledGrid>
            <StyledCard>
              <StyledTitle>Dynamic Month Folder Format</StyledTitle>
              <StyledLabel>
                Month folder tokens (`&#123;Month&#125;`, `&#123;Mon&#125;`,
                `&#123;MM&#125;`, `&#123;M&#125;`, `&#123;YYYY&#125;`,
                `&#123;YY&#125;`)
                <StyledInput
                  onChange={(e) => setMonthPattern(e.target.value)}
                  placeholder="{Month} {YYYY}"
                  value={monthPattern}
                />
              </StyledLabel>
              <StyledRow>
                {(config.monthFolderPresets ?? []).map((preset) => (
                  <StyledChip
                    $active={monthPattern === preset.pattern}
                    key={preset.pattern}
                    onClick={() => setMonthPattern(preset.pattern)}
                    type="button"
                  >
                    {preset.example}
                  </StyledChip>
                ))}
              </StyledRow>
              <StyledPreviewBox>
                Client Root / {liveMonthPreview} /
                {folderMode === 'SERVICE_SPLIT' ? ' AI Videos /' : ''}
                <br />
                &nbsp;&nbsp;├── 1.mp4
                <br />
                &nbsp;&nbsp;├── 2.mp4
                <br />
                &nbsp;&nbsp;└── 3 / v1.mp4, v2.mp4, v3.mp4
                {includeOriginal ? ', original.mp4' : ''}
              </StyledPreviewBox>

              <StyledLabel>
                Folder Structure Mode
                <StyledSelect
                  onChange={(e) =>
                    setFolderMode(e.target.value as DriveFolderMode)
                  }
                  value={folderMode}
                >
                  <option value="FLAT">
                    Flat Month (Month / 1.mp4, 3 / v1.mp4)
                  </option>
                  <option value="SERVICE_SPLIT">
                    Service-Split (Month / AI Videos / 1.mp4)
                  </option>
                </StyledSelect>
              </StyledLabel>

              <StyledCheckboxRow>
                <input
                  checked={includeOriginal}
                  onChange={(e) => setIncludeOriginal(e.target.checked)}
                  type="checkbox"
                />
                Keep original master video (`original.mp4`) inside variation
                folders
              </StyledCheckboxRow>
            </StyledCard>

            <StyledCard>
              <StyledTitle>Workspace Root Folder & 24h VPS Cleanup</StyledTitle>
              <DeliveryDriveFolderPicker
                selectedFolderId={rootFolderId}
                selectedFolderName={rootFolderName}
                placeholder="Search workspace root folder in Drive…"
                onSelect={(folder) => {
                  setRootFolderId(folder.id);
                  setRootFolderName(folder.name);
                }}
                onClear={() => {
                  setRootFolderId('');
                  setRootFolderName('');
                }}
              />
              <StyledRow>
                <StyledInput
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Or create new root folder (e.g. Otogrow Clients)"
                  value={newFolderName}
                />
                <StyledButton
                  disabled={creatingFolder || !newFolderName.trim()}
                  onClick={handleCreateRootFolder}
                  type="button"
                >
                  Create Folder
                </StyledButton>
              </StyledRow>

              <StyledCheckboxRow>
                <input
                  checked={autoPurgeEnabled}
                  onChange={(e) => setAutoPurgeEnabled(e.target.checked)}
                  type="checkbox"
                />
                Automatically delete local VPS videos after confirmed Drive sync
              </StyledCheckboxRow>
              <StyledLabel>
                Keep video on VPS for (hours after Drive sync)
                <StyledInput
                  max={720}
                  min={1}
                  onChange={(e) => setAutoPurgeHoursInput(e.target.value)}
                  step={1}
                  type="number"
                  value={autoPurgeHoursInput}
                />
              </StyledLabel>
              <StyledRow>
                <StyledButton
                  $variant="primary"
                  disabled={saving}
                  onClick={handleSaveSettings}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </StyledButton>
                <StyledButton
                  disabled={cleaning}
                  onClick={() => handleRunCleanup(true)}
                  type="button"
                >
                  Preview Cleanup
                </StyledButton>
                <StyledButton
                  disabled={cleaning}
                  onClick={() => handleRunCleanup(false)}
                  type="button"
                >
                  {cleaning ? 'Cleaning...' : 'Clean VPS Now'}
                </StyledButton>
              </StyledRow>

              {cleanupSummary && (
                <StyledMessage>
                  {!cleanupSummary.enabled ? (
                    'VPS auto-purge is currently disabled. Enable it above and save settings to clean local videos after Drive sync.'
                  ) : (
                    <>
                      {cleanupSummary.dryRun
                        ? 'Dry-run preview: '
                        : 'Completed: '}
                      {cleanupSummary.purgedDeliverables} deliverable video(s) +{' '}
                      {cleanupSummary.purgedVariations} variation(s) eligible (
                      {formatBytesHuman(cleanupSummary.reclaimedBytes)}
                      {cleanupSummary.dryRun ? ' reclaimable' : ' freed'}).
                      {cleanupSummary.skippedActiveRenders > 0
                        ? ` Skipped ${cleanupSummary.skippedActiveRenders} active render(s).`
                        : ''}
                      {cleanupSummary.skippedUnsynced > 0
                        ? ` Skipped ${cleanupSummary.skippedUnsynced} unverified/unsynced item(s).`
                        : ''}
                    </>
                  )}
                </StyledMessage>
              )}
            </StyledCard>
          </StyledGrid>

          <StyledCard>
            <StyledTitle>
              Client Main Folder Bindings &amp; Month Cycle
            </StyledTitle>
            <StyledSubtext>
              Link one or more main Google Drive folders per client (e.g. Reels,
              Paid Ads, UGC). The default folder is used automatically, and team
              members can switch between any linked main folder inside AI
              Studio.
            </StyledSubtext>
            <StyledRow>
              <StyledSelect
                onChange={(e) => loadClientDraft(e.target.value)}
                value={selectedClientId}
              >
                <option value="">Select client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </StyledSelect>
              <StyledLabel
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                Month starts day
                <StyledInput
                  max={31}
                  min={1}
                  onChange={(e) => setClientMonthStartDay(e.target.value)}
                  style={{ width: 68 }}
                  type="number"
                  value={clientMonthStartDay}
                />
              </StyledLabel>
              <StyledInput
                onChange={(e) => setClientPatternOverride(e.target.value)}
                placeholder="Optional month format override"
                value={clientPatternOverride}
              />
            </StyledRow>

            {selectedClientId && clientRootFolders.length > 0 && (
              <StyledRootFolderList>
                {clientRootFolders.map((folder) => (
                  <StyledRootFolderItem
                    key={folder.id}
                    $isDefault={folder.isDefault}
                  >
                    <StyledRootFolderMeta>
                      <div
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        <strong>
                          {folder.isDefault ? '★' : '📁'}{' '}
                          {folder.name || folder.id}
                        </strong>
                        <StyledLink
                          href={
                            folder.webViewLink ||
                            `https://drive.google.com/drive/folders/${folder.id}`
                          }
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open ↗
                        </StyledLink>
                      </div>
                      <StyledRow>
                        {folder.isDefault ? (
                          <StyledBadge $tone="ok">Default</StyledBadge>
                        ) : (
                          <StyledButton
                            type="button"
                            onClick={() =>
                              handleSetClientDefaultFolder(folder.id)
                            }
                          >
                            Set Default
                          </StyledButton>
                        )}
                        <StyledButton
                          $variant="danger"
                          type="button"
                          onClick={() =>
                            handleRemoveClientRootFolder(folder.id)
                          }
                        >
                          Remove
                        </StyledButton>
                      </StyledRow>
                    </StyledRootFolderMeta>
                    <StyledRootLabelInput
                      type="text"
                      maxLength={80}
                      placeholder="Optional label (e.g. Reels, Paid Ads, UGC, Raw Footage)"
                      value={folder.label}
                      onChange={(e) =>
                        handleUpdateClientFolderLabel(folder.id, e.target.value)
                      }
                    />
                  </StyledRootFolderItem>
                ))}
              </StyledRootFolderList>
            )}

            {selectedClientId && (
              <DeliveryDriveFolderPicker
                selectedFolderIds={clientRootFolders.map((f) => f.id)}
                selectLabel="+ Add"
                selectedLabel="✓ Added"
                placeholder={
                  clientRootFolders.length > 0
                    ? 'Search Google Drive to add another main folder for this client…'
                    : 'Search & add one or more main Drive folders for this client…'
                }
                onSelect={handleAddClientRootFolder}
              />
            )}

            <StyledRow>
              <StyledButton
                $variant="primary"
                disabled={
                  bindingClient ||
                  !selectedClientId ||
                  clientRootFolders.length === 0
                }
                onClick={() => handleBindClient(false)}
                type="button"
              >
                {bindingClient
                  ? 'Saving…'
                  : clientRootFolders.length > 1
                    ? `Save ${clientRootFolders.length} Folders & Cycle`
                    : 'Save Client Folder & Cycle'}
              </StyledButton>
              <StyledButton
                disabled={bindingClient || !selectedClientId}
                onClick={() => handleBindClient(true)}
                type="button"
              >
                Auto-Create Folder under Root
              </StyledButton>
            </StyledRow>

            {(config.clientMappings ?? []).length > 0 && (
              <StyledClientList>
                {config.clientMappings.map((mapping) => {
                  const roots =
                    mapping.rootFolders && mapping.rootFolders.length > 0
                      ? mapping.rootFolders
                      : [
                          {
                            id: mapping.rootFolderId,
                            name: mapping.rootFolderName,
                            webViewLink: mapping.rootFolderWebUrl,
                            label: null,
                            isDefault: true,
                          },
                        ];
                  return (
                    <StyledClientRow key={mapping.companyId}>
                      <div>
                        <strong>
                          {mapping.companyName || mapping.companyId.slice(0, 8)}
                        </strong>
                        <StyledSubtext>
                          {roots.length}{' '}
                          {roots.length === 1 ? 'main folder' : 'main folders'}{' '}
                          · Starts day{' '}
                          <strong>{mapping.monthStartDay ?? 1}</strong>
                          {mapping.activeCycleLabel
                            ? ` (${mapping.activeCycleLabel})`
                            : ''}{' '}
                          · Target: <code>{mapping.monthFolderPreview}</code>
                        </StyledSubtext>
                        <StyledFolderTags>
                          {roots.map((rf) => (
                            <StyledFolderTagLink
                              key={rf.id}
                              $isDefault={rf.isDefault}
                              href={
                                rf.webViewLink ||
                                `https://drive.google.com/drive/folders/${rf.id}`
                              }
                              rel="noreferrer"
                              target="_blank"
                            >
                              {rf.isDefault ? '★ ' : '📁 '}
                              {rf.label ? `${rf.label}: ${rf.name}` : rf.name} ↗
                            </StyledFolderTagLink>
                          ))}
                        </StyledFolderTags>
                      </div>
                      <StyledButton
                        type="button"
                        onClick={() => loadClientDraft(mapping.companyId)}
                      >
                        Edit Folders
                      </StyledButton>
                    </StyledClientRow>
                  );
                })}
              </StyledClientList>
            )}
          </StyledCard>
        </>
      )}
    </StyledPanel>
  );
};
