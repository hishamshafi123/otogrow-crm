import { useCallback, useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { GET_CREATIVE_PROJECTS } from '@/delivery/creative/production/creative-production.graphql';
import {
  isCreativeLearningSourceLost,
  useCreativeLearningAccess,
} from '@/delivery/creative/learning/useCreativeLearningAccess';
import { CreativeLearningLibrary } from '@/delivery/creative/learning/CreativeLearningLibrary';
import { CreativeLearningDetail } from '@/delivery/creative/learning/CreativeLearningDetail';
import { CreativeLearningEditor } from '@/delivery/creative/learning/CreativeLearningEditor';
import { CreativeLearningLessons } from '@/delivery/creative/learning/CreativeLearningLessons';
import { type CreativeLearningIntent } from '@/delivery/creative/learning/creative-learning.types';
import {
  creativeLearningDestination,
  learningSelectionValid,
  LEARNING_CLOSE,
} from '@/delivery/creative/learning/creative-learning-navigation';
import { StyledLearningBoundary } from '@/delivery/creative/learning/creativeLearningStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { type DeliveryCreativeProjectsQuery } from '~/generated-metadata/graphql';
export const DeliveryCreativeLearningPage = () => (
  <DeliveryOperationalPage view="creative">
    <CreativeLearningWorkspace />
  </DeliveryOperationalPage>
);
const CreativeLearningWorkspace = () => {
  const state = useCreativeLearningAccess();
  const { t } = useLingui();
  const [params] = useSearchParams();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const { invalidate } = state;
  const [owner, setOwner] = useState<string | null>(null),
    [localDenied, setLocalDenied] = useState(false),
    [epoch, setEpoch] = useState(0);
  const currentOwner = state.data
    ? `${state.source}:${state.data.scope}`
    : null;
  const changed =
    owner !== null && currentOwner !== null && owner !== currentOwner;
  const denied = localDenied || state.denied;
  useLayoutEffect(() => {
    if (state.denied || changed) {
      invalidate();
      cancelPendingNavigation();
      setOwner(null);
      setEpoch((value) => value + 1);
    } else if (owner === null && currentOwner !== null && !localDenied)
      setOwner(currentOwner);
  }, [
    state.denied,
    changed,
    owner,
    currentOwner,
    localDenied,
    invalidate,
    cancelPendingNavigation,
  ]);
  const lose = useCallback(() => {
    invalidate();
    cancelPendingNavigation();
    setLocalDenied(true);
    setOwner(null);
    setEpoch((value) => value + 1);
  }, [invalidate, cancelPendingNavigation]);
  const available =
    state.data !== null && !denied && !changed && owner === currentOwner;
  const valid = learningSelectionValid(params);
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h2>
          <Trans>Creative learning</Trans>
        </h2>
        <Link to="/delivery?view=creative">
          <Trans>Back to creative production</Trans>
        </Link>
      </StyledDeliveryRow>
      {!available && (
        <div role={denied || state.query.error ? 'alert' : 'status'}>
          <p>
            {denied
              ? t`Current source access changed. Private preparation was cleared.`
              : t`Current access is being checked. Unsaved preparation is hidden and retained during a connection problem.`}
          </p>
          <StyledDeliveryButton
            type="button"
            onClick={async () => {
              const result = await state.query.refetch().catch(() => null);
              if (
                result?.data &&
                state.matches(result.data.deliveryCreativeContext)
              ) {
                setLocalDenied(false);
                setOwner(
                  `${state.source}:${result.data.deliveryCreativeContext.scope}`,
                );
              }
            }}
          >
            <Trans>Check creative access</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      {!valid && (
        <p role="alert">
          <Trans>
            This learning link is invalid. Return to creative production and
            choose the exact report again.
          </Trans>
        </p>
      )}
      <StyledLearningBoundary
        hidden={!available || !valid}
        disabled={!available || !valid}
        inert={!available || !valid || undefined}
      >
        {owner !== null && valid && (
          <LearningBody
            key={`${owner}:${epoch}`}
            state={state}
            enabled={available}
            onDenied={lose}
          />
        )}
      </StyledLearningBoundary>
    </StyledDeliveryStack>
  );
};
const LearningBody = ({
  state,
  enabled,
  onDenied,
}: {
  state: ReturnType<typeof useCreativeLearningAccess>;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<CreativeLearningIntent | null>(null);
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((value) => (value?.requestId === requestId ? null : value)),
    [],
  );
  const projectId = params.get('learningProject'),
    sourceId = params.get('learningSource'),
    adId = params.get('learningAd'),
    linkId = params.get('learningLink'),
    requestId = params.get('learningRequest'),
    mode = params.get('learningMode');
  const go = (changes: Record<string, string | null>) =>
    requestAction(() => navigate(creativeLearningDestination(params, changes)));
  const openIntent = (
    mode: CreativeLearningIntent['mode'],
    id: string,
    action?: string,
    source?: { sourceId: string; adId: string },
  ) =>
    requestAction(() => {
      const requestId = crypto.randomUUID();
      setIntent({ mode, id, requestId, action });
      navigate(
        creativeLearningDestination(params, {
          learningMode: mode,
          learningRequest: requestId,
          learningAction: action ?? null,
          learningVersion: null,
          learningEvent: null,
          ...(source
            ? { learningSource: source.sourceId, learningAd: source.adId }
            : {}),
          ...(mode === 'lesson'
            ? { learningLesson: id }
            : { learningLink: id }),
          ...(mode === 'new'
            ? { learningCorrects: action === 'CORRECT' ? linkId : null }
            : {}),
        }),
      );
    });
  return (
    <StyledDeliveryStack>
      <LearningProjects
        state={state}
        projectId={projectId}
        onDenied={onDenied}
        onSelect={(id) =>
          go({
            ...LEARNING_CLOSE,
            learningProject: id,
            learningAfter: null,
            learningLessonsAfter: null,
          })
        }
      />
      {projectId ? (
        <>
          {sourceId && adId && mode !== 'new' && (
            <StyledDeliveryCard>
              <p>{t`Selected Meta ad ${adId}`}</p>
              <StyledDeliveryButton
                type="button"
                disabled={!enabled}
                onClick={() => openIntent('new', crypto.randomUUID())}
              >
                <Trans>Prepare an association with this ad</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryCard>
          )}
          {mode === 'new' && linkId && requestId && sourceId && adId ? (
            <CreativeLearningEditor
              key={`${projectId}:${sourceId}:${adId}:${requestId}`}
              state={state}
              projectId={projectId}
              sourceId={sourceId}
              adId={adId}
              id={linkId}
              requestId={requestId}
              intent={intent}
              consumeIntent={consumeIntent}
              existing={null}
              currentRevision={null}
              canEdit
              enabled={enabled}
              onDenied={onDenied}
              onSaved={() => undefined}
            />
          ) : linkId ? (
            <CreativeLearningDetail
              key={`${projectId}:${linkId}`}
              state={state}
              id={linkId}
              projectId={projectId}
              enabled={enabled}
              intent={intent}
              consumeIntent={consumeIntent}
              openIntent={openIntent}
              onDenied={onDenied}
            />
          ) : null}
          <CreativeLearningLibrary
            state={state}
            projectId={projectId}
            onDenied={onDenied}
          />
          <CreativeLearningLessons
            state={state}
            projectId={projectId}
            onDenied={onDenied}
            onCorrect={(correctsId, anchorId) =>
              requestAction(() => {
                const requestId = crypto.randomUUID();
                const id = crypto.randomUUID();
                setIntent({ mode: 'lesson', id, requestId });
                navigate(
                  creativeLearningDestination(params, {
                    ...LEARNING_CLOSE,
                    learningLink: anchorId,
                    learningMode: 'lesson',
                    learningRequest: requestId,
                    learningLesson: id,
                    learningLessonCorrects: correctsId,
                  }),
                );
              })
            }
          />
        </>
      ) : (
        <p>
          <Trans>
            Choose a project to inspect its creative evidence and lessons.
          </Trans>
        </p>
      )}
    </StyledDeliveryStack>
  );
};
const LearningProjects = ({
  state,
  projectId,
  onSelect,
  onDenied,
}: {
  state: ReturnType<typeof useCreativeLearningAccess>;
  projectId: string | null;
  onSelect: (id: string) => void;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const [search, setSearch] = useState(''),
    [after, setAfter] = useState<string | null>(null);
  const input = { search, after, limit: 25 };
  const source = `${state.source}:${state.data?.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeProjectsQuery>(GET_CREATIVE_PROJECTS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeProjects,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) && value.scope === state.data?.scope,
  });
  useLayoutEffect(() => {
    if (isCreativeLearningSourceLost(query.error)) onDenied();
  }, [query.error, onDenied]);
  return (
    <details open={!projectId}>
      <summary>
        {reading.data?.items.find((project) => project.id === projectId)
          ?.name ?? t`Choose the creative’s project`}
      </summary>
      <StyledDeliveryStack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(
              String(
                new FormData(event.currentTarget).get('search') ?? '',
              ).trim(),
            );
            setAfter(null);
          }}
        >
          <label>
            <Trans>Find a client project</Trans>
            <input name="search" maxLength={160} defaultValue={search} />
          </label>
          <StyledDeliveryButton type="submit">
            <Trans>Find projects</Trans>
          </StyledDeliveryButton>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} projects.`}</p>
            {reading.data.items.map((project) => (
              <StyledDeliveryButton
                type="button"
                key={project.id}
                onClick={() => onSelect(project.id)}
              >
                {project.name}
              </StyledDeliveryButton>
            ))}
            <StyledDeliveryRow>
              {after && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(null)}
                >
                  <Trans>First projects</Trans>
                </StyledDeliveryButton>
              )}
              {reading.data.nextCursor && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                >
                  <Trans>More projects</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Projects could not be verified.`
              : t`Loading projects…`}
          </p>
        )}
      </StyledDeliveryStack>
    </details>
  );
};
