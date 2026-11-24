import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { PermissionFlagType } from 'twenty-shared/constants';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { AppPath } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { DataSource, Repository } from 'typeorm';
import { z } from 'zod';

import {
  PASSWORD_REGEX,
  hashPassword,
} from 'src/engine/core-modules/auth/auth.util';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

const CREATE_EMPLOYEE_LOGIN_INPUT = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().refine((value) => PASSWORD_REGEX.test(value), {
      message: 'Password must be between 8 and 50 characters.',
    }),
    crmRoleId: z.string().uuid().nullish(),
    otogrowRoleIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();

const RESET_EMPLOYEE_PASSWORD_INPUT = z
  .object({
    workspaceMemberId: z.string().uuid(),
    password: z.string().refine((value) => PASSWORD_REGEX.test(value), {
      message: 'Password must be between 8 and 50 characters.',
    }),
  })
  .strict();

export type CreatedEmployeeLoginResult = {
  userId: string;
  workspaceMemberId: string;
  email: string;
  firstName: string;
  lastName: string;
  signInUrl: string;
  otogrowRoleNames: string[];
};

export type ResetEmployeePasswordResult = {
  workspaceMemberId: string;
  email: string;
  firstName: string;
  lastName: string;
  signInUrl: string;
};

type WorkspaceMemberIdentityRow = {
  memberId: string;
  userId: string;
  userWorkspaceId: string;
  firstName: string;
  lastName: string;
};

