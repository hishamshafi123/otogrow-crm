import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useKnowledgeContext } from '@/delivery/knowledge/useKnowledgeContext';
import { KnowledgeProjects } from '@/delivery/knowledge/KnowledgeProjects';
import { KnowledgeList } from '@/delivery/knowledge/KnowledgeList';
import { KnowledgeSource } from '@/delivery/knowledge/KnowledgeSource';
import {
  KnowledgeEditor,
  type KnowledgeCreateIntent,
} from '@/delivery/knowledge/KnowledgeEditor';
import {
  knowledgeDestination,
  knowledgeCloseSelection,
  knowledgeSelectionValid,
} from '@/delivery/knowledge/knowledge-navigation';
import { StyledKnowledgeBoundary } from '@/delivery/knowledge/knowledgeStyles';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryKnowledgePage = () => (
  <PageContainer>
    <PageBody>
      <StyledDeliveryCanvas>
        <DeliveryKnowledge />
      </StyledDeliveryCanvas>
    </PageBody>
  </PageContainer>
);

export const DeliveryKnowledge = (_props: {
  workspace?: DeliveryWorkspace;
}) => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  return (
    <DeliveryKnowledgeWorkspace
      key={`${permission.scope}:${params.get('project') ?? 'projects'}`}
    />
  );
};

