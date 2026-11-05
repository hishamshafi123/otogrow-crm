import { useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type KnowledgeAssetContext,
  type KnowledgeAssetSelection,
  knowledgeUploadMatchesContext,
} from '@/delivery/knowledge/assets/knowledge-assets.types';
import { GET_KNOWLEDGE_UPLOADS } from '@/delivery/knowledge/assets/knowledge-assets.graphql';
import { DeliveryKnowledgeForm } from '@/delivery/knowledge/DeliveryKnowledgeForm';
import {
  GET_KNOWLEDGE_DETAIL,
  SAVE_KNOWLEDGE_SOURCE,
} from '@/delivery/knowledge/knowledge-read.graphql';
import {
  knowledgeDestination,
  knowledgeCloseSelection,
} from '@/delivery/knowledge/knowledge-navigation';
import {
  knowledgeDraftFromDetail,
  knowledgeMatchesSubmitted,
} from '@/delivery/knowledge/knowledge-recovery';
import { type useKnowledgeContext } from '@/delivery/knowledge/useKnowledgeContext';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { StyledKnowledgeBoundary } from '@/delivery/knowledge/knowledgeStyles';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryKnowledgeSaveInput,
  type DeliveryKnowledgeDetailQuery,
  type DeliveryKnowledgeUploadsQuery,
  type SaveDeliveryKnowledgeSourceMutation,
} from '~/generated-metadata/graphql';

