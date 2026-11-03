import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { knowledgeDestination } from '@/delivery/knowledge/knowledge-navigation';
import { useFathomImport } from '@/delivery/knowledge/fathom/useFathomImport';
import {
  type FathomContext,
  type FathomImportTarget,
  type FathomPreview,
} from '@/delivery/knowledge/fathom/fathom.types';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const StyledImport = styled.section`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  min-width: 0;
  padding: 12px;
  h3,
  p {
    margin: 0;
  }
  input {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
  }
`;
const StyledTranscript = styled.pre`
  font-family: inherit;
  font-size: inherit;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;
type DeliveryFathomImportProps = {
  context: FathomContext;
  projectId: string;
  sourceId: string;
  sourceIdentity: string;
  transcript: string;
  enabled: boolean;
  onAuthorityLost: () => void;
  onImport: (preview: FathomPreview, target: FathomImportTarget) => boolean;
};
export const DeliveryFathomImport = ({
  context,
  projectId,
  sourceId,
  sourceIdentity,
  transcript,
  enabled,
  onAuthorityLost,
  onImport,
}: DeliveryFathomImportProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const connection = useFathomImport({
    context,
    projectId,
    sourceId,
    sourceIdentity,
    transcript,
    enabled,
    onAuthorityLost,
  });
  const [apiKey, setApiKey] = useState('');
  const [fromDate, setFromDate] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [throughDate, setThroughDate] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [exactUrl, setExactUrl] = useState('');
  const [recordingId, setRecordingId] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [rejected, setRejected] = useState(false);
  const filters = JSON.stringify([fromDate, throughDate, exactUrl.trim()]);
  const settings = connection.settings;
  const ready =
    enabled &&
    connection.verified &&
    settings?.enabled === true &&
    settings.credentialConfigured &&
    !connection.busy &&
    !connection.settingsUnknown;
  useDeliveryDraftStatus({
    dirty: apiKey.length > 0 || connection.settingsUnknown,
    saving: connection.busy,
  });
  const saveConnection = async (
    nextEnabled: boolean,
    removeCredential = false,
  ) => {
    if (!settings) return;
    const key = apiKey.trim();
    await connection.saveSettings({
      revision: settings.revision,
      enabled: nextEnabled,
      apiKey: key || null,
      removeCredential,
    });
    // A lost reply is checked through revisioned settings; never retain a credential for an automatic retry.
    setApiKey('');
  };
  const search = async (after: string | null = null) => {
    if (!ready || !fromDate || !throughDate || fromDate >= throughDate) return;
    setImported(false);
    setRejected(false);
    if (
      await connection.find({
        projectId,
        sourceId,
        createdAfter: `${fromDate}T00:00:00Z`,
        createdBefore: `${throughDate}T00:00:00Z`,
        exactUrl: exactUrl.trim() || null,
        after,
      })
    )
      setSearched(filters);
  };
  const preview = connection.verified ? connection.preview : null;
  const expired =
    preview !== null && Date.parse(preview.value.expiresAt) <= Date.now();
  const changed =
    preview !== null &&
    (preview.target.sourceIdentity !== sourceIdentity ||
      preview.target.transcript !== transcript);
  const apply = () => {
    if (
      !ready ||
      !preview ||
      changed ||
      Date.parse(preview.value.expiresAt) <= Date.now() ||
      preview.value.existingSourceId
    )
      return;
    if (!onImport(preview.value, preview.target)) {
      setRejected(true);
      return;
    }
    connection.clearPreview();
    setImported(true);
  };
  return (
    <StyledImport aria-label={t`Fathom transcript import`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Import from Fathom</Trans>
        </h3>
        <p>
          <Trans>
            Administrators can fetch meetings shared with the connected Fathom
            account. Choose the right client project before importing. Other
            contributors can use a local file or paste notes.
          </Trans>
        </p>
        <details>
          <summary>
            <Trans>Fathom connection</Trans>
          </summary>
          <StyledDeliveryStack>
            <p>
              <Trans>
                The API key is stored encrypted and is never shown again.
                Enabling imports does not test the key or publish knowledge.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || connection.busy}
              onClick={() => void connection.refreshSettings()}
            >
              <Trans>Check connection settings</Trans>
            </StyledDeliveryButton>
            {settings && connection.verified && (
              <>
                <p>
                  {settings.enabled ? t`Imports enabled` : t`Imports disabled`}{' '}
                  ·{' '}
                  {settings.credentialConfigured
                    ? t`Credential stored`
                    : t`No credential stored`}{' '}
                  · {t`Revision ${settings.revision}`}
                </p>
                <label>
                  <Trans>New or replacement Fathom API key</Trans>
                  <input
                    type="password"
                    autoComplete="off"
                    maxLength={2000}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    disabled={
                      !enabled || connection.busy || connection.settingsUnknown
                    }
                  />
                </label>
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !enabled ||
                      connection.busy ||
                      connection.settingsUnknown ||
                      (!apiKey.trim() && !settings.credentialConfigured)
                    }
                    onClick={() => void saveConnection(true)}
                  >
                    <Trans>Save and enable imports</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !enabled ||
                      connection.busy ||
                      connection.settingsUnknown ||
                      !settings.enabled
                    }
                    onClick={() => void saveConnection(false)}
                  >
                    <Trans>Disable imports</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !enabled ||
                      connection.busy ||
                      connection.settingsUnknown ||
                      !settings.credentialConfigured ||
                      Boolean(apiKey.trim())
                    }
                    onClick={() => void saveConnection(false, true)}
                  >
                    <Trans>Remove credential</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </>
            )}
            {connection.settingsUnknown && (
              <p role="alert">
                <Trans>
                  The connection save is unconfirmed. Check settings before
                  making another change. A stored credential has not been
                  tested.
                </Trans>
              </p>
            )}
          </StyledDeliveryStack>
        </details>
        {settings === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || connection.busy}
            onClick={() => void connection.refreshSettings()}
          >
            <Trans>Load Fathom connection</Trans>
          </StyledDeliveryButton>
        )}
        {connection.error && <p role="alert">{connection.error}</p>}
        {!connection.verified && (
          <>
            <p>
              <Trans>
                Provider evidence is hidden until this connection is verified
                again. Your knowledge draft has been retained.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || connection.busy}
              onClick={() => void connection.refreshSettings()}
            >
              <Trans>Check Fathom again</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {settings?.enabled && connection.verified && (
          <>
            <p>
              <Trans>
                Search one page of up to 10 meetings at a time. Dates are the
                meeting creation window in UTC. A call or share-link ID is not
                an API recording ID.
              </Trans>
            </p>
            <StyledDeliveryRow>
              <label>
                <Trans>Created from (UTC)</Trans>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  disabled={!ready}
                />
              </label>
              <label>
                <Trans>Created before (UTC)</Trans>
                <input
                  type="date"
                  value={throughDate}
                  onChange={(event) => setThroughDate(event.target.value)}
                  disabled={!ready}
                />
              </label>
            </StyledDeliveryRow>
            <label>
              <Trans>Exact Fathom link (optional)</Trans>
              <input
                type="text"
                inputMode="url"
                maxLength={2000}
                value={exactUrl}
                onChange={(event) => setExactUrl(event.target.value)}
                placeholder="https://fathom.video/share/…"
                disabled={!ready}
              />
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={
                !ready || !fromDate || !throughDate || fromDate >= throughDate
              }
              onClick={() => void search()}
            >
              <Trans>Find meetings</Trans>
            </StyledDeliveryButton>
            {connection.meetings && searched === filters && (
              <>
                <p>{t`${connection.meetings.scannedCount} meetings checked on this page.`}</p>
                {connection.meetings.items.length === 0 && (
                  <p>
                    <Trans>
                      No matching meeting on this page. Continue to the next
                      page or adjust the date range. A share link must belong to
                      a meeting accessible to this account.
                    </Trans>
                  </p>
                )}
                {connection.meetings.items.map((meeting) => (
                  <StyledDeliveryRow key={meeting.recordingId}>
                    <span>
                      {meeting.title ?? t`Untitled meeting`} ·{' '}
                      {meeting.recordedAt ?? t`Date unknown`} ·{' '}
                      {t`Recording ${meeting.recordingId}`}
                    </span>
                    <StyledDeliveryButton
                      type="button"
                      disabled={!ready}
                      onClick={() => {
                        setImported(false);
                        setRejected(false);
                        void connection.fetchPreview({
                          projectId,
                          sourceId,
                          recordingId: meeting.recordingId,
                          meetingProof: meeting.proof,
                        });
                      }}
                    >
                      <Trans>Preview transcript</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                ))}
                {connection.meetings.nextCursor && (
                  <StyledDeliveryButton
                    type="button"
                    disabled={!ready}
                    onClick={() =>
                      void search(connection.meetings?.nextCursor ?? null)
                    }
                  >
                    <Trans>Next 10 meetings</Trans>
                  </StyledDeliveryButton>
                )}
              </>
            )}
            <details>
              <summary>
                <Trans>I have an API recording ID</Trans>
              </summary>
              <StyledDeliveryStack>
                <p>
                  <Trans>
                    Use the recording_id supplied by the Fathom API. We fetch
                    only its transcript; its title, date and link remain unknown
                    unless selected from the meeting list.
                  </Trans>
                </p>
                <label>
                  <Trans>API recording ID</Trans>
                  <input
                    inputMode="numeric"
                    maxLength={15}
                    value={recordingId}
                    onChange={(event) => setRecordingId(event.target.value)}
                    disabled={!ready}
                  />
                </label>
                <StyledDeliveryButton
                  type="button"
                  disabled={!ready || !/^[1-9][0-9]{0,14}$/.test(recordingId)}
                  onClick={() => {
                    setImported(false);
                    setRejected(false);
                    void connection.fetchPreview({
                      projectId,
                      sourceId,
                      recordingId,
                    });
                  }}
                >
                  <Trans>Fetch this transcript</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </details>
          </>
        )}
        {connection.busy && (
          <p role="status">
            <Trans>Checking Fathom…</Trans>
          </p>
        )}
        {preview && (
          <StyledDeliveryStack>
            <h3>{preview.value.meeting.title ?? t`Transcript preview`}</h3>
            <p>
              {t`Recording ${preview.value.meeting.recordingId}`} ·{' '}
              {preview.value.meeting.recordedAt ?? t`Date unknown`} ·{' '}
              {t`${preview.value.segmentCount} transcript segments`}
            </p>
            <StyledTranscript
              role="region"
              tabIndex={0}
              aria-label={t`Fathom transcript preview`}
            >
              {preview.value.transcript}
            </StyledTranscript>
            <p>
              <Trans>
                Using this transcript replaces only the draft notes and attaches
                verified source provenance. Your title, source date, link and
                reviewed knowledge stay as entered; compare them with the
                original metadata above. Save within 15 minutes, or fetch a
                fresh preview. Publication remains separate.
              </Trans>
            </p>
            {preview.value.existingSourceId && (
              <p>
                <Trans>This recording is already stored in this project.</Trans>{' '}
                <Link
                  to={knowledgeDestination(params, {
                    source: preview.value.existingSourceId,
                    knowledgeCreate: null,
                    knowledgeEdit: null,
                    knowledgeVersion: null,
                  })}
                >
                  <Trans>Open existing knowledge source</Trans>
                </Link>
              </p>
            )}
            {(changed || rejected) && (
              <p role="alert">
                <Trans>
                  Your draft notes changed after this preview was requested.
                  Fetch a new preview before replacing them.
                </Trans>
              </p>
            )}
            {expired && (
              <p role="alert">
                <Trans>
                  This preview expired. Fetch it again before importing.
                </Trans>
              </p>
            )}
            <StyledDeliveryRow>
              <StyledDeliveryButton
                type="button"
                disabled={
                  !ready ||
                  changed ||
                  rejected ||
                  expired ||
                  Boolean(preview.value.existingSourceId)
                }
                onClick={apply}
              >
                {transcript
                  ? t`Replace notes with this transcript`
                  : t`Use this transcript`}
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={connection.clearPreview}
              >
                <Trans>Cancel Fathom preview</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        )}
        {imported && (
          <p role="status">
            <Trans>
              Fathom transcript added to this draft. Review your title, date and
              notes, then save. Later edits are labelled in the saved
              provenance.
            </Trans>
          </p>
        )}
      </StyledDeliveryStack>
    </StyledImport>
  );
};
