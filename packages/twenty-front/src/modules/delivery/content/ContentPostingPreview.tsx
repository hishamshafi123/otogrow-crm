import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { type ContentSavedBody } from '@/delivery/content/content.types';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  StyledContentFacts,
  StyledContentText,
} from '@/delivery/content/contentStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const ContentPostingPreview = ({ body }: { body: ContentSavedBody }) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Exact posting package</Trans>
      </h3>
      <StyledContentFacts>
        <div>
          <dt>
            <Trans>Channel and account</Trans>
          </dt>
          <dd>
            {labels.platform(body.account.platform)} · {body.account.name} (
            {body.account.handle})
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Planned publication</Trans>
          </dt>
          <dd>
            {body.plannedLocal.replace('T', ' ')} · {body.timezone}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Post owner</Trans>
          </dt>
          <dd>{body.ownerName}</dd>
        </div>
        <div>
          <dt>
            <Trans>Independent posting reviewer</Trans>
          </dt>
          <dd>{body.reviewerName}</dd>
        </div>
        <div>
          <dt>
            <Trans>Format</Trans>
          </dt>
          <dd>{labels.format(body.format)}</dd>
        </div>
      </StyledContentFacts>
      <a href={body.account.profileUrl} target="_blank" rel="noreferrer">
        <Trans>Open social account</Trans>
      </a>
      <h4>
        <Trans>Caption</Trans>
      </h4>
      <StyledContentText>
        {body.caption || t`No caption provided`}
      </StyledContentText>
      {body.assetSnapshot ? (
        <StyledDeliveryStack>
          <h4>
            <Trans>Approved creative source</Trans>
          </h4>
          <span>
            {body.assetSnapshot.title} · {body.assetSnapshot.name}
          </span>
          <small>{t`Creative version ${body.assetSnapshot.creativeVersion}; approved submission ${body.assetSnapshot.submissionVersion}`}</small>
          <Link
            to={`/delivery?view=creative&task=${body.assetSnapshot.taskId}&creativeStage=final&creativeSubmission=${body.assetSnapshot.submissionVersion}`}
            target="_blank"
            rel="noreferrer"
          >
            <Trans>Inspect exact approved creative in a new tab</Trans>
          </Link>
          <p>
            <Trans>
              Creative approval applies to this asset. Posting review separately
              approves the caption, account, format and planned time above.
            </Trans>
          </p>
        </StyledDeliveryStack>
      ) : (
        <p>
          {body.format === 'TEXT'
            ? t`This is a text-only post, with no creative asset approval claimed.`
            : t`This media draft has no selected creative. Add an exact approved asset before submitting it for posting review.`}
        </p>
      )}
      {body.notes && (
        <details>
          <summary>
            <Trans>Production notes</Trans>
          </summary>
          <StyledContentText>{body.notes}</StyledContentText>
        </details>
      )}
    </StyledDeliveryStack>
  );
};