export type KnowledgeCreateIntent = { id: string; category: string };
export const KnowledgeEditor = ({
  state,
  projectId,
  sourceId,
  createId,
  initial,
  initialAssets = [],
  latestRevision,
  enabled,
  intent,
  consumeIntent,
  close,
  onAuthorityLost,
  onSaved,
  restoreFocus,
}: {
  state: ReturnType<typeof useKnowledgeContext>;
  projectId: string;
  sourceId: string | null;
  createId: string | null;
  initial?: DeliveryKnowledgeSaveInput;
  initialAssets?: KnowledgeAssetSelection[];
  latestRevision?: number;
  enabled: boolean;
  intent: KnowledgeCreateIntent | null;
  consumeIntent: (id: string) => void;
  close: () => void;
  onAuthorityLost: () => void;
  onSaved: () => Promise<unknown>;
  restoreFocus?: () => boolean;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const client = useApolloClient();
  const focusPanel = useAssistantPanelFocus(restoreFocus);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [save, mutation] = useMutation<SaveDeliveryKnowledgeSourceMutation>(
    SAVE_KNOWLEDGE_SOURCE,
  );
  const [opened, setOpened] = useState<DeliveryKnowledgeSaveInput | null>(
    () =>
      initial ??
      (createId !== null && intent?.id === createId
        ? {
            id: createId,
            projectId,
            revision: 0,
            category: intent.category,
            title: '',
            meetingDate: new Date().toLocaleDateString('en-CA'),
            sourceUrl: '',
            transcript: '',
            knowledge: '',
            attachments: [],
          }
        : null),
  );
  const [openedAssets, setOpenedAssets] = useState(initialAssets);
  const [foundAssets, setFoundAssets] = useState<KnowledgeAssetSelection[]>([]);
  const [retainedAssetContext, setRetainedAssetContext] =
    useState<KnowledgeAssetContext | null>(null);
  const assetContext: KnowledgeAssetContext | null =
    state.data?.selectedProject && opened
      ? {
          workspaceId: state.data.workspaceId,
          memberId: state.data.memberId,
          userWorkspaceId: state.data.userWorkspaceId,
          projectId,
          projectRevision: state.data.selectedProject.revision,
          companyId: state.data.selectedProject.companyId ?? null,
          sourceId: opened.id,
          sourceRevision: opened.revision,
          scope: state.scope,
        }
      : retainedAssetContext;
  if (
    assetContext !== null &&
    !fastDeepEqual(assetContext, retainedAssetContext)
  )
    setRetainedAssetContext(assetContext);
  useLayoutEffect(() => {
    if (createId !== null) consumeIntent(createId);
  }, [createId, consumeIntent]);
  const [frozen, setFrozen] = useState<DeliveryKnowledgeSaveInput | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [found, setFound] = useState<DeliveryKnowledgeSaveInput | null>(null);
  const [committed, setCommitted] = useState(false);
  const [message, setMessage] = useState('');
  const [blankDraftScope, setBlankDraftScope] = useState<string | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Only the explicit recovery check may move lost keyboard focus to its result.
  const recoveryFocus = useRef<{
    opener: Element | null;
    scope: string;
  } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- This is a native focus target, not render state.
  const recoveryResult = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (checking || saving || mutation.loading || !recoveryFocus.current)
      return;
    const request = recoveryFocus.current;
    recoveryFocus.current = null;
    const result = recoveryResult.current;
    const active = document.activeElement;
    if (
      !enabled ||
      request.scope !== state.scope ||
      !result?.textContent?.trim() ||
      result.closest('[hidden], [inert]')
    )
      return;
    if (
      active === request.opener ||
      active === document.body ||
      active === document.documentElement
    ) {
      (
        result.querySelector<HTMLElement>('button:not(:disabled), a[href]') ??
        result
      ).focus();
    }
  }, [
    checking,
    saving,
    mutation.loading,
    message,
    blankDraftScope,
    found,
    enabled,
    state.scope,
  ]);
  const [version, setVersion] = useState(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-event saves and late responses must respect the current authorized editor lifetime.
  const operation = useRef({ epoch: 0, busy: false });
  useLayoutEffect(() => {
    const controller = operation.current;
    controller.epoch += 1;
    setBlankDraftScope(null);
    return () => {
      controller.epoch += 1;
    };
  }, [enabled, projectId, sourceId, createId, state.scope]);
  const matches = (
    value: Pick<
      DeliveryKnowledgeDetailQuery['deliveryKnowledgeDetail'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'project' | 'actor'
    >,
  ) =>
    state.permission.matches(value) &&
    value.project.id === projectId &&
    value.project.revision === state.data?.selectedProject?.revision &&
    (value.project.companyId ?? null) ===
      (state.data?.selectedProject?.companyId ?? null) &&
    fastDeepEqual(value.actor, state.data?.actor);
  useDeliveryDraftStatus({
    dirty: frozen !== null,
    saving: mutation.loading || checking,
  });
  const loseAuthority = () => {
    operation.current.epoch += 1;
    cancelPendingNavigation();
    setOpened(null);
    setFrozen(null);
    setFound(null);
    setOpenedAssets([]);
    setFoundAssets([]);
    setRetainedAssetContext(null);
    setBlankDraftScope(null);
    setRetryAllowed(false);
    onAuthorityLost();
  };
  const saveExact = async (input: DeliveryKnowledgeSaveInput) => {
    if (!enabled || committed || operation.current.busy) return false;
    const exact = {
      ...input,
      category: input.category ?? 'MEETING',
      title: input.title.trim(),
      sourceUrl: input.sourceUrl.trim(),
      transcript: input.transcript.trim(),
      knowledge: input.knowledge.trim(),
    };
    operation.current.busy = true;
    recoveryFocus.current = {
      opener: document.activeElement,
      scope: state.scope,
    };
    setSaving(true);
    const started = operation.current.epoch;
    setFrozen(exact);
    setMessage('');
    setRetryAllowed(false);
    try {
      const result = (await save({ variables: { input: exact } })).data
        ?.saveDeliveryKnowledgeSource;
      if (started !== operation.current.epoch) return false;
      if (
        !result ||
        !matches(result) ||
        result.source.id !== input.id ||
        result.source.revision !== input.revision + 1
      )
        throw new Error('Unverified knowledge save');
      setCommitted(true);
      setFrozen(null);
      setMessage(
        t`Knowledge draft saved. Published agent knowledge has not changed.`,
      );
      await onSaved().catch(() => undefined);
      return true;
    } catch (error) {
      if (started !== operation.current.epoch) return false;
      if (isOtogrowAccessDenied(error)) {
        loseAuthority();
        return false;
      }
      setMessage(
        t`We could not confirm the save. Your submitted notes are kept. Check the saved draft before trying again.`,
      );
      return false;
    } finally {
      operation.current.busy = false;
      setSaving(false);
    }
  };
  const check = async (opener: HTMLButtonElement) => {
    if (!enabled || operation.current.busy || checking) return;
    recoveryFocus.current = { opener, scope: state.scope };
    const started = operation.current.epoch;
    operation.current.busy = true;
    setChecking(true);
    setMessage('');
    setRetryAllowed(false);
    setFound(null);
    setBlankDraftScope(null);
    try {
      const response = await client.query<DeliveryKnowledgeDetailQuery>({
        query: GET_KNOWLEDGE_DETAIL,
        variables: { input: { projectId, sourceId: createId ?? sourceId } },
        fetchPolicy: 'no-cache',
      });
      if (started !== operation.current.epoch) return;
      const result = response.data?.deliveryKnowledgeDetail;
      if (!result || !matches(result)) throw new Error('Unverified source');
      const detail = result.detail;
      if (detail === undefined) throw new Error('Unverified source content');
      if (detail === null) {
        setRetryAllowed(createId !== null && frozen !== null);
        setMessage(
          frozen !== null && createId !== null
            ? t`No saved draft was found. You can retry saving the notes you already submitted.`
            : t`No saved draft was found. The unsaved notes are no longer available. Close this view to start a new draft.`,
        );
        if (
          createId !== null &&
          frozen === null &&
          opened === null &&
          state.data?.selectedProject
        ) {
          const context: KnowledgeAssetContext = {
            workspaceId: state.data.workspaceId,
            memberId: state.data.memberId,
            userWorkspaceId: state.data.userWorkspaceId,
            projectId,
            projectRevision: state.data.selectedProject.revision,
            companyId: state.data.selectedProject.companyId ?? null,
            sourceId: createId,
            sourceRevision: 0,
            scope: state.scope,
          };
          const uploads = (
            await client.query<DeliveryKnowledgeUploadsQuery>({
              query: GET_KNOWLEDGE_UPLOADS,
              variables: { input: { projectId, sourceId: createId } },
              fetchPolicy: 'no-cache',
            })
          ).data?.deliveryKnowledgeUploads;
          if (started !== operation.current.epoch) return;
          if (
            uploads &&
            uploads.workspaceId === context.workspaceId &&
            uploads.memberId === context.memberId &&
            uploads.userWorkspaceId === context.userWorkspaceId &&
            uploads.projectId === projectId &&
            uploads.items.some(
              (receipt) =>
                knowledgeUploadMatchesContext(receipt, context) &&
                receipt.sourceRevision === 0 &&
                receipt.availability === 'CURRENT' &&
                receipt.state === 'READY' &&
                receipt.canAttach,
            )
          ) {
            setBlankDraftScope(state.scope);
            setMessage(
              t`Your original file uploads are available. Unsaved notes cannot be restored. Continue with a blank draft, then choose which uploaded files to use.`,
            );
          }
        }
      } else if (detail.id !== (createId ?? sourceId) || !detail.canEdit) {
        loseAuthority();
      } else if (frozen !== null && knowledgeMatchesSubmitted(detail, frozen)) {
        setCommitted(true);
        setFrozen(null);
        setMessage(t`The current saved draft matches your submitted notes.`);
        await onSaved().catch(() => undefined);
      } else {
        setFound(knowledgeDraftFromDetail(projectId, detail));
        setFoundAssets(
          detail.attachments.map((asset) => ({
            asset,
            version: detail.version,
          })),
        );
        setMessage(
          t`A saved draft already exists. Review it before making another change.`,
        );
      }
    } catch (error) {
      if (started !== operation.current.epoch) return;
      if (isOtogrowAccessDenied(error)) loseAuthority();
      else
        setMessage(
          t`Your draft could not be checked. Keep this recovery view open and check again.`,
        );
    } finally {
      operation.current.busy = false;
      setChecking(false);
    }
  };
  return (
    <StyledDeliveryStack
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Knowledge source editor`}
    >
      {createId !== null && opened === null && !committed && (
        <h2>
          <Trans>Recover knowledge draft</Trans>
        </h2>
      )}
      {(saving || mutation.loading) && (
        <p role="status">
          <Trans>Saving knowledge draft…</Trans>
        </p>
      )}
      {(opened === null || frozen !== null) &&
        !committed &&
        !saving &&
        !mutation.loading && (
          <>
            <p role="status">
              <Trans>
                Check whether your draft was saved before trying again.
              </Trans>
            </p>
            <StyledDeliveryButton
              disabled={!enabled || checking || mutation.loading}
              onClick={(event) => void check(event.currentTarget)}
            >
              <Trans>Check saved knowledge source</Trans>
            </StyledDeliveryButton>
          </>
        )}
      <StyledDeliveryStack
        ref={recoveryResult}
        tabIndex={-1}
        aria-label={t`Knowledge recovery result`}
      >
        {message && <p role="status">{message}</p>}
        {opened === null &&
          frozen === null &&
          blankDraftScope === state.scope && (
            <StyledDeliveryButton
              disabled={!enabled || checking || mutation.loading}
              onClick={() => {
                if (
                  !enabled ||
                  createId === null ||
                  blankDraftScope !== state.scope
                )
                  return;
                setOpened({
                  id: createId,
                  projectId,
                  revision: 0,
                  category: 'ASSET_REFERENCE',
                  title: '',
                  meetingDate: new Date().toLocaleDateString('en-CA'),
                  sourceUrl: '',
                  transcript: '',
                  knowledge: '',
                  attachments: [],
                });
                setOpenedAssets([]);
                setBlankDraftScope(null);
                setMessage(
                  t`Write new usage notes, then check unused uploads below to choose your original files. Saving creates a draft for manager review.`,
                );
              }}
            >
              <Trans>Continue with a blank draft</Trans>
            </StyledDeliveryButton>
          )}
        {found !== null && enabled && (
          <>
            <p>{found.title}</p>
            {createId !== null ? (
              <Link
                to={knowledgeDestination(params, {
                  source: found.id,
                  knowledgeCreate: null,
                  knowledgeEdit: '1',
                  knowledgeVersion: null,
                })}
              >
                <Trans>Review current saved draft</Trans>
              </Link>
            ) : (
              <StyledDeliveryButton
                onClick={() =>
                  requestAction(() => {
                    setOpened(found);
                    setOpenedAssets(foundAssets);
                    setFrozen(null);
                    setFound(null);
                    setVersion((current) => current + 1);
                    setMessage('');
                  })
                }
              >
                <Trans>Review current saved draft</Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
        {committed && (
          <Link
            to={knowledgeDestination(params, {
              ...knowledgeCloseSelection,
              source: createId ?? sourceId,
            })}
          >
            <Trans>Open saved knowledge</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
      <StyledKnowledgeBoundary
        hidden={!enabled || committed}
        disabled={!enabled || frozen !== null || checking || mutation.loading}
        inert={!enabled || undefined}
      >
        {opened !== null && !committed && (
          <DeliveryKnowledgeForm
            key={version}
            initial={opened}
            initialAssets={openedAssets}
            assetContext={assetContext ?? undefined}
            latestRevision={latestRevision}
            busy={mutation.loading || checking}
            enabled={enabled}
            readOnly={frozen !== null}
            onSave={saveExact}
            onClose={close}
            onSaved={() => undefined}
            onAuthorityLost={loseAuthority}
            fathomContext={
              state.data?.actor.isAdmin && state.data.selectedProject
                ? {
                    workspaceId: state.data.workspaceId,
                    memberId: state.data.memberId,
                    userWorkspaceId: state.data.userWorkspaceId,
                    actor: state.data.actor,
                    projectRevision: state.data.selectedProject.revision,
                  }
                : undefined
            }
            onReload={() =>
              requestAction(() => {
                if (initial) {
                  setOpened(initial);
                  setOpenedAssets(initialAssets);
                  setVersion((current) => current + 1);
                }
              })
            }
          />
        )}
      </StyledKnowledgeBoundary>
      {retryAllowed && frozen !== null && (
        <StyledDeliveryButton
          disabled={!enabled || checking || mutation.loading}
          onClick={() => void saveExact(frozen)}
        >
          <Trans>Retry submitted notes</Trans>
        </StyledDeliveryButton>
      )}
    </StyledDeliveryStack>
  );
};
