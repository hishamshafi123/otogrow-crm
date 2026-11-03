import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import {
  isCreativeLearningSourceLost,
  type useCreativeLearningAccess,
} from '@/delivery/creative/learning/useCreativeLearningAccess';
import { useCreativeLearningLabels } from '@/delivery/creative/learning/useCreativeLearningLabels';
import { GET_LEARNING_LINKS } from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import {
  creativeLearningDestination,
  LEARNING_CLOSE,
} from '@/delivery/creative/learning/creative-learning-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { type DeliveryCreativeAdLinksQuery } from '~/generated-metadata/graphql';
type CreativeLearningLibraryProps = {
  state: ReturnType<typeof useCreativeLearningAccess>;
  projectId: string;
  onDenied: () => void;
};

export const CreativeLearningLibrary = ({
  state,
  projectId,
  onDenied,
}: CreativeLearningLibraryProps) => {
  const { t } = useLingui();
  const labels = useCreativeLearningLabels();
  const [params] = useSearchParams();
  const input = {
    projectId,
    status: params.get('learningStatus'),
    assetId: null,
    sourceId: params.get('learningSource'),
    adId: params.get('learningAd'),
    afterId: params.get('learningAfter'),
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeAdLinksQuery>(GET_LEARNING_LINKS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeAdLinks,
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
  return (
    <StyledDeliveryStack>
      <h2>
        <Trans>Ad-to-creative evidence</Trans>
      </h2>
      {input.sourceId && input.adId && (
        <p>
          <Trans>
            Showing associations for the selected exact report and ad.
          </Trans>{' '}
          <Link
            to={creativeLearningDestination(params, {
              learningSource: null,
              learningAd: null,
              learningAfter: null,
            })}
          >
            <Trans>All project associations</Trans>
          </Link>
        </p>
      )}
      <p>
        <Trans>
          Reviewed links preserve one ad, report window and approved creative. A
          reused ad ID alone does not establish that a later report used the
          same video.
        </Trans>
      </p>
      <Link
        to={`/delivery?view=ads&adSourceFilter=META&adProject=${projectId}`}
      >
        <Trans>Choose an imported Meta ad to associate</Trans>
      </Link>
      {reading.data ? (
        <>
          <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} accessible associations.`}</p>
          {reading.data.items.map((link) => (
            <StyledDeliveryCard key={link.id}>
              <StyledDeliveryStack>
                <h3>
                  <Link
                    to={creativeLearningDestination(params, {
                      ...LEARNING_CLOSE,
                      learningLink: link.id,
                    })}
                  >
                    {link.adName} · {link.taskTitle}
                  </Link>
                </h3>
                <p>
                  {labels.state(link.state)} · {link.fromDate} –{' '}
                  {link.throughDate}
                </p>
                <p>
                  {link.goalLabel} · {link.concept || t`Concept not recorded`}
                </p>
                <p>
                  {t`Ad account`}: {link.accountId ?? t`Unknown`} ·{' '}
                  {t`Proposed by`}: {link.createdByName}
                </p>
                {link.correctedById && (
                  <Link
                    to={creativeLearningDestination(params, {
                      ...LEARNING_CLOSE,
                      learningLink: link.correctedById,
                    })}
                  >
                    <Trans>Open corrected association</Trans>
                  </Link>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
          {!reading.data.items.length && (
            <p>
              <Trans>
                No accessible associations are recorded for this project.
              </Trans>
            </p>
          )}
          <StyledDeliveryRow>
            {input.afterId && (
              <Link
                to={creativeLearningDestination(params, {
                  learningAfter: null,
                })}
              >
                <Trans>First association page</Trans>
              </Link>
            )}
            {reading.data.nextCursor && (
              <Link
                to={creativeLearningDestination(params, {
                  learningAfter: reading.data.nextCursor,
                })}
              >
                <Trans>More associations</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </>
      ) : (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? t`Associations could not be checked. Retry or return to the first page.`
            : t`Loading associations…`}
        </p>
      )}
      <StyledDeliveryButton
        type="button"
        onClick={() => void query.refetch().catch(() => undefined)}
      >
        <Trans>Refresh associations</Trans>
      </StyledDeliveryButton>
    </StyledDeliveryStack>
  );
};
