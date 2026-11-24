import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type DataSource, type Repository } from 'typeorm';

import { compareHash } from 'src/engine/core-modules/auth/auth.util';
import { type WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { type OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { type UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { OtogrowEmployeeLoginService } from 'src/modules/otogrow-access/otogrow-employee-login.service';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn().mockResolvedValue(undefined),
}));

import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_USER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const CREATED_USER_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_MEMBER_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_USER_WORKSPACE_ID = '66666666-6666-4666-8666-666666666666';
const ROLE_ID = '77777777-7777-4777-8777-777777777777';

describe('OtogrowEmployeeLoginService', () => {
  const activeWorkspace = {
    id: WORKSPACE_ID,
    activationStatus: WorkspaceActivationStatus.ACTIVE,
    databaseSchema: 'workspace_test',
    isPasswordAuthEnabled: true,
    subdomain: 'acme',
  } as WorkspaceEntity;

  const makeHarness = () => {
    const query = jest.fn();
    const dataSource = {
      manager: { query },
    } as unknown as DataSource;

    const getOne = jest.fn().mockResolvedValue(null);
    const userQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne,
    };

    const userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(userQueryBuilder),
      create: jest.fn((value) => ({ id: CREATED_USER_ID, ...value })),
      save: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<UserEntity>;

    const workspaceRepository = {
      findOneBy: jest.fn().mockResolvedValue(activeWorkspace),
    } as unknown as Repository<WorkspaceEntity>;

    const userWorkspaceService = {
      checkUserWorkspaceExists: jest.fn().mockResolvedValue(null),
      addUserToWorkspaceIfUserNotInWorkspace: jest
        .fn()
        .mockResolvedValue(undefined),
      countUserWorkspaces: jest.fn().mockResolvedValue(1),
    } as unknown as UserWorkspaceService;

    const onboardingService = {
      setOnboardingCreateProfilePending: jest.fn().mockResolvedValue(undefined),
    } as unknown as OnboardingService;

    const workspaceDomainsService = {
      buildWorkspaceURL: jest
        .fn()
        .mockReturnValue(new URL('https://acme.example.com/welcome')),
    } as unknown as WorkspaceDomainsService;

    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionsService;

    const otogrowAccessService = {
      accessForUser: jest.fn().mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        memberId: ACTOR_MEMBER_ID,
        userWorkspaceId: ACTOR_USER_WORKSPACE_ID,
        roleIds: [],
        nativeAdministrator: true,
        capabilities: ['workspace.admin'],
        grants: [],
      }),
      directory: jest.fn().mockResolvedValue({
        actor: { memberId: ACTOR_MEMBER_ID },
        roles: [
          {
            id: ROLE_ID,
            name: 'Project Manager',
            description: 'Plans projects',
            capabilities: ['delivery.manage'],
            revision: 2,
          },
        ],
        members: [
          {
            memberId: CREATED_MEMBER_ID,
            name: 'Sarah Chen',
            roleIds: [],
            revision: 0,
          },
        ],
      }),
      assignRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as OtogrowAccessService;

    const service = new OtogrowEmployeeLoginService(
      dataSource,
      userRepository,
      workspaceRepository,
      userWorkspaceService,
      onboardingService,
      workspaceDomainsService,
      permissionsService,
      otogrowAccessService,
    );

    return {
      service,
      query,
      getOne,
      userRepository,
      workspaceRepository,
      userWorkspaceService,
      onboardingService,
      permissionsService,
      otogrowAccessService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a verified employee login, clears profile onboarding, assigns roles, and returns sign-in URL', async () => {
    const harness = makeHarness();
    harness.query.mockResolvedValue([
      {
        memberId: CREATED_MEMBER_ID,
        userId: CREATED_USER_ID,
        userWorkspaceId: TARGET_USER_WORKSPACE_ID,
        firstName: 'Sarah',
        lastName: 'Chen',
      },
    ]);

    const result = await harness.service.createEmployeeLogin(
      WORKSPACE_ID,
      ACTOR_MEMBER_ID,
      ACTOR_USER_WORKSPACE_ID,
      {
        firstName: ' Sarah ',
        lastName: ' Chen ',
        email: 'Sarah@Acme.com',
        password: 'Strong#Password9',
        otogrowRoleIds: [ROLE_ID],
      },
    );

    expect(result).toEqual({
      userId: CREATED_USER_ID,
      workspaceMemberId: CREATED_MEMBER_ID,
      email: 'sarah@acme.com',
      firstName: 'Sarah',
      lastName: 'Chen',
      signInUrl: 'https://acme.example.com/welcome',
      otogrowRoleNames: ['Project Manager'],
    });

    const savedUser = (harness.userRepository.save as jest.Mock).mock
      .calls[0][0] as UserEntity;
    expect(savedUser.isEmailVerified).toBe(true);
    expect(savedUser.email).toBe('sarah@acme.com');
    expect(savedUser.passwordHash).not.toBe('Strong#Password9');
    await expect(
      compareHash('Strong#Password9', savedUser.passwordHash),
    ).resolves.toBe(true);

    expect(
      harness.userWorkspaceService.addUserToWorkspaceIfUserNotInWorkspace,
    ).toHaveBeenCalledWith(savedUser, activeWorkspace, null);
    expect(
      harness.onboardingService.setOnboardingCreateProfilePending,
    ).toHaveBeenCalledWith({
      userId: CREATED_USER_ID,
      workspaceId: WORKSPACE_ID,
      value: false,
    });
    expect(harness.otogrowAccessService.assignRoles).toHaveBeenCalledWith(
      WORKSPACE_ID,
      ACTOR_MEMBER_ID,
      ACTOR_USER_WORKSPACE_ID,
      {
        memberId: CREATED_MEMBER_ID,
        roleIds: [ROLE_ID],
        revision: 0,
        roleRevisions: [{ id: ROLE_ID, revision: 2 }],
      },
    );
    expect(recordOtogrowActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'EMPLOYEE_LOGIN_CREATED',
        subjectMemberId: CREATED_MEMBER_ID,
      }),
    );
    expect(
      JSON.stringify((recordOtogrowActivity as jest.Mock).mock.calls),
    ).not.toContain('Strong#Password9');
  });

  it('rejects non-admin callers', async () => {
    const harness = makeHarness();
    (
      harness.permissionsService.userHasWorkspaceSettingPermission as jest.Mock
    ).mockResolvedValue(false);
    (harness.otogrowAccessService.accessForUser as jest.Mock).mockResolvedValue(
      {
        workspaceId: WORKSPACE_ID,
        memberId: ACTOR_MEMBER_ID,
        userWorkspaceId: ACTOR_USER_WORKSPACE_ID,
        roleIds: [],
        nativeAdministrator: false,
        capabilities: [],
        grants: [],
      },
    );

    await expect(
      harness.service.createEmployeeLogin(
        WORKSPACE_ID,
        ACTOR_MEMBER_ID,
        ACTOR_USER_WORKSPACE_ID,
        {
          firstName: 'Sarah',
          lastName: 'Chen',
          email: 'sarah@acme.com',
          password: 'Strong#Password9',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when password sign-in is disabled on the workspace', async () => {
    const harness = makeHarness();
    (harness.workspaceRepository.findOneBy as jest.Mock).mockResolvedValue({
      ...activeWorkspace,
      isPasswordAuthEnabled: false,
    });

    await expect(
      harness.service.createEmployeeLogin(
        WORKSPACE_ID,
        ACTOR_MEMBER_ID,
        ACTOR_USER_WORKSPACE_ID,
        {
          firstName: 'Sarah',
          lastName: 'Chen',
          email: 'sarah@acme.com',
          password: 'Strong#Password9',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate emails without overwriting an existing user password', async () => {
    const harness = makeHarness();
    harness.getOne.mockResolvedValue({
      id: CREATED_USER_ID,
      email: 'sarah@acme.com',
    });

    await expect(
      harness.service.createEmployeeLogin(
        WORKSPACE_ID,
        ACTOR_MEMBER_ID,
        ACTOR_USER_WORKSPACE_ID,
        {
          firstName: 'Sarah',
          lastName: 'Chen',
          email: 'sarah@acme.com',
          password: 'Strong#Password9',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.userRepository.save).not.toHaveBeenCalled();
  });

  it('cleans up the newly created user if workspace membership attachment fails', async () => {
    const harness = makeHarness();
    (
      harness.userWorkspaceService
        .addUserToWorkspaceIfUserNotInWorkspace as jest.Mock
    ).mockRejectedValue(new Error('Default role missing'));

    await expect(
      harness.service.createEmployeeLogin(
        WORKSPACE_ID,
        ACTOR_MEMBER_ID,
        ACTOR_USER_WORKSPACE_ID,
        {
          firstName: 'Sarah',
          lastName: 'Chen',
          email: 'sarah@acme.com',
          password: 'Strong#Password9',
        },
      ),
    ).rejects.toThrow('Default role missing');

    expect(harness.userRepository.delete).toHaveBeenCalledWith({
      id: CREATED_USER_ID,
    });
  });

  it('resets password for a single-workspace employee and blocks multi-workspace accounts', async () => {
    const harness = makeHarness();
    harness.query.mockResolvedValue([
      {
        memberId: CREATED_MEMBER_ID,
        userId: CREATED_USER_ID,
        userWorkspaceId: TARGET_USER_WORKSPACE_ID,
        firstName: 'Sarah',
        lastName: 'Chen',
      },
    ]);
    (harness.userRepository.findOneBy as jest.Mock).mockResolvedValue({
      id: CREATED_USER_ID,
      email: 'sarah@acme.com',
      firstName: 'Sarah',
      lastName: 'Chen',
      disabled: false,
      canAccessFullAdminPanel: false,
      isEmailVerified: false,
      passwordHash: 'old-hash',
    });

    const result = await harness.service.resetEmployeePassword(
      WORKSPACE_ID,
      ACTOR_MEMBER_ID,
      ACTOR_USER_WORKSPACE_ID,
      {
        workspaceMemberId: CREATED_MEMBER_ID,
        password: 'Updated#Password9',
      },
    );

    expect(result).toEqual({
      workspaceMemberId: CREATED_MEMBER_ID,
      email: 'sarah@acme.com',
      firstName: 'Sarah',
      lastName: 'Chen',
      signInUrl: 'https://acme.example.com/welcome',
    });

    (
      harness.userWorkspaceService.countUserWorkspaces as jest.Mock
    ).mockResolvedValue(2);

    await expect(
      harness.service.resetEmployeePassword(
        WORKSPACE_ID,
        ACTOR_MEMBER_ID,
        ACTOR_USER_WORKSPACE_ID,
        {
          workspaceMemberId: CREATED_MEMBER_ID,
          password: 'Updated#Password9',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
