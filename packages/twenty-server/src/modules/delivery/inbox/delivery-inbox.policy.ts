import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  canDraftConversation,
  canReadBusinessRecord,
} from 'src/modules/delivery/business/delivery-business.policy';
import {
  type InboxConversation,
  type InboxNativeMessage,
  type InboxGrant,
} from './delivery-inbox.types';

export const inboxHash = advertisingHash;
export const parseInbox = <TOutput>(
  schema: z.ZodType<TOutput>,
  raw: unknown,
) => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the exact conversation, selected thread, permission and reply request.',
    );
  return parsed.data;
};
type InboxActor = Parameters<typeof canDraftConversation>[1];
export const inboxRights = (
  conversation: InboxConversation,
  actor: InboxActor,
  ownerMemberId: string,
  grants: InboxGrant[],
) => {
  const permitted = grants.filter((grant) =>
    grant.kind === 'MEMBER'
      ? grant.id === actor.memberId
      : actor.roleIds?.includes(grant.id),
  );
  const owner = ownerMemberId === actor.memberId;
  const read =
    canReadBusinessRecord(conversation, actor, new Set()) &&
    (owner || permitted.some((grant) => grant.read));
  const draft =
    read &&
    canDraftConversation(conversation, actor) &&
    (owner || permitted.some((grant) => grant.draft));
  return {
    read,
    draft,
    send: draft && (owner || permitted.some((grant) => grant.send)),
  };
};
export const assertInboxConsentWithinConversation = (
  conversation: InboxConversation,
  grants: InboxGrant[],
) => {
  for (const grant of grants) {
    const allowed =
      grant.kind === 'MEMBER'
        ? conversation.grants.find((item) => item.memberId === grant.id)
        : conversation.roleGrants?.find((item) => item.roleId === grant.id);
    if (
      conversation.private ||
      !allowed?.read ||
      ((grant.draft || grant.send) && !allowed.send)
    )
      throw new ForbiddenException(
        'First grant this person or role the matching conversation access. Gmail consent cannot expand those permissions.',
      );
  }
};
const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    id: z.string().min(1).max(500),
  })
  .strict();
export const inboxCursor = (scope: string, id: string) =>
  Buffer.from(JSON.stringify({ version: 1, scope, id })).toString('base64url');
export const readInboxCursor = (
  value: string | null | undefined,
  scope: string,
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (parsed.scope === scope) return parsed.id;
  } catch {
    /* A cursor must not preserve a previous source or permission scope. */
  }
  throw new BadRequestException(
    'This inbox page changed or belongs to another account or permission scope. Open the first page.',
  );
};
export const inboxEmail = (value: string) => {
  const parsed = z.email().max(254).safeParse(value.trim());
  if (!parsed.success || /[\r\n]/.test(value))
    throw new BadRequestException(
      'This message has no supported reply address. Open the original email.',
    );
  return parsed.data;
};

const messagePositionSchema = z
  .object({
    id: z.uuid(),
    receivedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const readInboxMessagePosition = (value: string | null) => {
  if (!value) return null;
  try {
    return messagePositionSchema.parse(JSON.parse(value));
  } catch {
    throw new BadRequestException(
      'This message page is invalid. Open the newest messages again.',
    );
  }
};
export const inboxMessagePosition = (message: {
  id: string;
  receivedAt: string | null;
}) => JSON.stringify({ id: message.id, receivedAt: message.receivedAt });

export const publicInboxMessage = (message: InboxNativeMessage) => ({
  id: message.id,
  receivedAt: message.receivedAt,
  subject: message.subject,
  text: message.text,
  textTruncated: message.textTruncated,
  participantsTruncated: message.participantsTruncated,
  direction: message.direction,
  participants: message.participants,
});
