import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  GET_KNOWLEDGE_STATE,
  GET_KNOWLEDGE_DETAIL,
  PUBLISH_KNOWLEDGE_SOURCE,
} from '@/delivery/knowledge/knowledge-read.graphql';
import { knowledgeDestination } from '@/delivery/knowledge/knowledge-navigation';
import { knowledgeDraftFromDetail } from '@/delivery/knowledge/knowledge-recovery';
import { KnowledgeEditor } from '@/delivery/knowledge/KnowledgeEditor';
import { type useKnowledgeContext } from '@/delivery/knowledge/useKnowledgeContext';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
import {
  StyledKnowledgeBoundary,
  StyledKnowledgeText,
} from '@/delivery/knowledge/knowledgeStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryKnowledgeStateQuery,
  type DeliveryKnowledgeDetailQuery,
  type PublishDeliveryKnowledgeSourceMutation,
} from '~/generated-metadata/graphql';

type KnowledgeDetail = NonNullable<
  DeliveryKnowledgeDetailQuery['deliveryKnowledgeDetail']['detail']
>;
const NO_CREATE_INTENT = () => undefined;
export const KnowledgeSource = ({
  state,
  projectId,
  sourceId,
  close,
  restoreFocus,
}: {
  state: ReturnType<typeof useKnowledgeContext>;
  projectId: string;
  sourceId: string;
  close: () => void;
  restoreFocus: () => boolean;
}) => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const categories = useKnowledgeCategories();
  const focusPanel = useAssistantPanelFocus(restoreFocus);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const version = params.get('knowledgeVersion')
    ? Number(params.get('knowledgeVersion'))
    : null;
  const editing = params.get('knowledgeEdit') === '1';
  const input = { projectId, sourceId, version };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryKnowledgeStateQuery>(GET_KNOWLEDGE_STATE, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const matches = (
    value: Pick<
      DeliveryKnowledgeStateQuery['deliveryKnowledgeState'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'project' | 'actor'
    >,
  ) =>
    state.permission.matches(value) &&
    value.project.id === projectId &&
    value.project.revision === state.data?.selectedProject?.revision &&
    fastDeepEqual(value.actor, state.data?.actor);
  const reading = useAssistantRead({
    value: query.data?.deliveryKnowledgeState,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      matches(value) &&
      value.source !== undefined &&
      (value.source === null ||
        (value.source.id === sourceId &&
          (version === null || value.source.version === version))),
  });
  const metadata = reading.data?.source;
  const detailQuery = useQuery<DeliveryKnowledgeDetailQuery>(
    GET_KNOWLEDGE_DETAIL,
    {
      variables: {
        input: { ...input, version: version ?? metadata?.version },
        identity: `${source}:${metadata?.revision ?? ''}`,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: reading.data === null || !metadata,
    },
  );
  const detailRead = useAssistantRead({
    value: detailQuery.data?.deliveryKnowledgeDetail,
    source: `${source}:${metadata?.revision ?? ''}`,
    enabled:
      metadata !== null && metadata !== undefined && reading.data !== null,
    loading: detailQuery.loading,
    error: detailQuery.error,
    networkStatus: detailQuery.networkStatus,
    matches: (value) =>
      matches(value) &&
      value.detail?.id === sourceId &&
      value.detail.version === metadata?.version &&
      value.detail.revision === metadata?.revision &&
      value.detail.canEdit === metadata?.canEdit,
  });
  const detail = detailRead.data?.detail ?? null;
  const [privateOwner, setPrivateOwner] = useState<string | null>(null);
  if (detail?.canEdit && privateOwner === null)
    setPrivateOwner(detail.createdBy);
  const [retained, setRetained] = useState<KnowledgeDetail | null>(null);
  if (detail !== null && !fastDeepEqual(detail, retained)) setRetained(detail);
  const current = detail ?? retained;
  const knownDenied =
    isOtogrowAccessDenied(query.error) ||
    isOtogrowAccessDenied(detailQuery.error);
  const canEditLost = Boolean(
    privateOwner !== null &&
    ((reading.data !== null && metadata?.canEdit !== true) ||
      (state.permission.ready &&
        !state.permission.manager &&
        privateOwner !== state.permission.access?.memberId)),
  );
  const [privateEpoch, setPrivateEpoch] = useState(0);
  const [denied, setDenied] = useState(false);
  const lost = knownDenied || canEditLost;
  useLayoutEffect(() => {
    if (lost) {
      cancelPendingNavigation();
      setRetained(null);
      setPrivateOwner(null);
      setPrivateEpoch((value) => value + 1);
      setDenied(true);
    }
  }, [lost, cancelPendingNavigation]);
  const available =
    !knownDenied &&
    !canEditLost &&
    !denied &&
    state.data !== null &&
    detail !== null;
  const [publish, publication] =
    useMutation<PublishDeliveryKnowledgeSourceMutation>(
      PUBLISH_KNOWLEDGE_SOURCE,
    );
  const [message, setMessage] = useState('');
  const [uncertainPublication, setUncertainPublication] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Publication responses cannot expose an earlier source after navigation, outage or revocation.
  const publicationEpoch = useRef(0);
  useLayoutEffect(() => {
    publicationEpoch.current += 1;
    return () => {
      publicationEpoch.current += 1;
    };
  }, [source, available]);
  const refresh = async () => {
    try {
      const result = await query.refetch();
      const value = result.data?.deliveryKnowledgeState;
      if (value && matches(value)) {
        setDenied(false);
        setUncertainPublication(false);
        await detailQuery.refetch();
      }
    } catch {
      // The visible recovery state owns the retry.
    }
  };
  const onSaved = async () => {
    await Promise.all([query.refetch(), detailQuery.refetch()]);
  };
  const publishVersion = async (publishValue: boolean) => {
    if (
      !available ||
      !metadata ||
      !reading.data?.canPublish ||
      publication.loading ||
      uncertainPublication
    )
      return;
    const started = publicationEpoch.current;
    setMessage('');
    setUncertainPublication(true);
    try {
      const result = (
        await publish({
          variables: {
            input: {
              projectId,
              id: sourceId,
              revision: metadata.revision,
              publish: publishValue,
            },
          },
        })
      ).data?.publishDeliveryKnowledgeSource;
      if (started !== publicationEpoch.current) return;
      if (
        !result ||
        !matches(result) ||
        result.source.id !== sourceId ||
        result.source.revision !== metadata.revision + 1
      )
        throw new Error('Unverified publication');
      setUncertainPublication(false);
      setMessage(
        publishValue
          ? t`Reviewed knowledge published for future task assistants.`
          : t`Knowledge withdrawn from future task assistants.`,
      );
      await onSaved();
    } catch (error) {
      if (started !== publicationEpoch.current) return;
      if (isOtogrowAccessDenied(error)) {
        cancelPendingNavigation();
        setRetained(null);
        setDenied(true);
      }
      setMessage(
        t`The publication outcome could not be confirmed. Check current publication before another action.`,
      );
    }
  };
  const restoreEdit = useCallback(() => {
    const target = document.querySelector<HTMLAnchorElement>(
      '[data-knowledge-edit]',
    );
    if (!target || target.closest('[hidden], [inert]')) return false;
    target.focus();
    return document.activeElement === target;
  }, []);
  return (
    <StyledDeliveryCard
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Selected knowledge source`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>{available && current ? current.title : t`Knowledge source`}</h2>
          <StyledDeliveryButton
            disabled={publication.loading}
            onClick={() => requestAction(close)}
          >
            <Trans>Close source</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {message && <p role="status">{message}</p>}
        {reading.data !== null && metadata === null && (
          <p role="alert">
            <Trans>
              This source is unavailable or no longer shared with you. Close it
              to return to the knowledge list.
            </Trans>
          </p>
        )}
        {(!available || uncertainPublication) && (
          <>
            <p role={knownDenied || denied ? 'alert' : 'status'}>
              {denied || knownDenied
                ? t`Source access changed. Private edits were discarded. Refresh current access before continuing.`
                : t`Current source information could not be verified. Any same-source draft is hidden and retained.`}
            </p>
            <StyledDeliveryButton onClick={() => void refresh()}>
              <Trans>Check current source</Trans>
            </StyledDeliveryButton>
          </>
        )}
        <StyledKnowledgeBoundary
          hidden={!available}
          disabled={!available || publication.loading}
          inert={!available || undefined}
        >
          {current && (
            <StyledDeliveryStack>
              <p>
                {categories.find(
                  (category) => category.value === current.category,
                )?.label ?? current.category}{' '}
                · {current.meetingDate} · {t`Version ${current.version}`} ·{' '}
                {current.version === current.publishedVersion
                  ? t`Published for task assistants`
                  : t`Not published for task assistants`}
              </p>
              {editing && current.canEdit && !lost && !denied ? (
                <KnowledgeEditor
                  key={`${sourceId}:${privateEpoch}`}
                  state={state}
                  projectId={projectId}
                  sourceId={sourceId}
                  createId={null}
                  initial={knowledgeDraftFromDetail(projectId, current)}
                  latestRevision={metadata?.revision}
                  enabled={available}
                  intent={null}
                  consumeIntent={NO_CREATE_INTENT}
                  close={() =>
                    requestAction(() =>
                      setParams(
                        knowledgeDestination(params, {
                          knowledgeEdit: null,
                        }).split('?')[1],
                      ),
                    )
                  }
                  restoreFocus={restoreEdit}
                  onAuthorityLost={() => {
                    cancelPendingNavigation();
                    setRetained(null);
                    setDenied(true);
                  }}
                  onSaved={onSaved}
                />
              ) : (
                <>
                  {current.canEdit && (
                    <StyledDeliveryRow>
                      <form
                        key={current.version}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const requested = Number(
                            new FormData(event.currentTarget).get('version'),
                          );
                          if (
                            Number.isSafeInteger(requested) &&
                            requested > 0 &&
                            requested <= current.currentVersion
                          )
                            setParams(
                              knowledgeDestination(params, {
                                knowledgeVersion: String(requested),
                              }).split('?')[1],
                            );
                        }}
                      >
                        <label>
                          <Trans>Source version</Trans>
                          <input
                            name="version"
                            type="number"
                            min={1}
                            max={current.currentVersion}
                            defaultValue={current.version}
                          />
                        </label>
                        <StyledDeliveryButton type="submit">
                          <Trans>Open version</Trans>
                        </StyledDeliveryButton>
                      </form>
                      {current.currentVersion !== current.version && (
                        <Link
                          to={knowledgeDestination(params, {
                            knowledgeVersion: null,
                          })}
                        >
                          <Trans>Current version</Trans>
                        </Link>
                      )}
                      {current.publishedVersion !== null &&
                        current.version !== current.publishedVersion && (
                          <Link
                            to={knowledgeDestination(params, {
                              knowledgeVersion: String(
                                current.publishedVersion,
                              ),
                            })}
                          >
                            <Trans>Published version</Trans>
                          </Link>
                        )}
                      {current.version > 1 && (
                        <Link
                          to={knowledgeDestination(params, {
                            knowledgeVersion: String(current.version - 1),
                          })}
                        >
                          <Trans>Previous version</Trans>
                        </Link>
                      )}
                      {current.version < current.currentVersion && (
                        <Link
                          to={knowledgeDestination(params, {
                            knowledgeVersion: String(current.version + 1),
                          })}
                        >
                          <Trans>Next version</Trans>
                        </Link>
                      )}
                    </StyledDeliveryRow>
                  )}
                  {current.fathomProvenance && (
                    <details>
                      <summary>
                        <Trans>Verified Fathom import provenance</Trans>
                      </summary>
                      <p>
                        {t`Recording ${current.fathomProvenance.recordingId}`} ·{' '}
                        {current.fathomProvenance.recordedAt ??
                          t`Original date unknown`}
                      </p>
                      <p>
                        {current.fathomProvenance.title ??
                          t`Original title unknown`}
                      </p>
                      <p>
                        {t`Fetched ${current.fathomProvenance.importedAt}`} ·{' '}
                        {t`${current.fathomProvenance.segmentCount} original transcript segments`}
                      </p>
                      <p>
                        {current.fathomProvenance.humanEdited
                          ? t`The saved notes were edited after import. The original recording identity is preserved.`
                          : t`The saved notes match the imported transcript. Provider text has not been independently verified.`}
                      </p>
                      <p>
                        <Trans>
                          The knowledge title, source date and reviewed summary
                          are entered by your team. Original provider metadata
                          is preserved above.
                        </Trans>
                      </p>
                      {current.fathomProvenance.sourceUrl && (
                        <a
                          href={current.fathomProvenance.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Trans>Open original Fathom meeting</Trans>
                        </a>
                      )}
                    </details>
                  )}
                  {current.sourceUrl && (
                    <a
                      href={current.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Trans>Open original source</Trans>
                    </a>
                  )}
                  {current.transcript !== null && (
                    <details>
                      <summary>
                        {current.category === 'MEETING'
                          ? t`Original transcript or notes`
                          : t`Source evidence and notes`}
                      </summary>
                      <StyledKnowledgeText>
                        {current.transcript ||
                          t`No source notes have been added. A recording link is reference-only.`}
                      </StyledKnowledgeText>
                    </details>
                  )}
                  <h3>
                    <Trans>Reviewed brand knowledge</Trans>
                  </h3>
                  <StyledKnowledgeText>
                    {current.knowledge ||
                      t`No reviewed facts, rules or decisions drafted yet.`}
                  </StyledKnowledgeText>
                  <StyledDeliveryRow>
                    {current.canEdit &&
                      current.version === current.currentVersion && (
                        <Link
                          data-knowledge-edit
                          to={knowledgeDestination(params, {
                            knowledgeEdit: '1',
                            knowledgeVersion: null,
                          })}
                        >
                          <Trans>Edit draft</Trans>
                        </Link>
                      )}
                    {reading.data?.canPublish &&
                      current.version === current.currentVersion &&
                      current.publishedVersion !== current.currentVersion && (
                        <StyledDeliveryButton
                          data-primary="true"
                          disabled={
                            publication.loading ||
                            uncertainPublication ||
                            !current.transcript?.trim() ||
                            !current.knowledge.trim()
                          }
                          onClick={() => void publishVersion(true)}
                        >
                          <Trans>Publish reviewed knowledge</Trans>
                        </StyledDeliveryButton>
                      )}
                    {reading.data?.canPublish &&
                      current.publishedVersion !== null && (
                        <StyledDeliveryButton
                          disabled={publication.loading || uncertainPublication}
                          onClick={() => void publishVersion(false)}
                        >
                          <Trans>Withdraw from agents</Trans>
                        </StyledDeliveryButton>
                      )}
                  </StyledDeliveryRow>
                  {reading.data?.canPublish &&
                    current.publishedVersion !== current.currentVersion &&
                    (!current.transcript?.trim() ||
                      !current.knowledge.trim()) && (
                      <p>
                        <Trans>
                          Before publishing, add source notes or a transcript
                          and write the reviewed knowledge. A recording link
                          alone is not imported evidence.
                        </Trans>
                      </p>
                    )}
                  <small>
                    <Trans>
                      Publishing updates future task assistant context. It does
                      not change tasks, budgets or approvals.
                    </Trans>
                  </small>
                </>
              )}
            </StyledDeliveryStack>
          )}
        </StyledKnowledgeBoundary>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
