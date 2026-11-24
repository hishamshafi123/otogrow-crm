import { SetterProfileService } from 'src/modules/lead-assignment/services/setter-profile.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

const buildService = () => {
  const setterProfileRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (entity) => entity),
    update: jest.fn(),
  };

  const workspaceMemberRepository = {
    findOne: jest.fn(),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation(async (callback: () => Promise<unknown>) =>
        callback(),
      ),
    getRepository: jest.fn().mockResolvedValue(workspaceMemberRepository),
  };

  const service = new SetterProfileService(
    setterProfileRepository as never,
    globalWorkspaceOrmManager as never,
  );

  return {
    service,
    setterProfileRepository,
    workspaceMemberRepository,
    globalWorkspaceOrmManager,
  };
};

describe('SetterProfileService.setTelegramChatId', () => {
  it('updates telegramChatId on an existing setter profile', async () => {
    const { service, setterProfileRepository, globalWorkspaceOrmManager } =
      buildService();

    setterProfileRepository.findOne.mockResolvedValue({
      id: 'profile-1',
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: MEMBER_ID,
      isSetter: true,
    });

    const result = await service.setTelegramChatId(
      WORKSPACE_ID,
      MEMBER_ID,
      '12345',
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'profile-1',
        telegramChatId: '12345',
      }),
    );
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('creates a default setter profile when linking an unsaved workspace member', async () => {
    const { service, setterProfileRepository, workspaceMemberRepository } =
      buildService();

    setterProfileRepository.findOne.mockResolvedValue(null);
    workspaceMemberRepository.findOne.mockResolvedValue({ id: MEMBER_ID });

    const result = await service.setTelegramChatId(
      WORKSPACE_ID,
      MEMBER_ID,
      '98765',
    );

    expect(result).toEqual({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: MEMBER_ID,
      isSetter: false,
      activeDays: '1,2,3,4,5',
      activeStartHour: 9,
      activeEndHour: 18,
      dailyLeadCap: null,
      telegramChatId: '98765',
    });
  });

  it('returns null when the workspace member does not exist', async () => {
    const { service, setterProfileRepository, workspaceMemberRepository } =
      buildService();

    setterProfileRepository.findOne.mockResolvedValue(null);
    workspaceMemberRepository.findOne.mockResolvedValue(null);

    const result = await service.setTelegramChatId(
      WORKSPACE_ID,
      MEMBER_ID,
      '98765',
    );

    expect(result).toBeNull();
    expect(setterProfileRepository.save).not.toHaveBeenCalled();
  });

  it('returns null without querying when workspaceMemberId is not a valid UUID', async () => {
    const { service, setterProfileRepository } = buildService();

    const result = await service.setTelegramChatId(
      WORKSPACE_ID,
      'not-a-uuid',
      '98765',
    );

    expect(result).toBeNull();
    expect(setterProfileRepository.findOne).not.toHaveBeenCalled();
  });
});