@Injectable()
// oxlint-disable-next-line twenty/inject-workspace-repository
export class OtogrowEmployeeLoginService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly onboardingService: OnboardingService,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly permissionsService: PermissionsService,
    private readonly otogrowAccessService: OtogrowAccessService,
  ) {}

  private async hasSettingPermission(
    workspaceId: string,
    userWorkspaceId: string,
    setting: PermissionFlagType,
  ): Promise<boolean> {
    try {
      return await this.permissionsService.userHasWorkspaceSettingPermission({
        workspaceId,
        userWorkspaceId,
        setting,
      });
    } catch (error) {
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE
      ) {
        return false;
      }

      throw error;
    }
  }

  private async loadActivePasswordWorkspace(
    workspaceId: string,
  ): Promise<WorkspaceEntity> {
    if (!isValidUuid(workspaceId)) {
      throw new ForbiddenException('Workspace access is required.');
    }

    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });

    if (
      !workspace ||
      workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE ||
      !workspace.databaseSchema ||
      !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
    ) {
      throw new ForbiddenException('An active workspace is required.');
    }

    if (!workspace.isPasswordAuthEnabled) {
      throw new BadRequestException(
        'Email and password sign-in is disabled for this workspace. Enable it in Settings → Security first.',
      );
    }

    return workspace;
  }

  private async findWorkspaceMemberIdentityByUserId(
    workspace: WorkspaceEntity,
    userId: string,
  ): Promise<WorkspaceMemberIdentityRow | null> {
    const rows = (await this.dataSource.manager.query(
      `SELECT m.id AS "memberId", u."userId" AS "userId", u.id AS "userWorkspaceId", m."nameFirstName" AS "firstName", m."nameLastName" AS "lastName"
       FROM "${workspace.databaseSchema}"."workspaceMember" m
       JOIN core."userWorkspace" u ON u."userId" = m."userId" AND u."workspaceId" = $1
       WHERE m."userId" = $2 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL
       LIMIT 1`,
      [workspace.id, userId],
    )) as WorkspaceMemberIdentityRow[];

    return rows[0] ?? null;
  }

  private async findWorkspaceMemberIdentityByMemberId(
    workspace: WorkspaceEntity,
    workspaceMemberId: string,
  ): Promise<WorkspaceMemberIdentityRow | null> {
    const rows = (await this.dataSource.manager.query(
      `SELECT m.id AS "memberId", u."userId" AS "userId", u.id AS "userWorkspaceId", m."nameFirstName" AS "firstName", m."nameLastName" AS "lastName"
       FROM "${workspace.databaseSchema}"."workspaceMember" m
       JOIN core."userWorkspace" u ON u."userId" = m."userId" AND u."workspaceId" = $1
       WHERE m.id = $2 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL
       LIMIT 1`,
      [workspace.id, workspaceMemberId],
    )) as WorkspaceMemberIdentityRow[];

    return rows[0] ?? null;
  }

  private buildSignInUrl(workspace: WorkspaceEntity): string {
    return this.workspaceDomainsService
      .buildWorkspaceURL({
        workspace,
        pathname: AppPath.SignInUp,
      })
      .toString();
  }

  async createEmployeeLogin(
    workspaceId: string,
    actorMemberId: string,
    actorUserWorkspaceId: string,
    input: unknown,
  ): Promise<CreatedEmployeeLoginResult> {
    const parsed = CREATE_EMPLOYEE_LOGIN_INPUT.safeParse(input);

    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === 'password',
      );
      if (passwordIssue) {
        throw new BadRequestException(
          'Password must be between 8 and 50 characters.',
        );
      }

      const emailIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === 'email',
      );
      if (emailIssue) {
        throw new BadRequestException('Enter a valid work email address.');
      }

      throw new BadRequestException(
        'Enter first name, last name, a valid email, and a password of 8 to 50 characters.',
      );
    }

    const command = parsed.data;
    const otogrowRoleIds = [...new Set(command.otogrowRoleIds ?? [])];
    const crmRoleId = command.crmRoleId ?? null;

    const workspace = await this.loadActivePasswordWorkspace(workspaceId);

    const [actorAccess, canManageWorkspaceMembers] = await Promise.all([
      this.otogrowAccessService.accessForUser(
        workspaceId,
        actorMemberId,
        actorUserWorkspaceId,
      ),
      this.hasSettingPermission(
        workspaceId,
        actorUserWorkspaceId,
        PermissionFlagType.WORKSPACE_MEMBERS,
      ),
    ]);

    const isOtogrowAdmin = actorAccess.capabilities.includes('workspace.admin');

    if (!canManageWorkspaceMembers && !isOtogrowAdmin) {
      throw new ForbiddenException(
        'Only workspace administrators can create employee logins.',
      );
    }

    if (isDefined(crmRoleId) && !canManageWorkspaceMembers) {
      throw new ForbiddenException(
        'CRM member settings permission is required to assign a custom CRM role.',
      );
    }

    if (otogrowRoleIds.length > 0 && !isOtogrowAdmin) {
      throw new ForbiddenException(
        'Only an Otogrow OS administrator can assign business roles.',
      );
    }

    const existingUser = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: command.email })
      .getOne();

    if (existingUser) {
      const existingMembership =
        await this.userWorkspaceService.checkUserWorkspaceExists(
          existingUser.id,
          workspace.id,
        );

      if (existingMembership) {
        throw new ConflictException(
          'An employee with this email is already in this workspace.',
        );
      }

      throw new ConflictException(
        'An account with this email already exists. Invite them by email instead so they can sign in with their existing password.',
      );
    }

    const passwordHash = await hashPassword(command.password);

    const newUser = this.userRepository.create({
      email: command.email,
      firstName: command.firstName,
      lastName: command.lastName,
      passwordHash,
      isEmailVerified: true,
      locale: SOURCE_LOCALE,
      canImpersonate: false,
      canAccessFullAdminPanel: false,
      disabled: false,
    });

    const savedUser = await this.userRepository.save(newUser);

    try {
      await this.userWorkspaceService.addUserToWorkspaceIfUserNotInWorkspace(
        savedUser,
        workspace,
        crmRoleId,
      );
    } catch (error) {
      await this.userRepository.delete({ id: savedUser.id }).catch(() => {});
      throw error;
    }

    await this.onboardingService.setOnboardingCreateProfilePending({
      userId: savedUser.id,
      workspaceId: workspace.id,
      value: false,
    });

    const memberIdentity = await this.findWorkspaceMemberIdentityByUserId(
      workspace,
      savedUser.id,
    );

    if (!memberIdentity) {
      throw new BadRequestException(
        'The employee account was created, but workspace membership could not be loaded.',
      );
    }

    let otogrowRoleNames: string[] = [];

    if (otogrowRoleIds.length > 0) {
      const directory = await this.otogrowAccessService.directory(
        workspaceId,
        actorMemberId,
        actorUserWorkspaceId,
      );
      const createdMember = directory.members.find(
        (member) => member.memberId === memberIdentity.memberId,
      );
      const selectedRoles = directory.roles.filter((role) =>
        otogrowRoleIds.includes(role.id),
      );

      if (createdMember && selectedRoles.length === otogrowRoleIds.length) {
        await this.otogrowAccessService.assignRoles(
          workspaceId,
          actorMemberId,
          actorUserWorkspaceId,
          {
            memberId: memberIdentity.memberId,
            roleIds: otogrowRoleIds,
            revision: createdMember.revision,
            roleRevisions: selectedRoles.map((role) => ({
              id: role.id,
              revision: role.revision,
            })),
          },
        );
        otogrowRoleNames = selectedRoles.map((role) => role.name);
      }
    }

    await recordOtogrowActivity(this.dataSource.manager, {
      workspaceId,
      actorId: actorMemberId,
      subjectMemberId: memberIdentity.memberId,
      category: 'ACCESS',
      action: 'EMPLOYEE_LOGIN_CREATED',
      outcome: 'RECORDED',
      summary: 'Created a direct employee login',
      sourceType: 'roles',
      sourceId: memberIdentity.memberId,
      changes: [
        {
          field: 'Employee',
          before: null,
          after: `${savedUser.firstName} ${savedUser.lastName}`.trim(),
        },
        {
          field: 'Email',
          before: null,
          after: savedUser.email,
        },
        ...(otogrowRoleNames.length > 0
          ? [
              {
                field: 'Roles',
                before: null,
                after: otogrowRoleNames.join(', '),
              },
            ]
          : []),
      ],
    });

    return {
      userId: savedUser.id,
      workspaceMemberId: memberIdentity.memberId,
      email: savedUser.email,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      signInUrl: this.buildSignInUrl(workspace),
      otogrowRoleNames,
    };
  }

  async resetEmployeePassword(
    workspaceId: string,
    actorMemberId: string,
    actorUserWorkspaceId: string,
    input: unknown,
  ): Promise<ResetEmployeePasswordResult> {
    const parsed = RESET_EMPLOYEE_PASSWORD_INPUT.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(
        'Provide a valid employee and a password of 8 to 50 characters.',
      );
    }

    const command = parsed.data;

    if (command.workspaceMemberId === actorMemberId) {
      throw new BadRequestException(
        'Change your own password in Settings → Account.',
      );
    }

    const workspace = await this.loadActivePasswordWorkspace(workspaceId);

    const [actorAccess, canManageWorkspaceMembers, actorHasRolesPermission] =
      await Promise.all([
        this.otogrowAccessService.accessForUser(
          workspaceId,
          actorMemberId,
          actorUserWorkspaceId,
        ),
        this.hasSettingPermission(
          workspaceId,
          actorUserWorkspaceId,
          PermissionFlagType.WORKSPACE_MEMBERS,
        ),
        this.hasSettingPermission(
          workspaceId,
          actorUserWorkspaceId,
          PermissionFlagType.ROLES,
        ),
      ]);

    const isOtogrowAdmin = actorAccess.capabilities.includes('workspace.admin');

    if (!canManageWorkspaceMembers && !isOtogrowAdmin) {
      throw new ForbiddenException(
        'Only workspace administrators can reset employee passwords.',
      );
    }

    const targetIdentity = await this.findWorkspaceMemberIdentityByMemberId(
      workspace,
      command.workspaceMemberId,
    );

    if (!targetIdentity) {
      throw new BadRequestException(
        'Select an active employee in this workspace.',
      );
    }

    const targetUser = await this.userRepository.findOneBy({
      id: targetIdentity.userId,
    });

    if (!targetUser || targetUser.disabled) {
      throw new BadRequestException(
        'Select an active employee in this workspace.',
      );
    }

    if (targetUser.canAccessFullAdminPanel) {
      throw new ForbiddenException(
        'This account password cannot be reset from workspace settings.',
      );
    }

    const targetWorkspaceCount =
      await this.userWorkspaceService.countUserWorkspaces(targetUser.id);

    if (targetWorkspaceCount > 1) {
      throw new ForbiddenException(
        'This account belongs to multiple workspaces, so its password cannot be changed here. Ask the employee to reset it themselves.',
      );
    }

    const targetHasRolesPermission = await this.hasSettingPermission(
      workspaceId,
      targetIdentity.userWorkspaceId,
      PermissionFlagType.ROLES,
    );

    if (targetHasRolesPermission && !actorHasRolesPermission) {
      throw new ForbiddenException(
        'Only a CRM administrator can reset another CRM administrator’s password.',
      );
    }

    targetUser.passwordHash = await hashPassword(command.password);
    targetUser.isEmailVerified = true;
    await this.userRepository.save(targetUser);

    await recordOtogrowActivity(this.dataSource.manager, {
      workspaceId,
      actorId: actorMemberId,
      subjectMemberId: targetIdentity.memberId,
      category: 'ACCESS',
      action: 'EMPLOYEE_PASSWORD_RESET',
      outcome: 'RECORDED',
      summary: 'Reset an employee’s login password',
      sourceType: 'roles',
      sourceId: targetIdentity.memberId,
      changes: [
        {
          field: 'Employee',
          before: null,
          after:
            `${targetIdentity.firstName} ${targetIdentity.lastName}`.trim(),
        },
        {
          field: 'Credential',
          before: null,
          after: 'Password updated by administrator',
        },
      ],
    });

    return {
      workspaceMemberId: targetIdentity.memberId,
      email: targetUser.email,
      firstName: targetIdentity.firstName || targetUser.firstName,
      lastName: targetIdentity.lastName || targetUser.lastName,
      signInUrl: this.buildSignInUrl(workspace),
    };
  }
}
