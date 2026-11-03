import { ReleaseStage } from '@/delivery/development/ReleaseStage';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import { type useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import { useReleaseRead } from '@/delivery/development/useReleaseRead';
import { useReleaseCommands } from '@/delivery/development/useReleaseCommands';
import {
  type ReleaseCommand,
  type ReleaseIntent,
  type ReleaseReceipt,
  type ReleaseBody,
  type ReleaseTask,
} from '@/delivery/development/release.types';
import {
  GET_RELEASE_DETAIL,
  PREVIEW_RELEASE,
} from '@/delivery/development/delivery-release.graphql';
import {
  releaseDestination,
  RELEASE_CLOSE_COMMAND,
  RELEASE_CLOSE_RECORD,
} from '@/delivery/development/release-navigation';
import { canonicalReleaseBody } from '@/delivery/development/release-body';
import { useReleaseLabels } from '@/delivery/development/useReleaseLabels';
import { ReleasePlanForm } from '@/delivery/development/ReleasePlanForm';
import { ReleasePlanSummary } from '@/delivery/development/ReleasePlanSummary';
import { StyledReleaseBoundary } from '@/delivery/development/releaseStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryReleaseDetailQuery,
  type PreviewDeliveryReleaseQuery,
} from '~/generated-metadata/graphql';

