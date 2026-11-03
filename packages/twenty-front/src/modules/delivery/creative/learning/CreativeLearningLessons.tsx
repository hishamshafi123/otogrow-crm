import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import {
  isCreativeLearningSourceLost,
  type useCreativeLearningAccess,
} from '@/delivery/creative/learning/useCreativeLearningAccess';
import { useCreativeLearningLabels } from '@/delivery/creative/learning/useCreativeLearningLabels';
import { GET_CREATIVE_LESSONS } from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import {
  creativeLearningDestination,
  LEARNING_CLOSE,
} from '@/delivery/creative/learning/creative-learning-navigation';
import { CreativeLearningEvidence } from '@/delivery/creative/learning/CreativeLearningEvidence';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { type DeliveryCreativeLessonsQuery } from '~/generated-metadata/graphql';
type CreativeLearningLessonsProps = {
  state: ReturnType<typeof useCreativeLearningAccess>;
  projectId: string;
  onDenied: () => void;
  onCorrect: (id: string, linkId: string) => void;
};

export const CreativeLearningLessons = ({
  state,
  projectId,
  onDenied,
  onCorrect,
}: CreativeLearningLessonsProps) => {
  const { t } = useLingui();
  const labels = useCreativeLearningLabels();
  const [params] = useSearchParams();
  const input = {
    projectId,
    afterId: params.get('learningLessonsAfter'),
    selectedId:
      params.get('learningMode') === 'lesson'
        ? null
        : params.get('learningLesson'),
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeLessonsQuery>(GET_CREATIVE_LESSONS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeLessons,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.matches,
  });
  useLayoutEffect(() => {
    if (isCreativeLearningSourceLost(query.error)) onDenied();
  }, [query.error, onDenied]);
  const assessment = (value: string) =>
    value === 'PROMISING'
      ? t`Promising observation, not proof`
      : value === 'NEEDS_ANOTHER_TEST'
        ? t`Needs another test`
        : t`Inconclusive`;
  return (
    <StyledDeliveryStack>
      <h2>
        <Trans>Recorded creative lessons</Trans>
      </h2>
      <p>
        <Trans>
          Human interpretations retain exact reviewed evidence. They do not
          establish causality or automatically change brand knowledge, tasks or
          ads.
        </Trans>
      </p>
      {reading.data ? (
        <>
          <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} lessons.`}</p>
          {reading.data.items.map((lesson) => (
            <StyledDeliveryCard key={lesson.id}>
              <Link
                to={creativeLearningDestination(params, {
                  ...LEARNING_CLOSE,
                  learningLesson: lesson.id,
                })}
              >
                {lesson.title}
              </Link>
              <p>
                {assessment(lesson.assessment)} · {lesson.createdByName} ·{' '}
                {lesson.createdAt}
              </p>
              {lesson.correctedById && (
                <p>
                  <Trans>A later lesson corrects this interpretation.</Trans>
                </p>
              )}
            </StyledDeliveryCard>
          ))}
          {reading.data.selected && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h3>{reading.data.selected.title}</h3>
                {state.permission.manager &&
                  !reading.data.selected.correctedById &&
                  reading.data.selected.evidence.length > 0 && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        const selected = reading.data?.selected;
                        const anchor = selected?.evidence[0];
                        if (selected && anchor)
                          onCorrect(selected.id, anchor.linkId);
                      }}
                    >
                      <Trans>Record a correction to this lesson</Trans>
                    </StyledDeliveryButton>
                  )}
                <p>{assessment(reading.data.selected.assessment)}</p>
                <p>{reading.data.selected.lesson}</p>
                <h4>
                  <Trans>Limits and uncertainty</Trans>
                </h4>
                <p>{reading.data.selected.limitations}</p>
                <h4>
                  <Trans>Next test</Trans>
                </h4>
                <p>{reading.data.selected.nextTest || t`Not recorded`}</p>
                {reading.data.selected.warnings.map((warning) => (
                  <p key={warning}>{labels.warning(warning)}</p>
                ))}
                {reading.data.selected.evidence.map((evidence) => (
                  <details key={evidence.linkId}>
                    <summary>
                      {evidence.body.adName} · {evidence.body.source.fromDate} –{' '}
                      {evidence.body.source.throughDate} ·{' '}
                      {t`Reviewed version ${evidence.version}`}
                    </summary>
                    <CreativeLearningEvidence body={evidence.body} />
                    <Link
                      to={creativeLearningDestination(params, {
                        ...LEARNING_CLOSE,
                        learningLink: evidence.linkId,
                        learningVersion: String(evidence.version),
                      })}
                    >
                      <Trans>Open exact association</Trans>
                    </Link>
                  </details>
                ))}
                <Link to={`/delivery?view=knowledge&project=${projectId}`}>
                  <Trans>
                    Open brand knowledge to prepare an explicit draft
                  </Trans>
                </Link>
                <p>
                  <Trans>
                    This lesson has not been published to brand knowledge.
                  </Trans>
                </p>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          <StyledDeliveryRow>
            {input.afterId && (
              <Link
                to={creativeLearningDestination(params, {
                  learningLessonsAfter: null,
                })}
              >
                <Trans>First lesson page</Trans>
              </Link>
            )}
            {reading.data.nextCursor && (
              <Link
                to={creativeLearningDestination(params, {
                  learningLessonsAfter: reading.data.nextCursor,
                })}
              >
                <Trans>More lessons</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </>
      ) : (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? t`Lessons could not be verified.`
            : t`Loading lessons…`}
        </p>
      )}
      <StyledDeliveryButton
        type="button"
        onClick={() => void query.refetch().catch(() => undefined)}
      >
        <Trans>Refresh lessons</Trans>
      </StyledDeliveryButton>
    </StyledDeliveryStack>
  );
};
