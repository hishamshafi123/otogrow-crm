import { ForbiddenException } from '@nestjs/common';

import { CallAccessService } from 'src/modules/calling/services/call-access.service';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

const WORKSPACE_ID = 'workspace-id';
const USER_ID = 'user-id';
const MEMBER_ID = 'member-id';
const USER_WORKSPACE_ID = 'user-workspace-id';
const CREATED_AT = new Date('2026-10-25T00:00:00Z');

describe('current signed caller identity', () => {
  const access = { requireCapability: jest.fn() };
  const membershipRepository = { findOne: jest.fn() };
  const memberRepository = { findOne: jest.fn() };
  const dataSource = { getRepository: jest.fn(() => membershipRepository) };
  const workspaceOrm = {
    executeInWorkspaceContext: jest.fn((operation: () => Promise<unknown>) =>
      operation(),
    ),
    getRepository: jest.fn(() => Promise.resolve(memberRepository)),
  };
  const membership = () => ({
    id: USER_WORKSPACE_ID,
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    user: {
      id: USER_ID,
      disabled: false,
      deletedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    workspace: {
      id: WORKSPACE_ID,
      deletedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  });
  const service = () =>
    new CallAccessService(
      access as never,
      dataSource as never,
      workspaceOrm as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    access.requireCapability.mockReset().mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      memberId: MEMBER_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      capabilities: ['phone.use'],
    });
    membershipRepository.findOne.mockReset().mockResolvedValue(membership());
    memberRepository.findOne
      .mockReset()
      .mockResolvedValue({ id: MEMBER_ID, userId: USER_ID });
  });

  it('resolves an eligible callback identity to native user scope rather than system scope', async () => {
    const context = await service().requireMemberContext(
      WORKSPACE_ID,
      MEMBER_ID,
    );

    expect(access.requireCapability).toHaveBeenCalledWith(
      WORKSPACE_ID,
      MEMBER_ID,
      'phone.use',
    );
    expect(membershipRepository.findOne).toHaveBeenCalledWith({
      where: { id: USER_WORKSPACE_ID, workspaceId: WORKSPACE_ID },
      relations: { user: true, workspace: true },
    });
    expect(workspaceOrm.getRepository).toHaveBeenCalledWith(
      WORKSPACE_ID,
      WorkspaceMemberWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );
    expect(memberRepository.findOne).toHaveBeenCalledWith({
      where: { id: MEMBER_ID, userId: USER_ID },
    });
    expect(context).toEqual(
      expect.objectContaining({
        type: 'user',
        userWorkspaceId: USER_WORKSPACE_ID,
        workspaceMemberId: MEMBER_ID,
        user: expect.objectContaining({ id: USER_ID }),
        workspace: expect.objectContaining({ id: WORKSPACE_ID }),
      }),
    );
  });

  it('rejects revoked access before loading any identity data', async () => {
    access.requireCapability.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      service().requireMemberContext(WORKSPACE_ID, MEMBER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.getRepository).not.toHaveBeenCalled();
    expect(workspaceOrm.getRepository).not.toHaveBeenCalled();
  });

  it.each(['missing', 'disabled-user', 'deleted-user', 'deleted-workspace'])(
    'fails closed if identity becomes %s between capability check and context resolution',
    async (state) => {
      const current = membership();
      const invalid =
        state === 'missing'
          ? null
          : {
              ...current,
              user: {
                ...current.user,
                disabled: state === 'disabled-user',
                deletedAt: state === 'deleted-user' ? CREATED_AT : null,
              },
              workspace: {
                ...current.workspace,
                deletedAt: state === 'deleted-workspace' ? CREATED_AT : null,
              },
            };
      membershipRepository.findOne.mockResolvedValueOnce(invalid);

      await expect(
        service().requireMemberContext(WORKSPACE_ID, MEMBER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(workspaceOrm.getRepository).not.toHaveBeenCalled();
    },
  );

  it('rejects a member that no longer matches the current user membership', async () => {
    memberRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service().requireMemberContext(WORKSPACE_ID, MEMBER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
