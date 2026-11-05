import { type ContentChoices } from '@/delivery/content/content.types';

export const mergeContentChoices = (
  choices: ContentChoices,
): ContentChoices => ({
  ...choices,
  accounts: [
    ...new Map(
      [...choices.accounts, ...choices.selectedAccounts].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ],
  members: [
    ...new Map(
      [...choices.members, ...choices.selectedMembers].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ],
  engagements: [
    ...new Map(
      [...choices.engagements, ...choices.selectedEngagements].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ],
});