export const DeliveryKnowledgeWorkspace = () => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useApolloClient();
  const projectId = params.get('project');
  const sourceId = params.get('source');
  const createId = params.get('knowledgeCreate');
  const categories = useKnowledgeCategories();
  const valid =
    knowledgeSelectionValid(params) &&
    (params.get('knowledgeCategory') === null ||
      categories.some(
        (category) => category.value === params.get('knowledgeCategory'),
      ));
  const state = useKnowledgeContext(projectId, valid);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<KnowledgeCreateIntent | null>(null);
  const [privateDenied, setPrivateDenied] = useState(false);
  const consumeIntent = useCallback(
    (id: string) =>
      setIntent((current) => (current?.id === id ? null : current)),
    [],
  );
  const [retained, setRetained] = useState(state.data);
  if (state.data !== null && !fastDeepEqual(state.data, retained))
    setRetained(state.data);
  const denied = state.denied || privateDenied;
  useLayoutEffect(() => {
    if (state.denied) {
      cancelPendingNavigation();
      setIntent(null);
      setRetained(null);
    }
  }, [state.denied, cancelPendingNavigation]);
  const context = state.data ?? retained;
  const groups = useDeliveryNavigation(
    context?.actor ?? { memberId: '', isAdmin: false, isManager: false },
  );
  const mobile = useIsMobile();
  const expanded = useNavigationDrawerExpanded();
  // oxlint-disable-next-line twenty/no-state-useref -- A source list link may be recreated after close, so focus returns to its current logical destination.
  const listRegion = useRef<HTMLDivElement | null>(null);
  const restoreSource = useCallback(() => {
    const target = listRegion.current?.querySelector<HTMLAnchorElement>(
      `[data-knowledge-source="${sourceId}"]`,
    );
    if (!target || target.closest('[hidden], [inert]')) return false;
    target.focus();
    return document.activeElement === target;
  }, [sourceId]);
  // oxlint-disable-next-line twenty/no-navigate-prefer-link -- Draft confirmation invokes this callback only after a guarded close has been authorized.
  const close = () =>
    navigate(knowledgeDestination(params, knowledgeCloseSelection));
  const add = (category: string) =>
    requestAction(() => {
      if (state.data === null || denied || projectId === null) return;
      const id = crypto.randomUUID();
      setIntent({ id, category });
      navigate(
        knowledgeDestination(params, {
          ...knowledgeCloseSelection,
          knowledgeCreate: id,
        }),
      );
    });
  const retry = async () => {
    await state.permission.refetch().catch(() => undefined);
    const result = await state.query.refetch().catch(() => null);
    if (
      !result?.data ||
      !state.permission.matches(result.data.deliveryKnowledgeContext)
    )
      return;
    setPrivateDenied(false);
    await client
      .refetchQueries({
        include: 'active',
        onQueryUpdated: (query) =>
          [
            'DeliveryKnowledgeProjects',
            'DeliveryKnowledgeList',
            'DeliveryKnowledgeState',
            'DeliveryKnowledgeDetail',
          ].includes(query.queryName ?? '')
            ? query.refetch()
            : false,
      })
      .catch(() => undefined);
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <StyledDeliveryRow>
          {!expanded && <NavigationDrawerCollapseButton direction="right" />}
          <div>
            <h1>
              <Trans>Brand knowledge</Trans>
            </h1>
            <p>
              <Trans>
                Reviewed brand facts, creative rules and meeting decisions.
              </Trans>
            </p>
          </div>
        </StyledDeliveryRow>
        <StyledDeliveryButton onClick={() => void retry()}>
          <Trans>Refresh page</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {mobile && (
        <label>
          <Trans>Go to</Trans>
          <select
            aria-label={t`Go to workspace`}
            value="knowledge"
            onChange={(event) => {
              const destination = `/delivery?view=${event.target.value}`;
              requestAction(() => navigate(destination));
            }}
          >
            {groups.map((group) => (
              <optgroup label={group.label} key={group.id}>
                {group.items.map((item) => (
                  <option key={item.view} value={item.view}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {!valid && (
        <>
          <p role="alert">
            <Trans>
              This knowledge link contains invalid selections. Clear them before
              continuing.
            </Trans>
          </p>
          <Link to="/delivery?view=knowledge">
            <Trans>Clear knowledge selections</Trans>
          </Link>
        </>
      )}
      {valid && (state.data === null || denied) && (
        <StyledDeliveryCard>
          <p
            role={
              state.query.error || denied || state.permission.error
                ? 'alert'
                : 'status'
            }
          >
            {denied
              ? t`Current project access was denied. Private drafts were discarded.`
              : context
                ? t`Current project access could not be verified. Your same-project draft is hidden and retained.`
                : state.query.error || state.permission.error
                  ? t`Your permitted projects could not be verified. Retry current access.`
                  : t`Loading permitted brand knowledge…`}
          </p>
          <StyledDeliveryButton onClick={() => void retry()}>
            <Trans>Retry knowledge access</Trans>
          </StyledDeliveryButton>
          <Link to="/delivery?view=knowledge">
            <Trans>Choose a project</Trans>
          </Link>
        </StyledDeliveryCard>
      )}
      <StyledKnowledgeBoundary
        hidden={!valid || state.data === null || denied}
        disabled={!valid || state.data === null || denied}
        inert={state.data === null || denied || undefined}
      >
        {valid &&
          !denied &&
          context &&
          (projectId === null ? (
            <KnowledgeProjects state={state} />
          ) : (
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <div>
                  <h2>{context.selectedProject?.name}</h2>
                  <Link
                    to={knowledgeDestination(params, {
                      ...knowledgeCloseSelection,
                      project: null,
                      knowledgeAfter: null,
                    })}
                  >
                    <Trans>Choose another project</Trans>
                  </Link>
                </div>
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    disabled={state.data === null || createId !== null}
                    data-primary="true"
                    onClick={() => add('BRAND_FACTS')}
                  >
                    <Trans>Add knowledge</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    disabled={state.data === null || createId !== null}
                    onClick={() => add('MEETING')}
                  >
                    <Trans>Add meeting</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </StyledDeliveryRow>
              {createId !== null && (
                <StyledDeliveryStack>
                  <StyledDeliveryRow>
                    <StyledDeliveryButton onClick={() => requestAction(close)}>
                      <Trans>Close source</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  <KnowledgeEditor
                    key={`create:${createId}`}
                    state={state}
                    projectId={projectId}
                    sourceId={null}
                    createId={createId}
                    intent={intent}
                    consumeIntent={consumeIntent}
                    enabled={state.data !== null}
                    close={() => requestAction(close)}
                    onAuthorityLost={() => {
                      cancelPendingNavigation();
                      setIntent(null);
                      setPrivateDenied(true);
                    }}
                    onSaved={async () => {
                      await state.query.refetch();
                    }}
                  />
                </StyledDeliveryStack>
              )}
              {sourceId !== null && (
                <KnowledgeSource
                  key={sourceId}
                  state={state}
                  projectId={projectId}
                  sourceId={sourceId}
                  close={close}
                  restoreFocus={restoreSource}
                />
              )}
              {createId === null && (
                <div ref={listRegion}>
                  <KnowledgeList state={state} projectId={projectId} />
                </div>
              )}
            </StyledDeliveryStack>
          ))}
      </StyledKnowledgeBoundary>
    </StyledDeliveryStack>
  );
};
