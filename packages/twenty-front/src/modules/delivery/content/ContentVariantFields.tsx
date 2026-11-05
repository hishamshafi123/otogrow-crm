import { useId } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { IANA_TIME_ZONES } from 'twenty-shared/constants';
import { canonicalCommandJson } from '@/delivery/commands/canonical-command-hash';
import {
  type ContentBody,
  type ContentChoices,
  type ContentSavedBody,
} from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { contentFormatsFor } from '@/delivery/content/content-body';
import { contentPlannedInstant } from '@/delivery/content/content-dates';
import { ContentAssetPicker } from '@/delivery/content/ContentAssetPicker';
import { DeliveryFormRequirements } from '@/delivery/forms/DeliveryFormRequirements';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const postingFields = (body: ContentBody) => ({
  accountId: body.accountId,
  accountRevision: body.accountRevision,
  caption: body.caption.trim(),
  format: body.format,
  plannedLocal: body.plannedLocal,
  timezone: body.timezone,
  asset: body.asset
    ? {
        taskId: body.asset.taskId,
        submissionVersion: body.asset.submissionVersion,
        assetId: body.asset.assetId,
      }
    : null,
});
export const contentReviewerExcludedIds = (
  body: ContentBody,
  original: ContentSavedBody | undefined,
  memberId: string,
) => {
  const changed =
    !original ||
    canonicalCommandJson(postingFields(body)) !==
      canonicalCommandJson(postingFields(original));
  return new Set([
    body.ownerId,
    ...(original?.contributorIds ?? []),
    ...(changed ? [memberId] : []),
  ]);
};
export const contentVariantReady = (
  body: ContentBody,
  choices: ContentChoices,
  original: ContentSavedBody | undefined,
  memberId: string,
) => {
  const account = choices.accounts.find(
    (item) =>
      item.id === body.accountId &&
      !item.archived &&
      item.revision === body.accountRevision,
  );
  const exclusions = contentReviewerExcludedIds(body, original, memberId);
  return Boolean(
    account &&
    choices.members.some((member) => member.id === body.ownerId) &&
    choices.members.some(
      (member) =>
        member.id === body.reviewerId &&
        member.canReview &&
        !exclusions.has(member.id),
    ) &&
    contentFormatsFor(account.platform).includes(body.format) &&
    contentPlannedInstant(body.plannedLocal, body.timezone) &&
    (body.format !== 'TEXT' || body.caption.trim()),
  );
};
export const ContentVariantFields = ({
  value,
  update,
  choices,
  access,
  original,
  enabled,
  onDenied,
}: {
  value: ContentBody;
  update: (body: ContentBody) => void;
  choices: ContentChoices;
  access: ReturnType<typeof useContentAccess>;
  original?: ContentSavedBody;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const prefix = useId();
  const account = choices.accounts.find(
    (item) => item.id === value.accountId && !item.archived,
  );
  const currentAccount = account?.revision === value.accountRevision;
  const exclusions = contentReviewerExcludedIds(
    value,
    original,
    access.permission.access?.memberId ?? '',
  );
  const ownerValid = choices.members.some(
    (member) => member.id === value.ownerId,
  );
  const reviewerValid = choices.members.some(
    (member) =>
      member.id === value.reviewerId &&
      member.canReview &&
      !exclusions.has(member.id),
  );
  const validTime = contentPlannedInstant(value.plannedLocal, value.timezone);
  const requirements = [
    ...(!account || !currentAccount
      ? [
          {
            targetId: `${prefix}-account`,
            message: t`Choose a current active social account.`,
          },
        ]
      : []),
    ...(!ownerValid
      ? [
          {
            targetId: `${prefix}-owner`,
            message: t`Choose a current project member to own this post.`,
          },
        ]
      : []),
    ...(!reviewerValid
      ? [
          {
            targetId: `${prefix}-reviewer`,
            message: t`Choose an eligible reviewer who did not prepare or own this posting package.`,
          },
        ]
      : []),
    ...(!account || !contentFormatsFor(account.platform).includes(value.format)
      ? [
          {
            targetId: `${prefix}-format`,
            message: t`Choose a supported manual post format for this channel.`,
          },
        ]
      : []),
    ...(!validTime
      ? [
          {
            targetId: `${prefix}-planned`,
            message: t`Choose a valid planned time and time zone. Ambiguous or nonexistent daylight-saving times need correction.`,
          },
        ]
      : []),
    ...(value.format === 'TEXT' && !value.caption.trim()
      ? [
          {
            targetId: `${prefix}-caption`,
            message: t`Add the text for this text-only post.`,
          },
        ]
      : []),
  ];
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          Prepare one channel variant. Its creative source and full posting
          package will be checked separately. Saving does not publish or
          schedule it.
        </Trans>
      </p>
      <StyledDeliveryGrid>
        <label>
          <Trans>Social account</Trans>
          <select
            id={`${prefix}-account`}
            required
            value={account && currentAccount ? value.accountId : ''}
            onChange={(event) => {
              const selected = choices.accounts.find(
                (item) => item.id === event.currentTarget.value,
              );
              update({
                ...value,
                accountId: selected?.id ?? '',
                accountRevision: selected?.revision ?? 0,
                format:
                  selected &&
                  contentFormatsFor(selected.platform).includes(value.format)
                    ? value.format
                    : '',
              });
            }}
          >
            <option value="">{t`Choose an active account`}</option>
            {choices.accounts
              .filter((item) => !item.archived)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {labels.platform(item.platform)} · {item.name} ({item.handle})
                </option>
              ))}
          </select>
        </label>
        <label>
          <Trans>Post owner</Trans>
          <select
            id={`${prefix}-owner`}
            required
            value={ownerValid ? value.ownerId : ''}
            onChange={(event) =>
              update({ ...value, ownerId: event.currentTarget.value })
            }
          >
            <option value="">{t`Choose a person`}</option>
            {choices.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>Independent posting reviewer</Trans>
          <select
            id={`${prefix}-reviewer`}
            required
            value={reviewerValid ? value.reviewerId : ''}
            onChange={(event) =>
              update({ ...value, reviewerId: event.currentTarget.value })
            }
          >
            <option value="">{t`Choose an independent reviewer`}</option>
            {choices.members
              .filter(
                (member) => member.canReview && !exclusions.has(member.id),
              )
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <Trans>Post format</Trans>
          <select
            id={`${prefix}-format`}
            required
            value={value.format}
            onChange={(event) =>
              update({
                ...value,
                format: event.currentTarget.value,
                ...(event.currentTarget.value === 'TEXT'
                  ? { asset: null }
                  : {}),
              })
            }
          >
            <option value="">{t`Choose a format`}</option>
            {(account ? contentFormatsFor(account.platform) : []).map(
              (format) => (
                <option key={format} value={format}>
                  {labels.format(format)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <Trans>Planned publication time</Trans>
          <input
            id={`${prefix}-planned`}
            type="datetime-local"
            required
            value={value.plannedLocal}
            onChange={(event) =>
              update({ ...value, plannedLocal: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <Trans>Publication time zone</Trans>
          <input
            required
            list={`${prefix}-zones`}
            value={value.timezone}
            placeholder="Asia/Qatar"
            onChange={(event) =>
              update({ ...value, timezone: event.currentTarget.value })
            }
          />
          <datalist id={`${prefix}-zones`}>
            {IANA_TIME_ZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </label>
      </StyledDeliveryGrid>
      <label>
        <Trans>Caption or post text</Trans>
        <textarea
          id={`${prefix}-caption`}
          required={value.format === 'TEXT'}
          rows={6}
          maxLength={6000}
          value={value.caption}
          onChange={(event) =>
            update({ ...value, caption: event.currentTarget.value })
          }
        />
      </label>
      {value.format !== 'TEXT' && (
        <ContentAssetPicker
          access={access}
          projectId={choices.project.id}
          value={value.asset}
          snapshot={original?.assetSnapshot}
          onSelect={(asset) => update({ ...value, asset })}
          onDenied={onDenied}
          enabled={enabled}
        />
      )}
      <details>
        <summary>
          <Trans>Production notes</Trans>
        </summary>
        <label>
          <Trans>Notes for this variant</Trans>
          <textarea
            rows={3}
            maxLength={6000}
            value={value.notes}
            onChange={(event) =>
              update({ ...value, notes: event.currentTarget.value })
            }
          />
        </label>
      </details>
      <DeliveryFormRequirements requirements={requirements} />
      {!choices.members.some(
        (member) => member.canReview && !exclusions.has(member.id),
      ) && (
        <p role="status">
          <Trans>
            This project needs another eligible posting reviewer. The owner and
            people who prepared this package cannot approve it. Creating the
            parent plan alone does not disqualify its manager.
          </Trans>
        </p>
      )}
    </StyledDeliveryStack>
  );
};
