import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { useClientHub } from '@/delivery/client-workspace/useClientHub';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { DeliveryDriveSettingsPanel } from '@/delivery/deliverables/DeliveryDriveSettingsPanel';
import { DeliverySocialMetricsPanel } from '@/delivery/deliverables/DeliverySocialMetricsPanel';
import {
  CREATE_DELIVERY_LINK_DELIVERABLE,
  GET_DELIVERY_DELIVERABLE,
  GET_DELIVERY_DELIVERABLES,
  REVIEW_DELIVERY_DELIVERABLE,
  SYNC_DELIVERY_DELIVERABLE_TO_DRIVE,
  UPDATE_DELIVERY_DELIVERABLE,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import {
  currentMonthKeyInput,
  DELIVERABLE_SERVICE_OPTIONS,
  formatBytesHuman,
  formatDurationHuman,
  type DeliverableItem,
} from '@/delivery/deliverables/delivery-deliverables.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const StyledFilterBar = styled.div`
  align-items: flex-end;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledFilterGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};

  input,
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.sm};
    min-width: 150px;
    padding: ${themeCssVariables.spacing[2]};
  }
`;

const StyledDropzone = styled.div<{ isDragging: boolean }>`
  align-items: center;
  background: ${({ isDragging }) =>
    isDragging
      ? themeCssVariables.background.tertiary
      : themeCssVariables.background.primary};
  border: 2px dashed
    ${({ isDragging }) =>
      isDragging
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
  transition: border-color 120ms ease;
`;

const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
  width: 100%;
`;

const StyledProgressFill = styled.div`
  background: ${themeCssVariables.color.blue};
  height: 100%;
  transition: width 120ms linear;
`;

const StyledDeliverablesGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
`;

const StyledDeliverableTile = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledMediaStage = styled.div`
  align-items: center;
  aspect-ratio: 16 / 9;
  background: ${themeCssVariables.background.invertedPrimary};
  cursor: pointer;
  display: flex;
  justify-content: center;
  overflow: hidden;
  position: relative;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledSequencePill = styled.span`
  background: ${themeCssVariables.background.invertedPrimary};
  border: 1px solid ${themeCssVariables.border.color.strong};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.inverted};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  left: ${themeCssVariables.spacing[2]};
  padding: 2px 10px;
  position: absolute;
  top: ${themeCssVariables.spacing[2]};
`;

const StyledDurationPill = styled.span`
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: 999px;
  bottom: ${themeCssVariables.spacing[2]};
  color: ${themeCssVariables.font.color.inverted};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 2px 8px;
  position: absolute;
  right: ${themeCssVariables.spacing[2]};
`;

const StyledTileBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};

  h4 {
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.md};
    margin: 0;
  }
`;

const StyledMetaText = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledInvertedMetaText = styled.p`
  color: ${themeCssVariables.font.color.inverted};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledTagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledModalBackdrop = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.overlayPrimary};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: 1000;
`;

const StyledModalCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-height: 92vh;
  max-width: 960px;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[5]};
  width: 100%;
`;

const StyledVideoPlayer = styled.video`
  background: ${themeCssVariables.background.invertedPrimary};
  border-radius: ${themeCssVariables.border.radius.sm};
  max-height: 55vh;
  width: 100%;
`;

const toSafeHttpUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const StyledReviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledReviewItem = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

type UploadProgressItem = {
  fileName: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
};

export const DeliveryDeliverablesPage = () => (
  <DeliveryOperationalPage view="deliverables">
    <DeliverablesHubBody />
  </DeliveryOperationalPage>
);

