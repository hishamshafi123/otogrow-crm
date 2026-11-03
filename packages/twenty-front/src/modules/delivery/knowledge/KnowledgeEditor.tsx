import { useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
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
  type SaveDeliveryKnowledgeSourceMutation,
} from '~/generated-metadata/graphql';

export type KnowledgeCreateIntent = { id: string; category: string };
export const KnowledgeEditor = ({
  state,
  projectId,
  sourceId,
  createId,
  initial,
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
          }
        : null),
  );
  useLayoutEffect(() => {
    if (createId !== null) consumeIntent(createId);
  }, [createId, consumeIntent]);
  const [frozen, setFrozen] = useState<DeliveryKnowledgeSaveInput | null>(null);
  const [checking, setChecking] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [found, setFound] = useState<DeliveryKnowledgeSaveInput | null>(null);
  const [committed, setCommitted] = useState(false);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-event saves and late responses must respect the current authorized editor lifetime.
  const operation = useRef({ epoch: 0, busy: false });
  useLayoutEffect(() => {
    const controller = operation.current;
    controller.epoch += 1;
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
    }
  };
  const check = async () => {
    if (!enabled || operation.current.busy || checking) return;
    const started = operation.current.epoch;
    operation.current.busy = true;
    setChecking(true);
    setMessage('');
    setRetryAllowed(false);
    setFound(null);
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
      } else if (detail.id !== (createId ?? sourceId) || !detail.canEdit) {
        loseAuthority();
      } else if (frozen !== null && knowledgeMatchesSubmitted(detail, frozen)) {
        setCommitted(true);
        setFrozen(null);
        setMessage(t`The current saved draft matches your submitted notes.`);
        await onSaved().catch(() => undefined);
      } else {
        setFound(knowledgeDraftFromDetail(projectId, detail));
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
      {(opened === null || frozen !== null) && !committed && (
        <>
          <p role="status">
            <Trans>
              Check whether your draft was saved before trying again.
            </Trans>
          </p>
          <StyledDeliveryButton
            disabled={!enabled || checking || mutation.loading}
            onClick={() => void check()}
          >
            <Trans>Check saved knowledge source</Trans>
          </StyledDeliveryButton>
        </>
      )}
      {message && <p role="status">{message}</p>}
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
      <StyledKnowledgeBoundary
        hidden={!enabled || committed}
        disabled={!enabled || frozen !== null || checking || mutation.loading}
        inert={!enabled || undefined}
      >
        {opened !== null && !committed && (
          <DeliveryKnowledgeForm
            key={version}
            initial={opened}
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
  );
};
