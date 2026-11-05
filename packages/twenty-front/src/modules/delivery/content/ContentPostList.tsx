import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { ContentAttemptNotice } from '@/delivery/content/ContentAttemptNotice';
import { type ContentSummary } from '@/delivery/content/content.types';
import {
  contentDestination,
  CONTENT_CLOSE_COMMAND,
} from '@/delivery/content/content-navigation';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  StyledContentAgenda,
  StyledContentItem,
  StyledContentTable,
} from '@/delivery/content/contentStyles';
import {
  StyledDeliveryBadge,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ContentPostListProps = {
  items: ContentSummary[];
  totalCount: number;
  nextId: string | null;
};
export const ContentPostList = ({
  items,
  totalCount,
  nextId,
}: ContentPostListProps) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const [params] = useSearchParams();
  const destination = (post: ContentSummary) =>
    contentDestination(params, {
      ...CONTENT_CLOSE_COMMAND,
      contentPostId: post.id,
      contentPlanId: post.planId,
      contentVersion: null,
      contentHistoryAfter: null,
    });
  const nextAction = (post: ContentSummary) =>
    ['RECORD_UNCERTAIN', 'RECORD_FAILED'].includes(post.lastAttemptAction ?? '')
      ? t`Check social account and evidence`
      : post.status === 'REVIEW'
        ? t`Review posting package`
        : post.status === 'APPROVED'
          ? t`Record manual posting`
          : post.status === 'PUBLISHED'
            ? t`View publication evidence`
            : t`Open posting package`;
  const date = (post: ContentSummary) =>
    `${post.plannedLocal.replace('T', ' ')} · ${post.timezone}`;
  return (
    <StyledDeliveryStack>
      <p>{t`Showing ${items.length} of ${totalCount} matching post variants`}</p>
      <StyledContentTable>
        <caption>
          <Trans>Content posting queue</Trans>
        </caption>
        <thead>
          <tr>
            <th>
              <Trans>Planned publication</Trans>
            </th>
            <th>
              <Trans>Plan and channel</Trans>
            </th>
            <th>
              <Trans>Responsible people</Trans>
            </th>
            <th>
              <Trans>Posting stage</Trans>
            </th>
            <th>
              <Trans>Next step</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((post) => (
            <tr key={post.id}>
              <td>{date(post)}</td>
              <td>
                <strong>{post.planTitle}</strong>
                <p>
                  {labels.platform(post.platform)} · {post.accountName}
                </p>
              </td>
              <td>
                {post.ownerName}
                <p>{t`Review: ${post.reviewerName}`}</p>
              </td>
              <td>
                {labels.status(post.status)}
                <ContentAttemptNotice post={post} />
              </td>
              <td>
                <Link to={destination(post)}>{nextAction(post)}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </StyledContentTable>
      <StyledContentAgenda role="group" aria-label={t`Content posting queue`}>
        {items.map((post) => (
          <StyledContentItem key={post.id}>
            <StyledDeliveryStack>
              <strong>{post.planTitle}</strong>
              <span>
                {labels.platform(post.platform)} · {post.accountName}
              </span>
              <span>{date(post)}</span>
              <span>
                {post.ownerName} · {t`Review: ${post.reviewerName}`}
              </span>
              <StyledDeliveryBadge>
                {labels.status(post.status)}
              </StyledDeliveryBadge>
              <ContentAttemptNotice post={post} />
              <Link to={destination(post)}>{nextAction(post)}</Link>
            </StyledDeliveryStack>
          </StyledContentItem>
        ))}
      </StyledContentAgenda>
      {!items.length && (
        <p>
          <Trans>
            No post variants match these filters. Choose a plan to prepare a
            post.
          </Trans>
        </p>
      )}
      {nextId && (
        <Link to={contentDestination(params, { contentAfter: nextId })}>
          <Trans>Next posts</Trans>
        </Link>
      )}
      {params.has('contentAfter') && (
        <Link to={contentDestination(params, { contentAfter: null })}>
          <Trans>First posts</Trans>
        </Link>
      )}
    </StyledDeliveryStack>
  );
};
