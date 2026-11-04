import { BadRequestException } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  competitorMoneySchema,
  competitorXPageInputSchema,
  type CompetitorDataTariff,
  type CompetitorObservation,
  type CompetitorXPageInput,
} from './delivery-competitor.types';

export const competitorContentFingerprint = (
  observation: CompetitorObservation,
) =>
  advertisingHash({
    platform: observation.platform,
    accountId: observation.accountId,
    externalId: observation.externalId,
    versionExternalId: observation.versionExternalId,
    permalink: observation.permalink,
    publishedAt: observation.publishedAt,
    text: observation.text,
  });

export const competitorXPageUrl = (raw: CompetitorXPageInput) => {
  const input = competitorXPageInputSchema.parse(raw);
  if (
    input.sinceId &&
    input.untilId &&
    BigInt(input.sinceId) >= BigInt(input.untilId)
  )
    throw new BadRequestException('The collection window is invalid.');
  const url = new URL(`https://api.x.com/2/users/${input.accountId}/tweets`);
  url.searchParams.set('max_results', String(input.limit));
  url.searchParams.set('post.fields', 'id,text,created_at');
  url.searchParams.set('exclude', 'retweets,replies');
  if (input.sinceId) url.searchParams.set('since_id', input.sinceId);
  if (input.untilId) url.searchParams.set('until_id', input.untilId);
  if (input.nextToken)
    url.searchParams.set('pagination_token', input.nextToken);
  return url;
};

export const competitorXReadBound = (
  maximumPosts: number,
  accountLookup: boolean,
  tariff: CompetitorDataTariff | null,
): string | null => {
  if (
    !Number.isSafeInteger(maximumPosts) ||
    maximumPosts < 5 ||
    maximumPosts > 100
  )
    throw new BadRequestException('Choose between 5 and 100 posts per page.');
  if (!isDefined(tariff)) return null;
  const posts = competitorMoneySchema.parse(tariff.postReadMicros);
  const users = competitorMoneySchema.parse(tariff.userReadMicros);
  return competitorMoneySchema.parse(
    (
      BigInt(maximumPosts) * BigInt(posts) +
      (accountLookup ? BigInt(users) : BigInt(0))
    ).toString(),
  );
};

export const competitorReadFunding = (
  requiredMicros: string | null,
  availableMicros: string,
): 'UNKNOWN_TARIFF' | 'NEEDS_ALLOWANCE' | 'WITHIN_ALLOWANCE' => {
  const available = BigInt(competitorMoneySchema.parse(availableMicros));
  if (!isDefined(requiredMicros)) return 'UNKNOWN_TARIFF';
  const required = BigInt(competitorMoneySchema.parse(requiredMicros));
  if (available === BigInt(0)) return 'NEEDS_ALLOWANCE';
  return required <= available ? 'WITHIN_ALLOWANCE' : 'NEEDS_ALLOWANCE';
};