type ReleaseCommandPanelProps = {
  access: ReturnType<typeof useReleaseAccess>;
  project: { id: string; revision: number; companyId: string | null };
  releaseId: string;
  requestId: string;
  mode: string;
  intent: ReleaseIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  contextScope: string;
  onDenied: () => void;
  onSaved: () => Promise<unknown>;
  onReplaceIntent: (intent: ReleaseIntent) => void;
};
export const ReleaseCommandPanel = ({
  access,
  project,
  releaseId,
  requestId,
  mode,
  intent,
  consumeIntent,
  enabled,
  contextScope,
  onDenied,
  onSaved,
  onReplaceIntent,
}: ReleaseCommandPanelProps) => {
  const { t } = useLingui();
  const labels = useReleaseLabels();
  const client = useApolloClient();
  const [params] = useSearchParams();
  const location = useLocation();
  const focus = useAssistantPanelFocus();
  const planning = mode === 'new' || mode === 'edit';
  const [opened] = useState(() =>
    intent?.requestId === requestId &&
    intent.releaseId === releaseId &&
    intent.projectId === project.id &&
    intent.mode === mode
      ? intent
      : null,
  );
  const [body, setBody] = useState<ReleaseBody | null>(opened?.body ?? null);
  const [tasks, setTasks] = useState<ReleaseTask[]>(opened?.tasks ?? []);
  const [note, setNote] = useState(opened?.decision?.note ?? ''),
    [evidenceUrl, setEvidenceUrl] = useState(
      opened?.decision?.evidenceUrl ?? '',
    ),
    [environment, setEnvironment] = useState(
      opened?.decision?.environment ?? '',
    );
  const [confirmed, setConfirmed] = useState(false),
    [rebaseConfirmed, setRebaseConfirmed] = useState(false),
    [preparing, setPreparing] = useState(false),
    [formScope, setFormScope] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<ReleaseCommand | null>(null),
    [receipt, setReceipt] = useState<ReleaseReceipt | null>(null),
    [preview, setPreview] = useState<
      PreviewDeliveryReleaseQuery['previewDeliveryRelease'] | null
    >(null);
  const [sent, setSent] = useState(false),
    [absent, setAbsent] = useState(false),
    [retry, setRetry] = useState(false),
    [message, setMessage] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- An owned transfer must authorize only its exact destination while the body is retained by the next panel.
  const transfer = useRef<{
    from: string;
    to: string;
    owner: string;
    body: string;
  } | null>(null);
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const detailQuery = useQuery<DeliveryReleaseDetailQuery>(GET_RELEASE_DETAIL, {
    variables: { input: { id: releaseId } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled || mode === 'new',
  });
  const read = useReleaseRead({
    value: detailQuery.data?.deliveryReleaseDetail,
    access,
    scope: `command:${releaseId}`,
    query: detailQuery,
    matches: (value) =>
      value.release.id === releaseId && value.project.id === project.id,
    onDenied,
  });
  const current = mode === 'new' ? null : read.data;
  const anchorMatches =
    !opened || project.companyId === opened.expectedCompanyId;
  const sourceAvailable =
    enabled && anchorMatches && (mode === 'new' || current !== null);
  const formReady = formScope === contextScope;
  useLayoutEffect(() => {
    if (!anchorMatches) onDenied();
  }, [anchorMatches, onDenied]);
  const changed = Boolean(
    opened &&
    (project.revision !== opened.projectRevision ||
      project.companyId !== opened.expectedCompanyId ||
      (current && current.release.revision !== opened.revision) ||
      (!planning &&
        current &&
        current.currentSourceFingerprint !== opened.sourceFingerprint)),
  );
  const canExecute =
    mode === 'new'
      ? true
      : mode === 'edit'
        ? current?.canEdit
        : mode === 'SUBMIT'
          ? current?.canSubmit
          : mode === 'APPROVE'
            ? current?.canReview &&
              !current.sourceChanged &&
              !current.reviewBlockedReason
            : mode === 'REQUEST_CHANGES'
              ? current?.canReview
              : mode === 'RECORD_DEPLOYMENT' ||
                  mode === 'RECORD_DEPLOYMENT_FAILED'
                ? current?.canRecordDeployment
                : mode === 'RECORD_HANDOVER'
                  ? current?.canRecordHandover
                  : current?.canRecordAcceptance;
  const commands = useReleaseCommands({
    access,
    scope: `${project.id}:${project.revision}:${project.companyId}:${releaseId}:${contextScope}`,
    enabled: sourceAvailable,
    onDenied,
  });
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${project.id}:${project.revision}:${project.companyId}:${contextScope}:${releaseId}:${requestId}`,
    sourceAvailable,
  );
  const retainTasks = useCallback(
    (next: ReleaseTask[]) =>
      setTasks((previous) => (fastDeepEqual(previous, next) ? previous : next)),
    [],
  );
  const payload = JSON.stringify({ body, note, evidenceUrl, environment });
  const retention = useCallback(
    (
      from: { pathname: string; search: string },
      to: { pathname: string; search: string },
    ) => {
      const owned = transfer.current;
      return Boolean(
        owned &&
        owned.owner === `${access.source}:${contextScope}` &&
        owned.body === payload &&
        owned.from === `${from.pathname}${from.search}` &&
        owned.to === `${to.pathname}${to.search}`,
      );
    },
    [access.source, contextScope, payload],
  );
  useDeliveryDraftStatus({
    dirty:
      receipt === null &&
      Boolean(
        sent ||
        frozen ||
        confirmed ||
        rebaseConfirmed ||
        (opened && body && !fastDeepEqual(body, opened.body)) ||
        note !== (opened?.decision?.note ?? '') ||
        evidenceUrl !== (opened?.decision?.evidenceUrl ?? '') ||
        environment !== (opened?.decision?.environment ?? ''),
      ),
    saving: commands.busy || preparing,
    retainsNavigation: retention,
  });
  const accept = async (value: ReleaseReceipt) => {
    setReceipt(value);
    setRetry(false);
    setAbsent(false);
    setMessage('');
    try {
      await onSaved();
    } catch {
      setMessage(
        t`The saved result is confirmed. The release list could not reload yet.`,
      );
    }
  };
  const execute = async (command: ReleaseCommand) => {
    if (
      !sourceAvailable ||
      changed ||
      !canExecute ||
      commands.busy ||
      preparing ||
      !confirmed
    )
      return;
    setSent(true);
    setAbsent(false);
    setRetry(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') await accept(result.receipt);
    else
      setMessage(
        result.kind === 'UNKNOWN'
          ? t`The saved result could not be confirmed. Keep this exact action and check its result before trying again.`
          : result.message,
      );
  };
  const check = async () => {
    setRetry(false);
    setAbsent(false);
    const result = await commands.check(
      requestId,
      releaseId,
      planning ? 'SAVE' : mode,
      frozen,
    );
    if (result.kind === 'FOUND') await accept(result.receipt);
    else if (result.kind === 'NOT_FOUND') {
      setAbsent(true);
      setRetry(Boolean(frozen && !changed && canExecute));
      setMessage(
        t`No saved action was found under your current access. You can retry the same prepared action or explicitly prepare a new request.`,
      );
    } else
      setMessage(
        t`The saved action could not be checked. Keep this view open and check again.`,
      );
  };
  const prepare = async () => {
    if (
      !opened ||
      !sourceAvailable ||
      changed ||
      !canExecute ||
      preparing ||
      commands.busy
    )
      return;
    setPreparing(true);
    setMessage('');
    const valid = begin();
    try {
      if (planning && body && formReady) {
        const input = {
          id: releaseId,
          requestId,
          revision: opened.revision,
          projectId: project.id,
          projectRevision: opened.projectRevision,
          expectedCompanyId: opened.expectedCompanyId,
          body: canonicalReleaseBody(body),
        };
        const hash = await hashCanonicalCommandInput(input);
        const result = (
          await client.query<PreviewDeliveryReleaseQuery>({
            query: PREVIEW_RELEASE,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.previewDeliveryRelease;
        if (!valid()) return;
        if (
          !result ||
          !access.matches(result) ||
          result.scope !== contextScope ||
          result.requestId !== requestId ||
          result.releaseId !== releaseId ||
          result.inputHash !== hash ||
          !fastDeepEqual(canonicalReleaseBody(result.body), input.body)
        ) {
          setMessage(
            t`The current plan preview could not be confirmed. Your draft is retained. Refresh access and try again.`,
          );
          return;
        }
        setPreview(result);
        setFrozen({ kind: 'SAVE', input, hash });
      } else if (!planning) {
        const input = {
          id: releaseId,
          requestId,
          revision: opened.revision,
          action: mode,
          sourceFingerprint: opened.sourceFingerprint,
          note: note.trim(),
          evidenceUrl: evidenceUrl.trim(),
          environment: environment.trim(),
          commitSha: mode.startsWith('RECORD_') ? opened.body.commitSha : '',
        };
        const hash = await hashCanonicalCommandInput(input);
        if (valid()) setFrozen({ kind: 'DECIDE', input, hash });
      }
    } catch (error) {
      if (valid() && isOtogrowAccessDenied(error)) onDenied();
      else if (valid())
        setMessage(
          error instanceof Error
            ? error.message
            : t`The current plan could not be checked. Your draft is retained.`,
        );
    } finally {
      setPreparing(false);
    }
  };
  const replace = () => {
    if (
      !opened ||
      !body ||
      !sourceAvailable ||
      !canExecute ||
      (planning && !formReady) ||
      commands.busy ||
      preparing ||
      (sent && !absent) ||
      !rebaseConfirmed ||
      project.companyId !== opened.expectedCompanyId
    )
      return;
    const next: ReleaseIntent = {
      ...opened,
      releaseId: mode === 'new' ? crypto.randomUUID() : releaseId,
      requestId: crypto.randomUUID(),
      projectRevision: project.revision,
      expectedCompanyId: project.companyId,
      revision:
        mode === 'new' ? 0 : (current?.release.revision ?? opened.revision),
      sourceFingerprint:
        current?.currentSourceFingerprint ?? opened.sourceFingerprint,
      body: !planning && current ? canonicalReleaseBody(current.body) : body,
      tasks: !planning && current ? current.body.tasks : tasks,
      decision: { note, evidenceUrl, environment },
    };
    const destination = releaseDestination(params, {
      releaseId: next.releaseId,
      releaseRequest: next.requestId,
      releaseMode: next.mode,
      releaseVersion: null,
      releaseHistoryAfter: null,
    });
    transfer.current = {
      from: `${location.pathname}${location.search}`,
      to: destination,
      owner: `${access.source}:${contextScope}`,
      body: payload,
    };
    onReplaceIntent(next);
  };
  const close = releaseDestination(
    params,
    mode === 'new' && !receipt ? RELEASE_CLOSE_RECORD : RELEASE_CLOSE_COMMAND,
  );
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`Release preparation`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>{planning ? t`Prepare release plan` : labels.action(mode)}</h3>
          <Link to={close}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        {!sourceAvailable && (
          <div role="alert">
            <p>
              {detailQuery.error ? (
                <Trans>
                  Current release access could not be verified. Private
                  preparation is hidden and retained while you reconnect.
                </Trans>
              ) : (
                <Trans>Checking the current release…</Trans>
              )}
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || mode === 'new'}
              onClick={() => void detailQuery.refetch()}
            >
              <Trans>Check current release</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {message && <p role="alert">{message}</p>}
        {changed && (
          <p role="alert">
            <Trans>
              The project, release or task evidence changed. Check the saved
              result before preparing a new action from the current source.
            </Trans>
          </p>
        )}
        {!opened && !receipt && (
          <p>
            <Trans>
              This link can recover a saved release action. Unsaved preparation
              is not restored after reloading or leaving.
            </Trans>
          </p>
        )}
        {!receipt && (sent || !opened) && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!sourceAvailable || commands.busy || preparing}
              onClick={() => void check()}
            >
              <Trans>Check saved release action</Trans>
            </StyledDeliveryButton>
            {retry && frozen && (
              <StyledDeliveryButton
                type="button"
                disabled={
                  !sourceAvailable || changed || commands.busy || !confirmed
                }
                onClick={() => void execute(frozen)}
              >
                <Trans>Retry exact release action</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        <StyledReleaseBoundary
          hidden={!sourceAvailable}
          disabled={!sourceAvailable || commands.busy || preparing}
          inert={!sourceAvailable || undefined}
        >
          {receipt ? (
            <ReleaseStage label={t`Saved release action`} status>
              <p>
                {labels.recorded(receipt.action)} ·{' '}
                {t`Manifest version ${receipt.version}`}
              </p>
              <Link
                to={releaseDestination(params, {
                  ...RELEASE_CLOSE_COMMAND,
                  releaseVersion: String(receipt.version),
                })}
              >
                <Trans>Open saved manifest</Trans>
              </Link>
            </ReleaseStage>
          ) : opened && body ? (
            <StyledDeliveryStack>
              {planning && (
                <div hidden={frozen !== null || changed}>
                  <ReleasePlanForm
                    key={contextScope}
                    access={access}
                    projectId={project.id}
                    body={body}
                    update={setBody}
                    tasks={tasks}
                    onTasks={retainTasks}
                    onDenied={onDenied}
                    enabled={sourceAvailable}
                    locked={
                      frozen !== null || changed || preparing || commands.busy
                    }
                    onSubmit={() => void prepare()}
                    onReady={setFormScope}
                  />
                </div>
              )}
              {!planning && !frozen && !changed && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void prepare();
                  }}
                >
                  <StyledDeliveryStack>
                    <p>
                      <Trans>
                        This records your reviewed decision and evidence. It
                        does not deploy code, send a client message or fulfil
                        tasks automatically.
                      </Trans>
                    </p>
                    <label>
                      <Trans>Decision notes</Trans>
                      <textarea
                        aria-label={t`Decision notes`}
                        maxLength={6000}
                        required={
                          mode === 'REQUEST_CHANGES' ||
                          mode.startsWith('RECORD_')
                        }
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.currentTarget.value)}
                      />
                    </label>
                    {mode.startsWith('RECORD_') && (
                      <>
                        <p>{t`Approved commit: ${opened.body.commitSha}`}</p>
                        <label>
                          <Trans>Outcome evidence link</Trans>
                          <input
                            aria-label={t`Outcome evidence link`}
                            type="url"
                            pattern="https://.*"
                            maxLength={2000}
                            required
                            value={evidenceUrl}
                            onChange={(event) =>
                              setEvidenceUrl(event.currentTarget.value)
                            }
                          />
                        </label>
                      </>
                    )}
                    {mode.startsWith('RECORD_DEPLOYMENT') && (
                      <label>
                        <Trans>Deployment environment</Trans>
                        <input
                          aria-label={t`Deployment environment`}
                          maxLength={200}
                          required
                          value={environment}
                          onChange={(event) =>
                            setEnvironment(event.currentTarget.value)
                          }
                        />
                      </label>
                    )}
                    <StyledDeliveryButton type="submit" disabled={!canExecute}>
                      <Trans>Review this action</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                </form>
              )}
              {frozen && (!planning || formReady) && (
                <ReleaseStage label={t`Review prepared action`}>
                  <h4>
                    <Trans>Review prepared action</Trans>
                  </h4>
                  {planning && preview ? (
                    <>
                      <ReleasePlanSummary
                        body={frozen.kind === 'SAVE' ? frozen.input.body : body}
                        tasks={preview.body.tasks}
                        ownerName={preview.ownerName}
                      />
                      {preview.reviewBlockedReason && (
                        <p>
                          <Trans>
                            The plan can be saved. Before submitting for
                            approval:
                          </Trans>{' '}
                          {preview.reviewBlockedReason}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>{labels.action(mode)}</p>
                      <p>{note}</p>
                      {evidenceUrl && <p>{evidenceUrl}</p>}
                      {environment && <p>{environment}</p>}
                    </>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={sent}
                      onChange={(event) =>
                        setConfirmed(event.currentTarget.checked)
                      }
                    />
                    <Trans>
                      I checked this exact plan or decision and its evidence.
                    </Trans>
                  </label>
                  <StyledDeliveryRow>
                    {!sent && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={
                          !confirmed || changed || !canExecute || commands.busy
                        }
                        onClick={() => void execute(frozen)}
                      >
                        {planning ? labels.action('SAVE') : labels.action(mode)}
                      </StyledDeliveryButton>
                    )}
                    {!sent && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => {
                          setFrozen(null);
                          setPreview(null);
                          setConfirmed(false);
                        }}
                      >
                        <Trans>Return to editing</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </ReleaseStage>
              )}
              {(changed || absent) &&
                project.companyId === opened.expectedCompanyId &&
                (!sent || absent) && (
                  <StyledDeliveryStack>
                    {current && (
                      <details>
                        <summary>
                          <Trans>Compare the current saved plan</Trans>
                        </summary>
                        <ReleasePlanSummary
                          body={current.body}
                          tasks={current.body.tasks}
                          ownerName={current.release.ownerName}
                        />
                      </details>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={rebaseConfirmed}
                        onChange={(event) =>
                          setRebaseConfirmed(event.currentTarget.checked)
                        }
                      />
                      <Trans>
                        I reviewed the current source and want to keep my
                        entered plan and notes in a new request.
                      </Trans>
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      disabled={
                        !rebaseConfirmed ||
                        commands.busy ||
                        preparing ||
                        (mode !== 'new' && !current)
                      }
                      onClick={replace}
                    >
                      <Trans>Prepare new request with my draft</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                )}
            </StyledDeliveryStack>
          ) : null}
        </StyledReleaseBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
