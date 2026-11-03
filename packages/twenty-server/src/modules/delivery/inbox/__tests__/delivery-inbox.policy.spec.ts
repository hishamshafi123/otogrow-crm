import {
  assertInboxConsentWithinConversation,
  inboxCursor,
  inboxHash,
  inboxMessagePosition,
  inboxRights,
  parseInbox,
  readInboxCursor,
  readInboxMessagePosition,
} from '../delivery-inbox.policy';
import {
  inboxPrepareSchema,
  inboxThreadsSchema,
  type InboxConversation,
  type InboxGrant,
} from '../delivery-inbox.types';

const owner = '10000000-0000-4000-8000-000000000001';
const staff = '10000000-0000-4000-8000-000000000002';
const role = '10000000-0000-4000-8000-000000000003';
const conversation: InboxConversation = {
  id: '10000000-0000-4000-8000-000000000004',
  revision: 1,
  kind: 'CONVERSATION',
  projectId: '10000000-0000-4000-8000-000000000005',
  title: 'Client email',
  channel: 'EMAIL',
  sourceUrl: null,
  ownerId: owner,
  private: false,
  grants: [{ memberId: staff, read: true, send: true }],
  roleGrants: [{ roleId: role, read: true, send: true }],
  createdBy: owner,
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
  status: 'DRAFT',
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
};
const actor = {
  memberId: staff,
  isAdmin: false,
  isManager: false,
  roleIds: [] as string[],
  capabilities: [],
};
const grant: InboxGrant = {
  kind: 'MEMBER',
  id: staff,
  read: true,
  draft: true,
  send: false,
};

describe('owner-consented Gmail permissions', () => {
  it('does not turn a legacy reply grant into Gmail access without exact owner consent', () => {
    expect(inboxRights(conversation, actor, owner, [])).toEqual({
      read: false,
      draft: false,
      send: false,
    });
    expect(
      inboxRights(conversation, { ...actor, isAdmin: true }, owner, []),
    ).toEqual({ read: false, draft: false, send: false });
  });
  it('separates explicit read, draft and send while letting the original owner act', () => {
    expect(inboxRights(conversation, actor, owner, [grant])).toEqual({
      read: true,
      draft: true,
      send: false,
    });
    expect(
      inboxRights(conversation, actor, owner, [{ ...grant, draft: false }]),
    ).toEqual({ read: true, draft: false, send: false });
    expect(
      inboxRights(conversation, actor, owner, [{ ...grant, send: true }]),
    ).toEqual({ read: true, draft: true, send: true });
    expect(
      inboxRights(conversation, { ...actor, memberId: owner }, owner, []),
    ).toEqual({ read: true, draft: true, send: true });
  });
  it('revokes immediately when current conversation grants or private mode narrow', () => {
    expect(
      inboxRights(
        { ...conversation, grants: [], roleGrants: [] },
        actor,
        owner,
        [{ ...grant, send: true }],
      ).read,
    ).toBe(false);
    expect(
      inboxRights(
        {
          ...conversation,
          grants: [{ memberId: staff, read: true, send: false }],
        },
        actor,
        owner,
        [{ ...grant, send: true }],
      ),
    ).toEqual({ read: true, draft: false, send: false });
    expect(
      inboxRights({ ...conversation, private: true }, actor, owner, [
        { ...grant, send: true },
      ]).read,
    ).toBe(false);
  });
  it('resolves dynamic role membership freshly without treating project membership as consent', () => {
    const roleGrant: InboxGrant = {
      ...grant,
      kind: 'ROLE',
      id: role,
      send: true,
    };
    expect(
      inboxRights(conversation, { ...actor, roleIds: [role] }, owner, [
        roleGrant,
      ]).send,
    ).toBe(true);
    expect(inboxRights(conversation, actor, owner, [roleGrant]).read).toBe(
      false,
    );
  });
  it('rejects consent broader than current conversation grants, including founder-private threads', () => {
    expect(() =>
      assertInboxConsentWithinConversation(conversation, [grant]),
    ).not.toThrow();
    expect(() =>
      assertInboxConsentWithinConversation({ ...conversation, private: true }, [
        grant,
      ]),
    ).toThrow();
    expect(() =>
      assertInboxConsentWithinConversation(
        {
          ...conversation,
          grants: [{ memberId: staff, read: true, send: false }],
        },
        [grant],
      ),
    ).toThrow();
    expect(() =>
      assertInboxConsentWithinConversation(conversation, [
        { ...grant, id: '10000000-0000-4000-8000-000000000099' },
      ]),
    ).toThrow();
  });
  it('binds pages to the exact current account, source and authorization identity', () => {
    const scope = inboxHash({ owner, staff, revision: 1 });
    const cursor = inboxCursor(scope, conversation.id);
    expect(readInboxCursor(cursor, scope)).toBe(conversation.id);
    expect(() =>
      readInboxCursor(cursor, inboxHash({ owner, staff, revision: 2 })),
    ).toThrow(/changed/);
    expect(() => readInboxCursor('not-a-cursor', scope)).toThrow(/changed/);
  });
  it('preserves exact microsecond message positions and unknown dates without millisecond rounding', () => {
    const position = { id: staff, receivedAt: '2026-11-03T06:00:00.123456Z' };
    expect(readInboxMessagePosition(inboxMessagePosition(position))).toEqual(
      position,
    );
    expect(
      readInboxMessagePosition(
        inboxMessagePosition({ id: staff, receivedAt: null }),
      ),
    ).toEqual({ id: staff, receivedAt: null });
    expect(() =>
      readInboxMessagePosition(
        JSON.stringify({ id: staff, receivedAt: 'not-a-date' }),
      ),
    ).toThrow(/invalid/);
  });
  it('requires an exact paired channel and thread for an off-page owner selection', () => {
    expect(
      parseInbox(inboxThreadsSchema, {
        accountId: owner,
        selectedChannelId: staff,
        selectedThreadExternalId: 'provider-thread',
      }).selectedThreadExternalId,
    ).toBe('provider-thread');
    expect(() =>
      parseInbox(inboxThreadsSchema, {
        accountId: owner,
        selectedChannelId: staff,
      }),
    ).toThrow();
    expect(() =>
      parseInbox(inboxThreadsSchema, {
        accountId: owner,
        selectedThreadExternalId: 'provider-thread',
      }),
    ).toThrow();
  });
  it('does not accept an ambiguous AI/manual body or arbitrary recipient in preparation', () => {
    const manual = {
      id: owner,
      requestId: staff,
      conversationId: conversation.id,
      bindingRevision: 1,
      sourceFingerprint: 'a'.repeat(64),
      replyToMessageId: role,
      text: 'Reviewed reply',
      sourceIds: [],
    };
    expect(parseInbox(inboxPrepareSchema, manual).text).toBe('Reviewed reply');
    expect(() =>
      parseInbox(inboxPrepareSchema, {
        ...manual,
        to: 'other@example.invalid',
      }),
    ).toThrow();
    expect(() =>
      parseInbox(inboxPrepareSchema, {
        ...manual,
        agentId: owner,
        sourceIds: [role],
      }),
    ).toThrow();
    expect(() =>
      parseInbox(inboxPrepareSchema, {
        ...manual,
        text: '',
        agentId: owner,
        sourceIds: [role],
      }),
    ).toThrow();
    expect(
      parseInbox(inboxPrepareSchema, {
        ...manual,
        text: '',
        agentId: owner,
        sourceIds: [role],
        previewFingerprint: 'b'.repeat(64),
        agentVersion: 2,
        pricingRevision: 1,
      }).agentId,
    ).toBe(owner);
  });
});
