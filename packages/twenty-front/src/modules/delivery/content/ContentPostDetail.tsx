import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { type ContentIntent } from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { useContentRead } from '@/delivery/content/useContentRead';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import { GET_CONTENT_DETAIL } from '@/delivery/content/delivery-content.graphql';
import {
  contentDestination,
  CONTENT_CLOSE_POST,
} from '@/delivery/content/content-navigation';
import {
  ContentAttemptNotice,
  ContentTimestamp,
} from '@/delivery/content/ContentAttemptNotice';
import { ContentPostingPreview } from '@/delivery/content/ContentPostingPreview';
import {
  StyledContentItem,
  StyledContentText,
} from '@/delivery/content/contentStyles';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryContentDetailQuery } from '~/generated-metadata/graphql';

export const ContentPostDetail = ({
  access,
  projectId,
  postId,
  enabled,
  onDenied,
  open,
}: {
  access: ReturnType<typeof useContentAccess>;
  projectId: string;
  postId: string;
  enabled: boolean;
  onDenied: () => void;
  open: (
    intent: Omit<ContentIntent, 'requestId' | 'sourceScope' | 'project'>,
  ) => void;
}) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const version = params.has('contentVersion')
    ? Number(params.get('contentVersion'))
    : null;
  const query = useQuery<DeliveryContentDetailQuery>(GET_CONTENT_DETAIL, {
    variables: {
      input: {
        id: postId,
        version,
        afterEventId: params.get('contentHistoryAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const read = useContentRead({
    value: query.data?.deliveryContentDetail,
    access,
    query,
    scope: `detail:${postId}:${version}:${params.get('contentHistoryAfter')}`,
    matches: (value) =>
      value.project.id === projectId &&
      value.variant.id === postId &&
      (version === null || value.selectedVersion === version),
    onDenied,
  });
  const data = read.data;
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`Posting package details`}>
      <StyledDeliveryStack>
        <Link to={contentDestination(params, CONTENT_CLOSE_POST)}>
          <Trans>Back to post variants</Trans>
        </Link>
        {!data ? (
          <p role={query.error ? 'alert' : 'status'}>
            {query.loading && !query.error ? (
              <Trans>Loading posting package…</Trans>
            ) : (
              <>
                <Trans>
                  Current posting package access could not be checked.
                </Trans>{' '}
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled}
                  onClick={() => void query.refetch()}
                >
                  <Trans>Check posting package</Trans>
                </StyledDeliveryButton>
              </>
            )}
          </p>
        ) : (
          <>
            <h2>{data.plan.title}</h2>
            <StyledDeliveryRow>
              <StyledDeliveryBadge>
                {labels.status(data.variant.status)}
              </StyledDeliveryBadge>
              <span>{t`Viewing package version ${data.selectedVersion}; current version ${data.variant.currentVersion}`}</span>
            </StyledDeliveryRow>
            <ContentAttemptNotice post={data.variant} />
            {data.selectedVersion !== data.variant.currentVersion && (
              <p role="status">
                <Trans>
                  This is historical posting content. Current stage and
                  responsibilities may differ.
                </Trans>{' '}
                <Link
                  to={contentDestination(params, {
                    contentVersion: null,
                    contentHistoryAfter: null,
                  })}
                >
                  <Trans>Open current package</Trans>
                </Link>
              </p>
            )}
            {data.sourceChanged && (
              <p role="alert">
                <Trans>
                  The account, people or creative source changed. Prepare a
                  fresh package before relying on an earlier posting approval.
                </Trans>
              </p>
            )}
            {data.blockedReason && <p role="status">{data.blockedReason}</p>}
            <ContentPostingPreview body={data.body} />
            {data.selectedVersion === data.variant.currentVersion && (
              <StyledDeliveryRow>
                {data.canEdit && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      open({
                        targetId: postId,
                        mode: 'edit-variant',
                        plan: data.plan,
                        detail: data,
                      })
                    }
                  >
                    <Trans>Revise posting package</Trans>
                  </StyledDeliveryButton>
                )}
                {data.allowedActions.map((action) => (
                  <StyledDeliveryButton
                    key={action}
                    type="button"
                    onClick={() =>
                      open({
                        targetId: postId,
                        mode: action,
                        plan: data.plan,
                        detail: data,
                      })
                    }
                  >
                    {labels.action(action)}
                  </StyledDeliveryButton>
                ))}
              </StyledDeliveryRow>
            )}
            {data.latestPublication && (
              <StyledContentItem>
                <StyledDeliveryStack>
                  <h3>
                    <Trans>Current recorded publication evidence</Trans>
                  </h3>
                  <a
                    href={data.latestPublication.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Trans>Open recorded public post</Trans>
                  </a>
                  <>
                    {data.latestPublication.publishedAt && (
                      <ContentTimestamp
                        value={data.latestPublication.publishedAt}
                        timezone={data.body.timezone}
                      />
                    )}
                  </>
                  <p>
                    <Trans>
                      This is team-recorded evidence of manual publication. The
                      OS has not verified or changed the social post.
                    </Trans>
                  </p>
                </StyledDeliveryStack>
              </StyledContentItem>
            )}
            <h3>
              <Trans>Package and publication history</Trans>
            </h3>
            {data.history.map((event) => (
              <StyledContentItem key={event.id}>
                <StyledDeliveryStack>
                  <strong>
                    {labels.action(event.action)} · {event.actorName}
                  </strong>
                  <ContentTimestamp
                    value={event.createdAt}
                    timezone={data.body.timezone}
                  />
                  {event.version && (
                    <Link
                      to={contentDestination(params, {
                        contentVersion: String(event.version),
                        contentHistoryAfter: null,
                      })}
                    >{t`Inspect posting package ${event.version}`}</Link>
                  )}
                  {event.note && (
                    <StyledContentText>{event.note}</StyledContentText>
                  )}
                  {event.evidenceUrl && (
                    <a
                      href={event.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Trans>Recorded publication link</Trans>
                    </a>
                  )}
                  {event.publishedAt && (
                    <span>
                      <Trans>Actual publication time recorded:</Trans>{' '}
                      <ContentTimestamp
                        value={event.publishedAt}
                        timezone={data.body.timezone}
                      />
                    </span>
                  )}
                  {event.correctsEventId && (
                    <small>
                      <Trans>
                        This corrects earlier evidence and preserves the
                        original record.
                      </Trans>
                    </small>
                  )}
                </StyledDeliveryStack>
              </StyledContentItem>
            ))}
            {data.nextEventId && (
              <Link
                to={contentDestination(params, {
                  contentHistoryAfter: data.nextEventId,
                })}
              >
                <Trans>Older content history</Trans>
              </Link>
            )}
            {params.has('contentHistoryAfter') && (
              <Link
                to={contentDestination(params, { contentHistoryAfter: null })}
              >
                <Trans>Newest content history</Trans>
              </Link>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
