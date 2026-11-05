import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ContentChoices } from '@/delivery/content/content.types';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type ContentChoicePage = {
  search: string;
  afterAccountId: string | null;
  afterMemberId: string | null;
  afterEngagementId: string | null;
};
export const EMPTY_CONTENT_CHOICE_PAGE: ContentChoicePage = {
  search: '',
  afterAccountId: null,
  afterMemberId: null,
  afterEngagementId: null,
};
export const ContentChoicePaging = ({
  choices,
  page,
  update,
  enabled,
  accounts = true,
  members = true,
  engagements = true,
}: {
  choices: ContentChoices;
  page: ContentChoicePage;
  update: (page: ContentChoicePage) => void;
  enabled: boolean;
  accounts?: boolean;
  members?: boolean;
  engagements?: boolean;
}) => {
  const { t } = useLingui();
  const [searchDraft, setSearchDraft] = useState(page.search);
  const apply = () =>
    update({ ...EMPTY_CONTENT_CHOICE_PAGE, search: searchDraft.trim() });
  return (
    <details>
      <summary>
        <Trans>Find more accounts or people</Trans>
      </summary>
      <StyledDeliveryStack>
        <p>
          <Trans>
            Choices are paged. Selected items remain available while you search.
          </Trans>
        </p>
        <StyledDeliveryRow>
          <label>
            <Trans>Search available choices</Trans>
            <input
              aria-label={t`Search available choices`}
              maxLength={200}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (enabled) apply();
                }
              }}
            />
          </label>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={apply}
          >
            <Trans>Search choices</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        <StyledDeliveryRow>
          {accounts && choices.nextAccountId && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled}
              onClick={() =>
                update({
                  ...page,
                  afterAccountId: choices.nextAccountId ?? null,
                })
              }
            >
              <Trans>More account choices</Trans>
            </StyledDeliveryButton>
          )}
          {members && choices.nextMemberId && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled}
              onClick={() =>
                update({ ...page, afterMemberId: choices.nextMemberId ?? null })
              }
            >
              <Trans>More people</Trans>
            </StyledDeliveryButton>
          )}
          {engagements && choices.nextEngagementId && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled}
              onClick={() =>
                update({
                  ...page,
                  afterEngagementId: choices.nextEngagementId ?? null,
                })
              }
            >
              <Trans>More client engagements</Trans>
            </StyledDeliveryButton>
          )}
          {(page.search ||
            page.afterAccountId ||
            page.afterMemberId ||
            page.afterEngagementId) && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled}
              onClick={() => {
                setSearchDraft('');
                update(EMPTY_CONTENT_CHOICE_PAGE);
              }}
            >
              <Trans>First choices</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </details>
  );
};
