import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { SequenceReplyDetectionService } from 'src/modules/sequences/services/sequence-reply-detection.service';

const WORKSPACE_ID = 'workspace-id';
const PERSON_ID = 'person-id';
const SINCE = new Date('2026-08-20T00:00:00.000Z');

const buildService = ({
  emailReplyCount,
  channelReplyCount,
}: {
  emailReplyCount: number;
  channelReplyCount: number;
}) => {
  const participantQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(emailReplyCount),
  };
  const channelMessageCount = jest.fn().mockResolvedValue(channelReplyCount);

  const globalWorkspaceOrmManager = {
    getRepository: jest.fn((_workspaceId: string, entity: unknown) => {
      if (entity === MessageParticipantWorkspaceEntity) {
        return Promise.resolve({
          createQueryBuilder: () => participantQueryBuilder,
        });
      }

      if (entity === ChannelMessageWorkspaceEntity) {
        return Promise.resolve({ count: channelMessageCount });
      }

      throw new Error('Unexpected entity');
    }),
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
  };

  const service = new SequenceReplyDetectionService(
    globalWorkspaceOrmManager as never,
  );

  return { service, participantQueryBuilder, channelMessageCount };
};

describe('SequenceReplyDetectionService', () => {
  it('should return true when the person replied by email', async () => {
    const { service } = buildService({
      emailReplyCount: 1,
      channelReplyCount: 0,
    });

    await expect(
      service.hasRepliedSince({
        workspaceId: WORKSPACE_ID,
        personId: PERSON_ID,
        since: SINCE,
      }),
    ).resolves.toBe(true);
  });

  it('should return true when the person replied by WhatsApp or SMS', async () => {
    const { service, channelMessageCount } = buildService({
      emailReplyCount: 0,
      channelReplyCount: 2,
    });

    await expect(
      service.hasRepliedSince({
        workspaceId: WORKSPACE_ID,
        personId: PERSON_ID,
        since: SINCE,
      }),
    ).resolves.toBe(true);

    expect(channelMessageCount).toHaveBeenCalledWith({
      where: {
        personId: PERSON_ID,
        direction: 'INBOUND',
        receivedAt: expect.any(Object),
      },
    });
  });

  it('should not query channel messages when an email reply already matched', async () => {
    const { service, channelMessageCount } = buildService({
      emailReplyCount: 1,
      channelReplyCount: 0,
    });

    await service.hasRepliedSince({
      workspaceId: WORKSPACE_ID,
      personId: PERSON_ID,
      since: SINCE,
    });

    expect(channelMessageCount).not.toHaveBeenCalled();
  });

  it('should return false when the person did not reply on any channel', async () => {
    const { service } = buildService({
      emailReplyCount: 0,
      channelReplyCount: 0,
    });

    await expect(
      service.hasRepliedSince({
        workspaceId: WORKSPACE_ID,
        personId: PERSON_ID,
        since: SINCE,
      }),
    ).resolves.toBe(false);
  });
});
