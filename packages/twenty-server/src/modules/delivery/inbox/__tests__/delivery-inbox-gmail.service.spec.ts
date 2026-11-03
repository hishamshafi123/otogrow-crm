import { type EntityManager } from 'typeorm';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryInboxGmailService } from '../gmail/delivery-inbox-gmail.service';
import { type InboxNativeMessage } from '../delivery-inbox.types';

const workspace = {
  id: '10000000-0000-4000-8000-000000000001',
} as WorkspaceEntity;
const owner = '10000000-0000-4000-8000-000000000002';
const membership = '10000000-0000-4000-8000-000000000003';
const prepare = () => {
  const account: ConnectedAccountEntity = Object.assign(
    new ConnectedAccountEntity(),
    {
      id: '10000000-0000-4000-8000-000000000004',
      workspaceId: workspace.id,
      userWorkspaceId: membership,
      handle: 'founder@example.invalid',
      handleAliases: [],
      visibility: 'user' as const,
      provider: ConnectedAccountProvider.GOOGLE,
      archivedAt: null,
      authFailedAt: null,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
    },
  );
  const actor = jest.fn(async () => ({
    memberId: owner,
    isAdmin: true,
    isManager: true,
    roleIds: [],
    capabilities: [],
  }));
  const permission = jest.fn(async () => true);
  const manager = {
    getRepository: () => ({ findOneBy: async () => account }),
  } as unknown as EntityManager;
  const service = new DeliveryInboxGmailService(
    { actor } as unknown as DeliveryService,
    {
      userHasWorkspaceSettingPermission: permission,
    } as unknown as PermissionsService,
  );
  return { service, account, actor, manager, permission };
};

describe('native Gmail authority and exact reply identity', () => {
  it('requires the actual active account owner even when native account visibility is workspace-wide', async () => {
    const fixture = prepare();
    fixture.account.visibility = 'workspace';
    await expect(
      fixture.service.account(
        fixture.manager,
        workspace,
        owner,
        '10000000-0000-4000-8000-000000000099',
        fixture.account.id,
      ),
    ).rejects.toThrow(/original Gmail owner/);
    expect(
      (
        await fixture.service.account(
          fixture.manager,
          workspace,
          owner,
          membership,
          fixture.account.id,
        )
      ).account.id,
    ).toBe(fixture.account.id);
    fixture.actor.mockRejectedValueOnce(new Error('Membership disabled'));
    await expect(
      fixture.service.account(
        fixture.manager,
        workspace,
        owner,
        membership,
        fixture.account.id,
      ),
    ).rejects.toThrow(/disabled/);
    fixture.account.archivedAt = new Date();
    await expect(
      fixture.service.account(
        fixture.manager,
        workspace,
        owner,
        membership,
        fixture.account.id,
      ),
    ).rejects.toThrow(/unavailable|original/);
  });
  it('requires current native sender permission and a genuine Gmail send scope', async () => {
    const fixture = prepare();
    expect(
      await fixture.service.sendingAllowed(
        workspace.id,
        membership,
        fixture.account,
      ),
    ).toBe(true);
    fixture.permission.mockResolvedValueOnce(false);
    expect(
      await fixture.service.sendingAllowed(
        workspace.id,
        membership,
        fixture.account,
      ),
    ).toBe(false);
    fixture.account.scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    expect(
      await fixture.service.sendingAllowed(
        workspace.id,
        membership,
        fixture.account,
      ),
    ).toBe(false);
    fixture.account.scopes = ['https://www.googleapis.com/auth/gmail.send'];
    fixture.account.authFailedAt = new Date();
    expect(
      await fixture.service.sendingAllowed(
        workspace.id,
        membership,
        fixture.account,
      ),
    ).toBe(false);
  });
  it('derives one exact sender instead of accepting arbitrary recipients or replying to the owner alias', () => {
    const fixture = prepare();
    const message: InboxNativeMessage = {
      id: owner,
      receivedAt: null,
      subject: 'Question',
      text: 'Text',
      textTruncated: false,
      participantsTruncated: false,
      headerMessageId: '<client-message@example.invalid>',
      externalId: 'gmail-message',
      direction: 'INCOMING',
      participants: [
        {
          role: 'from',
          handle: 'client@example.invalid',
          displayName: 'Client',
        },
      ],
    };
    expect(fixture.service.replyRecipient(message, fixture.account)).toBe(
      'client@example.invalid',
    );
    expect(() =>
      fixture.service.replyRecipient(
        { ...message, headerMessageId: '<bad>\r\nBcc:other@example.invalid' },
        fixture.account,
      ),
    ).toThrow();
    expect(() =>
      fixture.service.replyRecipient(
        {
          ...message,
          participants: [
            ...message.participants,
            {
              role: 'from',
              handle: 'second@example.invalid',
              displayName: null,
            },
          ],
        },
        fixture.account,
      ),
    ).toThrow();
    expect(() =>
      fixture.service.replyRecipient(
        { ...message, direction: 'OUTGOING' },
        fixture.account,
      ),
    ).toThrow();
    expect(() =>
      fixture.service.replyRecipient(
        { ...message, participantsTruncated: true },
        fixture.account,
      ),
    ).toThrow();
    fixture.account.handleAliases = ['client@example.invalid'];
    expect(() =>
      fixture.service.replyRecipient(message, fixture.account),
    ).toThrow();
  });
});
