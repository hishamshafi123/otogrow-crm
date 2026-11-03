import { useCallback, useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type CreativeProductionTask } from '@/delivery/creative/production/creative-production.types';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { type useVideoQaAccess } from '@/delivery/creative/video-qa/useVideoQaAccess';
import { useVideoQaCommands } from '@/delivery/creative/video-qa/useVideoQaCommands';
import {
  VIDEO_QA_MODEL,
  type VideoQaIntent,
  type VideoQaPreparedRequest,
  type VideoQaCommand,
  type VideoQaReceipt,
} from '@/delivery/creative/video-qa/video-qa.types';
import {
  retainsVideoQaReader,
  videoQaDestination,
} from '@/delivery/creative/video-qa/video-qa-navigation';
import { isCreativeAssetCurrent } from '@/delivery/creative/creative-asset-current';
import { VideoQaCoverage } from '@/delivery/creative/video-qa/VideoQaCoverage';
import { StyledVideoQaBoundary } from '@/delivery/creative/video-qa/videoQaStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
export const VideoQaPreparation = ({
  access,
  task,
  requestId,
  intent,
  consumeIntent,
  enabled,
  onDenied,
  onSaved,
}: {
  access: ReturnType<typeof useVideoQaAccess>;
  task: CreativeProductionTask;
  requestId: string;
  intent: VideoQaIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (receipt: VideoQaReceipt) => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const [owned] = useState(
    () =>
      intent?.kind === 'START' &&
      intent.requestId === requestId &&
      intent.taskId === task.id,
  );
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const [assetId, setAssetId] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [manualTranscript, setManualTranscript] = useState('');
  const [prepared, setPrepared] = useState<VideoQaPreparedRequest | null>(null);
  const [frozen, setFrozen] = useState<VideoQaCommand | null>(null);
  const [receipt, setReceipt] = useState<VideoQaReceipt | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  const commands = useVideoQaCommands({
    access,
    taskId: task.id,
    enabled,
    onDenied,
  });
  const retention = useCallback(retainsVideoQaReader, []);
  useDeliveryDraftStatus({
    dirty:
      receipt === null &&
      (frozen !== null ||
        assetId !== '' ||
        references.length > 0 ||
        manualTranscript !== '' ||
        confirmed),
    saving: commands.busy,
    retainsNavigation: retention,
  });
  const document = task.details.creative;
  const briefApproved =
    document?.approvedBriefVersion != null &&
    document.approvedBriefVersion === document.briefVersion;
  const videos = document
    ? document.assets.filter(
        (asset) =>
          isCreativeAssetCurrent(document, asset) &&
          asset.mimeType.startsWith('video/') &&
          asset.size > 0 &&
          asset.size <= 100 * 1024 * 1024,
      )
    : [];
  const images = document
    ? document.assets.filter(
        (asset) =>
          isCreativeAssetCurrent(document, asset) &&
          asset.mimeType.startsWith('image/') &&
          asset.size <= 6000000 &&
          asset.reviews.at(-1)?.decision === 'APPROVED',
      )
    : [];
  const stale = Boolean(
    prepared &&
    (prepared.preview.taskRevision !== task.revision ||
      prepared.preview.creativeVersion !== document?.version ||
      prepared.preview.asset.id !== assetId),
  );
  const modelAllowed =
    document?.mediaSettings?.enabled === true &&
    document.mediaSettings.modelIds.includes(VIDEO_QA_MODEL) &&
    document.mediaSettings.roles.includes(
      access.administrator
        ? 'ADMIN'
        : access.permission.manager
          ? 'MANAGER'
          : 'MEMBER',
    );
  const canStart =
    enabled &&
    owned &&
    prepared !== null &&
    prepared.preview.budgetReady &&
    prepared.preview.maximumCostUsd != null &&
    prepared.preview.pricingRevision != null &&
    !stale &&
    frozen === null &&
    receipt === null &&
    modelAllowed &&
    briefApproved &&
    task.details.state !== 'APPROVED';
  const accept = (value: VideoQaReceipt) => {
    setReceipt(value);
    setFrozen(null);
    setRetryAllowed(false);
    setMessage(
      t`The inspection request was saved. Open its recorded status and findings below.`,
    );
    onSaved(value);
  };
  const execute = async (command: VideoQaCommand) => {
    setFrozen(command);
    setRetryAllowed(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') accept(result.receipt);
    else if (result.kind === 'REJECTED') {
      setFrozen(null);
      setPrepared(null);
      setConfirmed(false);
      setMessage(result.message);
    } else
      setMessage(
        t`The start result is unconfirmed. Your exact submitted request is kept. Check its saved status before trying again.`,
      );
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(requestId, 'START');
    if (result.kind === 'FOUND') accept(result.receipt);
    else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null);
      setMessage(
        frozen
          ? t`No saved request was found. Only the exact submitted request can be retried while its source remains current.`
          : t`No saved request was found. Unsaved preparation is no longer available. Close this view to prepare a new inspection.`,
      );
    } else
      setMessage(
        t`The saved inspection could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Video inspection preparation`}
      data-video-qa-request={requestId}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h4>
            <Trans>Prepare video inspection</Trans>
          </h4>
          <Link to={videoQaDestination(params, { creativeQaRequest: null })}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        {(commands.error || message) && (
          <p role={commands.error ? 'alert' : 'status'}>
            {message || commands.error}
          </p>
        )}
        {!owned && !receipt && (
          <p>
            <Trans>
              This earlier link can check a saved inspection. It cannot restore
              or send unsaved preparation.
            </Trans>
          </p>
        )}
        {(!owned || frozen) && !receipt && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={() => void check()}
            >
              <Trans>Check saved video inspection</Trans>
            </StyledDeliveryButton>
            {retryAllowed && frozen !== null && !stale && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || commands.busy || !modelAllowed}
                onClick={() => void execute(frozen)}
              >
                <Trans>Retry exact inspection request</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        {receipt && (
          <>
            <p>
              <Trans>
                Inspection recorded. Human approval remains separate.
              </Trans>
            </p>
            <Link
              to={videoQaDestination(params, {
                creativeQaRun: receipt.runId,
                creativeQaCancel: null,
              })}
            >
              <Trans>Open recorded inspection</Trans>
            </Link>
          </>
        )}
        <StyledVideoQaBoundary
          hidden={!enabled || !owned || receipt !== null}
          disabled={!enabled || commands.busy || frozen !== null}
          inert={!enabled || undefined}
        >
          {owned && receipt === null && (
            <StyledDeliveryStack>
              {!modelAllowed && (
                <p role="status">
                  <Trans>
                    An administrator needs to enable Google Gemini 3.5 Flash
                    Lite for your video inspections.
                  </Trans>{' '}
                  {access.administrator && (
                    <Link to="/delivery?view=agents&agentView=media">
                      <Trans>Open media model settings</Trans>
                    </Link>
                  )}
                </p>
              )}
              {!briefApproved && (
                <p role="status">
                  <Trans>
                    The current brief must be approved before video inspection.
                    Review its product facts and required claims first.
                  </Trans>
                </p>
              )}
              {task.details.state === 'APPROVED' && (
                <p>
                  <Trans>
                    This task is already approved. Start a revision before
                    requesting a new inspection; recorded findings remain
                    available.
                  </Trans>
                </p>
              )}
              <label>
                <Trans>Video to inspect</Trans>
                <select
                  value={assetId}
                  aria-label={t`Video to inspect`}
                  onChange={(event) => {
                    setAssetId(event.currentTarget.value);
                    setPrepared(null);
                    setConfirmed(false);
                  }}
                >
                  <option value="">{t`Choose a ready video`}</option>
                  {videos.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              {!videos.length && (
                <p>
                  <Trans>
                    No ready video is available. Upload or assemble a complete
                    supported video first (up to 120 seconds and 100 MB).
                  </Trans>
                </p>
              )}
              <fieldset>
                <legend>
                  <Trans>Approved product reference images — up to three</Trans>
                </legend>
                {images.map((asset) => (
                  <label key={asset.id}>
                    <input
                      type="checkbox"
                      checked={references.includes(asset.id)}
                      disabled={
                        references.length >= 3 && !references.includes(asset.id)
                      }
                      onChange={(event) => {
                        setReferences(
                          event.currentTarget.checked
                            ? [...references, asset.id]
                            : references.filter((id) => id !== asset.id),
                        );
                        setPrepared(null);
                        setConfirmed(false);
                      }}
                    />
                    {asset.name}
                  </label>
                ))}
              </fieldset>
              <label>
                <Trans>
                  Supplemental manual transcript (optional, unverified)
                </Trans>
                <textarea
                  maxLength={12000}
                  value={manualTranscript}
                  aria-label={t`Supplemental manual transcript`}
                  onChange={(event) => {
                    setManualTranscript(event.currentTarget.value);
                    setPrepared(null);
                    setConfirmed(false);
                  }}
                />
              </label>
              <StyledDeliveryButton
                type="button"
                disabled={
                  !assetId ||
                  !modelAllowed ||
                  !briefApproved ||
                  task.details.state === 'APPROVED'
                }
                onClick={async () => {
                  const input = {
                    taskId: task.id,
                    revision: task.revision,
                    assetId,
                    referenceAssetIds: [...references],
                    modelId: VIDEO_QA_MODEL,
                    manualTranscript: manualTranscript.length
                      ? manualTranscript
                      : null,
                  };
                  setPrepared(null);
                  setConfirmed(false);
                  const preview = await commands.preview(input);
                  if (preview) setPrepared({ input, preview });
                }}
              >
                <Trans>Preview evidence and maximum reservation</Trans>
              </StyledDeliveryButton>
              {prepared && (
                <>
                  <VideoQaCoverage input={prepared.preview} />
                  {stale && (
                    <p role="alert">
                      <Trans>
                        Production changed. Preview the current evidence again
                        before starting.
                      </Trans>
                    </p>
                  )}
                  {prepared.preview.blockedReason && (
                    <p role="status">{prepared.preview.blockedReason}</p>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) =>
                        setConfirmed(event.currentTarget.checked)
                      }
                    />
                    <Trans>
                      I reviewed this evidence, coverage and maximum
                      reservation.
                    </Trans>
                  </label>
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    disabled={!canStart || !confirmed}
                    onClick={() => {
                      const pricingRevision = prepared.preview.pricingRevision;
                      if (!canStart || pricingRevision == null) return;
                      void execute({
                        kind: 'START',
                        input: {
                          ...prepared.input,
                          requestId,
                          sourceFingerprint: prepared.preview.sourceFingerprint,
                          preparationFingerprint:
                            prepared.preview.preparationFingerprint,
                          pricingRevision,
                          confirm: true,
                        },
                      });
                    }}
                  >
                    <Trans>Start video inspection</Trans>
                  </StyledDeliveryButton>
                </>
              )}
            </StyledDeliveryStack>
          )}
        </StyledVideoQaBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
