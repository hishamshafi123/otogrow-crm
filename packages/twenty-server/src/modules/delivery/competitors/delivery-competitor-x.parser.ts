import { z } from 'zod';
import {
  competitorXPageInputSchema,
  type CompetitorPage,
  type CompetitorXPageInput,
} from './delivery-competitor.types';

const providerId = z.string().regex(/^\d{1,19}$/);
const postSchema = z.object({
  id: providerId,
  text: z.string().max(30000),
  created_at: z.iso.datetime({ offset: true }),
  author_id: providerId.optional(),
  edit_history_post_ids: z.array(providerId).min(1).max(100).optional(),
});
const pageSchema = z.object({
  data: z.array(postSchema).max(100).optional(),
  meta: z.object({
    result_count: z.number().int().min(0).max(100),
    next_token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/)
      .optional(),
  }),
  errors: z.array(z.unknown()).max(100).optional(),
});
export const parseCompetitorXPage = (
  raw: unknown,
  request: CompetitorXPageInput,
  capturedAt: string,
): CompetitorPage => {
  const input = competitorXPageInputSchema.parse(request);
  const timestamp = z.iso.datetime({ offset: true }).parse(capturedAt);
  const page = pageSchema.parse(raw);
  const posts = page.data ?? [];
  if (posts.length !== page.meta.result_count || posts.length > input.limit)
    throw new Error(
      'The provider page does not match its declared result count.',
    );
  if (new Set(posts.map((post) => post.id)).size !== posts.length)
    throw new Error('The provider page contains duplicate post identities.');
  for (const post of posts) {
    if (post.author_id && post.author_id !== input.accountId)
      throw new Error('The provider returned another account’s post.');
    if (
      post.edit_history_post_ids &&
      (!post.edit_history_post_ids.includes(post.id) ||
        new Set(post.edit_history_post_ids).size !==
          post.edit_history_post_ids.length)
    )
      throw new Error('The provider returned an ambiguous edit history.');
    if (
      (input.sinceId && BigInt(post.id) <= BigInt(input.sinceId)) ||
      (input.untilId && BigInt(post.id) >= BigInt(input.untilId))
    )
      throw new Error(
        'The provider returned a post outside the collection window.',
      );
    if (Date.parse(post.created_at) > Date.parse(timestamp) + 300000)
      throw new Error(
        'The provider returned an unsupported future publication date.',
      );
  }
  return {
    observations: posts.map((post) => ({
      platform: 'X',
      accountId: input.accountId,
      externalId: [...(post.edit_history_post_ids ?? [post.id])].sort(
        (left, right) =>
          BigInt(left) < BigInt(right)
            ? -1
            : BigInt(left) > BigInt(right)
              ? 1
              : 0,
      )[0],
      versionExternalId: post.id,
      permalink: `https://x.com/i/web/status/${post.id}`,
      publishedAt: new Date(post.created_at).toISOString(),
      capturedAt: new Date(timestamp).toISOString(),
      text: post.text,
    })),
    nextToken: page.meta.next_token ?? null,
    coverage: page.errors?.length ? 'PARTIAL_PAGE' : 'COMPLETE_PAGE',
  };
};