const DeliverablesHubBody = () => {
  const { t } = useLingui();
  const store = useStore();
  const permission = useWorkflowAccess();
  const [params, setParams] = useSearchParams();
  const hub = useClientHub(true);

  const selectedCompanyId = params.get('companyId') ?? '';
  const selectedMonth = params.get('month') ?? currentMonthKeyInput();
  const selectedService = params.get('service') ?? '';
  const selectedStatus = params.get('status') ?? '';
  const driveQueryParam = params.get('drive') ?? '';

  const [driveOAuthStatus, setDriveOAuthStatus] = useState(driveQueryParam);
  const [showDriveSettings, setShowDriveSettings] = useState(
    Boolean(driveQueryParam),
  );
  const [showSocialMetrics, setShowSocialMetrics] = useState(false);

  useEffect(() => {
    if (!driveQueryParam) return;
    setDriveOAuthStatus(driveQueryParam);
    setShowDriveSettings(true);
    const next = new URLSearchParams(params);
    next.delete('drive');
    setParams(next, { replace: true });
  }, [driveQueryParam, params, setParams]);
  const [uploadPanelMode, setUploadPanelMode] = useState<
    'closed' | 'file' | 'link'
  >('closed');
  const [uploadCompanyId, setUploadCompanyId] = useState(selectedCompanyId);
  const [uploadServiceKey, setUploadServiceKey] = useState('ai-videos');
  const [uploadMonthKey, setUploadMonthKey] = useState(selectedMonth);
  const [uploadSequence, setUploadSequence] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExternalUrl, setUploadExternalUrl] = useState('');
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadProgressItem[]>([]);
  const [actionError, setActionError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  // oxlint-disable-next-line twenty/no-state-useref -- Hidden native file input element trigger.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filterVariables = {
    ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
    ...(selectedMonth ? { monthKey: selectedMonth } : {}),
    ...(selectedService ? { serviceKey: selectedService } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
  };

  const listQuery = useQuery<{
    deliveryDeliverables: {
      deliverables: DeliverableItem[];
      clients: { id: string; name: string }[];
      summary: {
        total: number;
        videos: number;
        variations: number;
        published: number;
        pendingReview: number;
        syncedToDrive: number;
        vpsPurged: number;
      };
    };
  }>(GET_DELIVERY_DELIVERABLES, {
    variables: { filter: filterVariables },
    fetchPolicy: 'network-only',
  });

  const detailQuery = useQuery<{ deliveryDeliverable: DeliverableItem }>(
    GET_DELIVERY_DELIVERABLE,
    {
      variables: { id: inspectId ?? '' },
      skip: !inspectId,
      fetchPolicy: 'network-only',
    },
  );

  const [createLink, { loading: creatingLink }] = useMutation(
    CREATE_DELIVERY_LINK_DELIVERABLE,
  );
  const [updateDeliverable, { loading: updating }] = useMutation(
    UPDATE_DELIVERY_DELIVERABLE,
  );
  const [reviewDeliverable, { loading: reviewing }] = useMutation(
    REVIEW_DELIVERY_DELIVERABLE,
  );
  const [syncToDrive, { loading: syncingDrive }] = useMutation(
    SYNC_DELIVERY_DELIVERABLE_TO_DRIVE,
  );

  const listPayload = listQuery.data?.deliveryDeliverables;
  const deliverables = listPayload?.deliverables ?? [];
  const inspected = detailQuery.data?.deliveryDeliverable ?? null;

  const clientMap = new Map<string, string>();
  for (const client of hub.data?.clients ?? []) {
    clientMap.set(client.id, client.name);
  }
  for (const client of listPayload?.clients ?? []) {
    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, client.name);
    }
  }
  const clients = Array.from(clientMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeUploadCompanyId =
    uploadCompanyId || selectedCompanyId || clients[0]?.id || '';

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set('view', 'deliverables');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const uploadSingleFile = (file: File, index: number): Promise<void> =>
    new Promise((resolve) => {
      if (!activeUploadCompanyId) {
        setUploads((prev) =>
          prev.map((item, i) =>
            i === index
              ? { ...item, status: 'error', error: t`Select a client first.` }
              : item,
          ),
        );
        resolve();
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', activeUploadCompanyId);
      formData.append('serviceKey', uploadServiceKey);
      formData.append('monthKey', uploadMonthKey || currentMonthKeyInput());
      if (uploadSequence.trim() && index === 0) {
        formData.append('sequenceNumber', uploadSequence.trim());
      }
      if (uploadTitle.trim() && index === 0) {
        formData.append('title', uploadTitle.trim());
      }
      if (uploadDescription.trim()) {
        formData.append('description', uploadDescription.trim());
      }
      if (publishImmediately && permission.manager) {
        formData.append('publishImmediately', 'true');
      }

      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-deliverables/upload`,
      );

      const cookieAuth = store.get(isCookieAuthActiveState.atom);
      if (cookieAuth) {
        xhr.withCredentials = true;
      } else {
        const token = store.get(tokenPairState.atom)
          ?.accessOrWorkspaceAgnosticToken?.token;
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(
          100,
          Math.round((event.loaded / event.total) * 100),
        );
        setUploads((prev) =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  loadedBytes: event.loaded,
                  totalBytes: event.total,
                  percent,
                }
              : item,
          ),
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploads((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, percent: 100, status: 'done' } : item,
            ),
          );
        } else {
          let message = t`Upload failed (${xhr.status})`;
          try {
            const parsed = JSON.parse(xhr.responseText) as {
              message?: string | string[];
            };
            if (Array.isArray(parsed.message)) {
              message = parsed.message[0] ?? message;
            } else if (typeof parsed.message === 'string') {
              message = parsed.message;
            }
          } catch {
            // Keep HTTP status fallback.
          }
          setUploads((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, status: 'error', error: message } : item,
            ),
          );
        }
        resolve();
      };

      xhr.onerror = () => {
        setUploads((prev) =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  status: 'error',
                  error: t`Network error while uploading file.`,
                }
              : item,
          ),
        );
        resolve();
      };

      xhr.send(formData);
    });

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!activeUploadCompanyId) {
      setActionError(t`Choose a client before uploading deliverables.`);
      return;
    }
    setActionError('');
    setActionStatus('');
    const files = Array.from(fileList);
    setUploads(
      files.map((file) => ({
        fileName: file.name,
        loadedBytes: 0,
        totalBytes: file.size,
        percent: 0,
        status: 'uploading',
      })),
    );

    // Upload sequentially so monthly sequence numbers (#1, #2, #3...) stay in exact selection order.
    for (let i = 0; i < files.length; i += 1) {
      await uploadSingleFile(files[i], i);
    }
    setUploadSequence('');
    setUploadTitle('');
    await listQuery.refetch();
    setActionStatus(
      t`Finished processing ${files.length} deliverable upload(s).`,
    );
  };

  const handleSubmitLink = async () => {
    if (!activeUploadCompanyId) {
      setActionError(t`Choose a client first.`);
      return;
    }
    setActionError('');
    setActionStatus('');
    try {
      await createLink({
        variables: {
          input: {
            companyId: activeUploadCompanyId,
            serviceKey: uploadServiceKey,
            monthKey: uploadMonthKey || currentMonthKeyInput(),
            ...(uploadSequence.trim()
              ? { sequenceNumber: Number(uploadSequence.trim()) }
              : {}),
            title: uploadTitle.trim(),
            description: uploadDescription.trim(),
            externalUrl: uploadExternalUrl.trim(),
            publishImmediately: publishImmediately && permission.manager,
          },
        },
      });
      setUploadTitle('');
      setUploadDescription('');
      setUploadExternalUrl('');
      setUploadSequence('');
      setUploadPanelMode('closed');
      await listQuery.refetch();
      setActionStatus(t`Link deliverable submitted.`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t`Could not submit link deliverable.`,
      );
    }
  };

  const handleQuickPublishToggle = async (item: DeliverableItem) => {
    setActionError('');
    try {
      const nextPublish = item.clientVisibility !== 'PUBLISHED';
      await updateDeliverable({
        variables: {
          input: {
            id: item.id,
            ...(nextPublish
              ? { status: 'APPROVED', clientVisibility: 'PUBLISHED' }
              : { clientVisibility: 'INTERNAL' }),
          },
        },
      });
      await listQuery.refetch();
      if (inspectId === item.id) {
        await detailQuery.refetch();
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t`Could not update deliverable.`,
      );
    }
  };

  const handleStaffReview = async (
    deliverableId: string,
    decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENT',
  ) => {
    setActionError('');
    try {
      await reviewDeliverable({
        variables: {
          input: {
            deliverableId,
            decision,
            comment: reviewComment.trim(),
          },
        },
      });
      setReviewComment('');
      await detailQuery.refetch();
      await listQuery.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t`Could not save review.`,
      );
    }
  };

  const handleSyncToDrive = async (deliverableId: string) => {
    setActionError('');
    setActionStatus('');
    try {
      await syncToDrive({ variables: { deliverableId } });
      setActionStatus(t`Queued Google Drive sync.`);
      await listQuery.refetch();
      if (inspectId === deliverableId) {
        await detailQuery.refetch();
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t`Could not queue Google Drive sync.`,
      );
    }
  };

  const companyNameById = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <StyledDeliveryStack>
      <StyledFilterBar>
        <StyledFilterGroup>
          <StyledField>
            <span>
              <Trans>Client</Trans>
            </span>
            <select
              value={selectedCompanyId}
              onChange={(event) => {
                updateFilter('companyId', event.target.value);
                setUploadCompanyId(event.target.value);
              }}
            >
              <option value="">{t`All clients`}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </StyledField>

          <StyledField>
            <span>
              <Trans>Delivery month</Trans>
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                updateFilter('month', event.target.value);
                setUploadMonthKey(event.target.value);
              }}
            />
          </StyledField>

          <StyledField>
            <span>
              <Trans>Service</Trans>
            </span>
            <select
              value={selectedService}
              onChange={(event) => updateFilter('service', event.target.value)}
            >
              <option value="">{t`All services`}</option>
              {DELIVERABLE_SERVICE_OPTIONS.map((service) => (
                <option key={service.key} value={service.key}>
                  {service.label}
                </option>
              ))}
            </select>
          </StyledField>

          <StyledField>
            <span>
              <Trans>Status</Trans>
            </span>
            <select
              value={selectedStatus}
              onChange={(event) => updateFilter('status', event.target.value)}
            >
              <option value="">{t`All statuses`}</option>
              <option value="PENDING_REVIEW">{t`Pending review`}</option>
              <option value="APPROVED">{t`Approved`}</option>
              <option value="CHANGES_REQUESTED">{t`Changes requested`}</option>
            </select>
          </StyledField>
        </StyledFilterGroup>

        <StyledDeliveryRow>
          <Link
            to={`/delivery?view=studio${selectedCompanyId ? `&companyId=${selectedCompanyId}` : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid currentColor',
              textDecoration: 'none',
            }}
          >
            <Trans>✦ AI Studio</Trans>
          </Link>
          <StyledDeliveryButton
            type="button"
            onClick={() =>
              setUploadPanelMode((mode) => (mode === 'file' ? 'closed' : 'file'))
            }
          >
            <Trans>+ Upload files</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            onClick={() =>
              setUploadPanelMode((mode) => (mode === 'link' ? 'closed' : 'link'))
            }
          >
            <Trans>+ Submit link</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            onClick={() => setShowSocialMetrics((open) => !open)}
          >
            <Trans>Social Metrics</Trans>
          </StyledDeliveryButton>
          {permission.manager && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setShowDriveSettings((open) => !open)}
            >
              <Trans>Google Drive & VPS Sync</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
      </StyledFilterBar>

      {driveOAuthStatus === 'connected' && (
        <StyledMetaText role="status">
          <Trans>
            Google Drive connected! Configure your dynamic month folder format
            and client folder bindings below.
          </Trans>
        </StyledMetaText>
      )}
      {driveOAuthStatus.startsWith('error:') && (
        <p role="alert">
          <Trans>Google Drive connection error:</Trans>{' '}
          {driveOAuthStatus.slice('error:'.length)}
        </p>
      )}

      {showDriveSettings && permission.manager && (
        <DeliveryDriveSettingsPanel
          clients={clients}
          onClose={() => setShowDriveSettings(false)}
        />
      )}

      {showSocialMetrics && (
        <DeliverySocialMetricsPanel
          clients={clients}
          defaultCompanyId={selectedCompanyId}
          defaultMonthKey={selectedMonth}
          isManager={permission.manager}
          onClose={() => setShowSocialMetrics(false)}
        />
      )}

      {uploadPanelMode !== 'closed' && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h3>
                {uploadPanelMode === 'file' ? (
                  <Trans>Upload client deliverables (Videos, Images, PDFs)</Trans>
                ) : (
                  <Trans>Submit link deliverable (Staging URL, Figma, Docs)</Trans>
                )}
              </h3>
              <StyledDeliveryButton
                type="button"
                onClick={() => setUploadPanelMode('closed')}
              >
                <Trans>Close</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>

            <StyledFilterGroup>
              <StyledField>
                <span>
                  <Trans>Client</Trans>
                </span>
                <select
                  value={activeUploadCompanyId}
                  onChange={(event) => setUploadCompanyId(event.target.value)}
                >
                  <option value="">{t`Choose a client`}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </StyledField>

              <StyledField>
                <span>
                  <Trans>Service</Trans>
                </span>
                <select
                  value={uploadServiceKey}
                  onChange={(event) => setUploadServiceKey(event.target.value)}
                >
                  {DELIVERABLE_SERVICE_OPTIONS.map((service) => (
                    <option key={service.key} value={service.key}>
                      {service.label}
                    </option>
                  ))}
                </select>
              </StyledField>

              <StyledField>
                <span>
                  <Trans>Month</Trans>
                </span>
                <input
                  type="month"
                  value={uploadMonthKey}
                  onChange={(event) => setUploadMonthKey(event.target.value)}
                />
              </StyledField>

              <StyledField>
                <span>
                  <Trans>Number # (auto if blank)</Trans>
                </span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  placeholder="Auto (1, 2, 3…)"
                  value={uploadSequence}
                  onChange={(event) => setUploadSequence(event.target.value)}
                />
              </StyledField>

              <StyledField>
                <span>
                  <Trans>Title (optional)</Trans>
                </span>
                <input
                  type="text"
                  placeholder={t`e.g. UGC Reel #3 - Founder Story`}
                  value={uploadTitle}
                  onChange={(event) => setUploadTitle(event.target.value)}
                />
              </StyledField>
            </StyledFilterGroup>

            {uploadPanelMode === 'link' && (
              <StyledField>
                <span>
                  <Trans>External URL (https://…)</Trans>
                </span>
                <input
                  type="url"
                  placeholder="https://staging.example.com"
                  value={uploadExternalUrl}
                  onChange={(event) => setUploadExternalUrl(event.target.value)}
                />
              </StyledField>
            )}

            <StyledField>
              <span>
                <Trans>Notes for PM or client (optional)</Trans>
              </span>
              <textarea
                rows={2}
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
              />
            </StyledField>

            {permission.manager && (
              <label>
                <input
                  type="checkbox"
                  checked={publishImmediately}
                  onChange={(event) =>
                    setPublishImmediately(event.target.checked)
                  }
                />{' '}
                <Trans>Approve and publish to client dashboard immediately</Trans>
              </label>
            )}

            {uploadPanelMode === 'file' ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    void handleFilesSelected(event.target.files);
                    event.target.value = '';
                  }}
                />
                <StyledDropzone
                  isDragging={isDragging}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    void handleFilesSelected(event.dataTransfer.files);
                  }}
                >
                  <strong>
                    <Trans>
                      Drop videos, static ads, or PDFs here — or click to browse
                    </Trans>
                  </strong>
                  <StyledMetaText>
                    <Trans>
                      Supports MP4, MOV, WebM, PNG, JPG, WebP, PDF up to 2 GB
                      per file. Automatically numbered 1, 2, 3… for the selected
                      month.
                    </Trans>
                  </StyledMetaText>
                </StyledDropzone>

                {uploads.length > 0 && (
                  <StyledDeliveryStack>
                    {uploads.map((item, idx) => (
                      <div key={`${item.fileName}-${idx}`}>
                        <StyledDeliveryRow>
                          <span>{item.fileName}</span>
                          <StyledMetaText>
                            {item.status === 'error'
                              ? item.error
                              : item.status === 'done'
                                ? t`Uploaded`
                                : `${item.percent}% (${formatBytesHuman(item.loadedBytes)} / ${formatBytesHuman(item.totalBytes)})`}
                          </StyledMetaText>
                        </StyledDeliveryRow>
                        <StyledProgressTrack>
                          <StyledProgressFill
                            style={{ width: `${item.percent}%` }}
                          />
                        </StyledProgressTrack>
                      </div>
                    ))}
                  </StyledDeliveryStack>
                )}
              </>
            ) : (
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="button"
                  disabled={
                    creatingLink ||
                    !uploadTitle.trim() ||
                    !uploadExternalUrl.trim()
                  }
                  onClick={() => void handleSubmitLink()}
                >
                  <Trans>Submit link deliverable</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}

      {actionStatus && <StyledMetaText role="status">{actionStatus}</StyledMetaText>}
      {actionError && <p role="alert">{actionError}</p>}

      {listQuery.loading && deliverables.length === 0 ? (
        <StyledDeliveryCard>
          <StyledMetaText>
            <Trans>Loading deliverables…</Trans>
          </StyledMetaText>
        </StyledDeliveryCard>
      ) : deliverables.length === 0 ? (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>
              <Trans>No deliverables for this filter yet</Trans>
            </h3>
            <StyledMetaText>
              <Trans>
                Upload videos, static ads, PDFs, or links above. Every item gets
                an automatic monthly sequence number (#1, #2, #3…) ready for
                client dashboard publishing, Text-Hook variations, and Google
                Drive sync.
              </Trans>
            </StyledMetaText>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      ) : (
        <StyledDeliverablesGrid>
          {deliverables.map((item) => {
            const clientName =
              companyNameById.get(item.companyId) ?? t`Client`;
            const durationLabel = formatDurationHuman(
              item.mediaMeta?.durationSec,
            );
            const resolutionLabel =
              item.mediaMeta?.width && item.mediaMeta?.height
                ? `${item.mediaMeta.width}×${item.mediaMeta.height}`
                : '';
            const thumbnailSrc = item.thumbnailPath
              ? `${REACT_APP_SERVER_BASE_URL}${item.thumbnailPath}`
              : null;
            const streamSrc = item.streamPath
              ? `${REACT_APP_SERVER_BASE_URL}${item.streamPath}`
              : null;

            return (
              <StyledDeliverableTile key={item.id}>
                <StyledMediaStage onClick={() => setInspectId(item.id)}>
                  <StyledSequencePill>
                    #{item.sequenceNumber} · {item.monthKey}
                  </StyledSequencePill>
                  {thumbnailSrc ? (
                    <img src={thumbnailSrc} alt={item.title} loading="lazy" />
                  ) : item.assetKind === 'IMAGE' && streamSrc ? (
                    <img src={streamSrc} alt={item.title} loading="lazy" />
                  ) : (
                    <StyledInvertedMetaText>
                      {item.assetKind === 'LINK'
                        ? t`External Link`
                        : item.assetKind === 'DOCUMENT'
                          ? t`PDF Document`
                          : t`Preview media`}
                    </StyledInvertedMetaText>
                  )}
                  {durationLabel && (
                    <StyledDurationPill>{durationLabel}</StyledDurationPill>
                  )}
                </StyledMediaStage>

                <StyledTileBody>
                  <h4>{item.title}</h4>
                  <StyledMetaText>
                    {clientName} · {item.serviceKey}
                    {resolutionLabel ? ` · ${resolutionLabel}` : ''}
                    {item.sizeBytes > 0
                      ? ` · ${formatBytesHuman(item.sizeBytes)}`
                      : ''}
                  </StyledMetaText>

                  <StyledTagRow>
                    <StyledDeliveryBadge>{item.status}</StyledDeliveryBadge>
                    <StyledDeliveryBadge>
                      {item.clientVisibility === 'PUBLISHED'
                        ? t`Published`
                        : t`Internal`}
                    </StyledDeliveryBadge>
                    {item.clientVisibility === 'PUBLISHED' && (
                      <StyledDeliveryBadge>
                        {t`Client`}: {item.clientApprovalStatus}
                      </StyledDeliveryBadge>
                    )}
                    {item.variations.length > 0 && (
                      <StyledDeliveryBadge>
                        {t`${item.variations.length} hook variations`}
                      </StyledDeliveryBadge>
                    )}
                    {item.driveSyncStatus !== 'NOT_SYNCED' && (
                      <StyledDeliveryBadge>
                        {t`Drive`}: {item.driveSyncStatus}
                      </StyledDeliveryBadge>
                    )}
                    {item.storageState === 'DRIVE_ONLY' && (
                      <StyledDeliveryBadge>
                        <Trans>VPS Purged (Drive Only)</Trans>
                      </StyledDeliveryBadge>
                    )}
                  </StyledTagRow>

                  {item.driveSyncStatus === 'FAILED' && item.driveSyncError && (
                    <StyledMetaText role="alert">
                      {t`Drive sync error`}: {item.driveSyncError}
                    </StyledMetaText>
                  )}

                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setInspectId(item.id)}
                    >
                      <Trans>Inspect</Trans>
                    </StyledDeliveryButton>

                    {item.assetKind === 'VIDEO' && (
                      <Link
                        to={`/delivery?view=creative&creativeView=hooks&deliverableId=${item.id}`}
                      >
                        <Trans>Text Hooks</Trans>
                      </Link>
                    )}

                    {item.assetKind !== 'LINK' &&
                      (item.driveSyncStatus === 'NOT_SYNCED' ||
                        item.driveSyncStatus === 'FAILED') && (
                        <StyledDeliveryButton
                          type="button"
                          disabled={syncingDrive}
                          onClick={() => void handleSyncToDrive(item.id)}
                        >
                          {item.driveSyncStatus === 'FAILED'
                            ? t`Retry Drive`
                            : t`Sync Drive`}
                        </StyledDeliveryButton>
                      )}

                    {toSafeHttpUrl(item.driveWebUrl) && (
                      <a
                        href={toSafeHttpUrl(item.driveWebUrl) ?? undefined}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Trans>Drive ↗</Trans>
                      </a>
                    )}

                    {permission.manager && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={updating}
                        onClick={() => void handleQuickPublishToggle(item)}
                      >
                        {item.clientVisibility === 'PUBLISHED'
                          ? t`Unpublish`
                          : t`Approve & Publish`}
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </StyledTileBody>
              </StyledDeliverableTile>
            );
          })}
        </StyledDeliverablesGrid>
      )}

      {inspectId && inspected && inspected.id === inspectId && (
        <StyledModalBackdrop onClick={() => setInspectId(null)}>
          <StyledModalCard onClick={(event) => event.stopPropagation()}>
            <StyledDeliveryRow>
              <div>
                <h3>
                  #{inspected.sequenceNumber} · {inspected.title}
                </h3>
                <StyledMetaText>
                  {inspected.monthKey} · {inspected.serviceKey} ·{' '}
                  {inspected.originalFileName ?? inspected.externalUrl ?? ''}
                </StyledMetaText>
              </div>
              <StyledDeliveryButton
                type="button"
                onClick={() => setInspectId(null)}
              >
                <Trans>Close</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>

            {inspected.assetKind === 'VIDEO' && inspected.streamPath && (
              <StyledVideoPlayer
                controls
                preload="metadata"
                poster={
                  inspected.thumbnailPath
                    ? `${REACT_APP_SERVER_BASE_URL}${inspected.thumbnailPath}`
                    : undefined
                }
                src={`${REACT_APP_SERVER_BASE_URL}${inspected.streamPath}`}
              />
            )}

            {inspected.assetKind === 'IMAGE' && inspected.streamPath && (
              <img
                src={`${REACT_APP_SERVER_BASE_URL}${inspected.streamPath}`}
                alt={inspected.title}
                style={{ maxHeight: '55vh', objectFit: 'contain', width: '100%' }}
              />
            )}

            {inspected.assetKind === 'DOCUMENT' &&
              inspected.mimeType === 'application/pdf' &&
              inspected.streamPath && (
                <iframe
                  title={inspected.title}
                  src={`${REACT_APP_SERVER_BASE_URL}${inspected.streamPath}`}
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    height: '55vh',
                    width: '100%',
                  }}
                />
              )}

            {toSafeHttpUrl(inspected.externalUrl) && (
              <a
                href={toSafeHttpUrl(inspected.externalUrl) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inspected.externalUrl}
              </a>
            )}

            {inspected.description && <p>{inspected.description}</p>}

            <StyledDeliveryRow>
              {inspected.streamPath && (
                <a
                  href={`${REACT_APP_SERVER_BASE_URL}${inspected.streamPath}&download=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Trans>Download original</Trans>
                </a>
              )}
              {toSafeHttpUrl(inspected.driveWebUrl) && (
                <a
                  href={toSafeHttpUrl(inspected.driveWebUrl) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Trans>Open in Google Drive</Trans>
                </a>
              )}
              {permission.manager && (
                <StyledDeliveryButton
                  type="button"
                  disabled={updating}
                  onClick={() => void handleQuickPublishToggle(inspected)}
                >
                  {inspected.clientVisibility === 'PUBLISHED'
                    ? t`Hide from client dashboard`
                    : t`Approve & publish to client dashboard`}
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>

            {inspected.variations.length > 0 && (
              <StyledDeliveryStack>
                <h4>
                  <Trans>Text-Hook Variations ({inspected.variations.length})</Trans>
                </h4>
                {inspected.variations.map((variation) => (
                  <StyledReviewItem key={variation.id}>
                    <StyledDeliveryRow>
                      <strong>
                        {variation.label}: {variation.hookText}
                      </strong>
                      <StyledDeliveryBadge>
                        {variation.renderStatus}
                      </StyledDeliveryBadge>
                    </StyledDeliveryRow>
                  </StyledReviewItem>
                ))}
              </StyledDeliveryStack>
            )}

            <StyledDeliveryStack>
              <h4>
                <Trans>Reviews &amp; Notes</Trans>
              </h4>
              <StyledField>
                <textarea
                  rows={2}
                  placeholder={t`Add internal QA note or revision instructions…`}
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                />
              </StyledField>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="button"
                  disabled={reviewing}
                  onClick={() => void handleStaffReview(inspected.id, 'COMMENT')}
                >
                  <Trans>Add note</Trans>
                </StyledDeliveryButton>
                {permission.manager && (
                  <>
                    <StyledDeliveryButton
                      type="button"
                      disabled={reviewing}
                      onClick={() =>
                        void handleStaffReview(inspected.id, 'APPROVED')
                      }
                    >
                      <Trans>Approve</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      disabled={reviewing}
                      onClick={() =>
                        void handleStaffReview(inspected.id, 'CHANGES_REQUESTED')
                      }
                    >
                      <Trans>Request changes</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
              </StyledDeliveryRow>

              <StyledReviewList>
                {(inspected.reviews ?? []).map((review) => (
                  <StyledReviewItem key={review.id}>
                    <StyledDeliveryRow>
                      <strong>
                        {review.authorName} ({review.authorType})
                      </strong>
                      <StyledDeliveryBadge>{review.decision}</StyledDeliveryBadge>
                    </StyledDeliveryRow>
                    {review.comment && <p>{review.comment}</p>}
                  </StyledReviewItem>
                ))}
              </StyledReviewList>
            </StyledDeliveryStack>
          </StyledModalCard>
        </StyledModalBackdrop>
      )}
    </StyledDeliveryStack>
  );
};
