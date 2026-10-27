import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { DataSource, type EntityManager } from 'typeorm';
import { v4, v5 } from 'uuid';
import { z } from 'zod';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { OtogrowAccessEventEntity } from 'src/modules/otogrow-access/entities/otogrow-access-event.entity';
import { OtogrowMemberAccessEntity } from 'src/modules/otogrow-access/entities/otogrow-member-access.entity';
import { OtogrowRoleAssignmentEntity } from 'src/modules/otogrow-access/entities/otogrow-role-assignment.entity';
import { OtogrowRoleEntity } from 'src/modules/otogrow-access/entities/otogrow-role.entity';
import {
  OTOGROW_CAPABILITIES,
  OTOGROW_DEFAULT_ROLES,
  type OtogrowAccess,
  type OtogrowCapability,
  type OtogrowRole,
  type OtogrowRoleDirectory,
} from 'src/modules/otogrow-access/otogrow-access.types';

const ROLE_INPUT = z
  .object({
    id: z.string().uuid().nullish(),
    revision: z.number().int().nonnegative().nullish(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    capabilities: z
      .array(z.enum(OTOGROW_CAPABILITIES))
      .max(OTOGROW_CAPABILITIES.length),
  })
  .strict();
const ASSIGNMENT_INPUT = z
  .object({
    memberId: z.string().uuid(),
    roleIds: z.array(z.string().uuid()).max(100),
    roleRevisions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            revision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100),
    revision: z.number().int().nonnegative(),
  })
  .strict();

type ActiveMember = { memberId: string; userWorkspaceId: string; name: string };

@Injectable()
export class OtogrowAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  async listActiveMembers(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<ActiveMember[]> {
    if (!isValidUuid(workspaceId))
      throw new ForbiddenException('Workspace access is required.');
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: workspaceId });
    if (
      !workspace ||
      workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE ||
      !workspace.databaseSchema ||
      !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
    ) {
      throw new ForbiddenException('An active workspace is required.');
    }
    return manager.query(
      `SELECT m.id AS "memberId", u.id AS "userWorkspaceId", trim(concat_ws(' ', m."nameFirstName", m."nameLastName")) AS name FROM "${workspace.databaseSchema}"."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$1 JOIN core."user" account ON account.id=u."userId" WHERE m."deletedAt" IS NULL AND u."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false ORDER BY name, m.id`,
      [workspaceId],
    );
  }

  private defaultRoles(workspaceId: string): OtogrowRole[] {
    return OTOGROW_DEFAULT_ROLES.map((role) => ({
      id: v5(`otogrow-role:${role.key}`, workspaceId),
      name: role.name,
      description: role.description,
      capabilities: [...role.capabilities],
      revision: 0,
    }));
  }

  private async roles(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<OtogrowRole[]> {
    const saved = await manager
      .getRepository(OtogrowRoleEntity)
      .findBy({ workspaceId });
    const savedById = new Map(saved.map((role) => [role.id, role]));
    return [
      ...this.defaultRoles(workspaceId).map(
        (role) => savedById.get(role.id) ?? role,
      ),
      ...saved.filter(
        (role) =>
          !this.defaultRoles(workspaceId).some((item) => item.id === role.id),
      ),
    ].map(({ id, name, description, capabilities, revision }) => ({
      id,
      name,
      description,
      capabilities,
      revision,
    }));
  }

  private async memberRoles(
    workspaceId: string,
    memberId: string,
    manager: EntityManager,
  ) {
    const state = await manager
      .getRepository(OtogrowMemberAccessEntity)
      .findOneBy({ workspaceId, workspaceMemberId: memberId });
    if (state) {
      const assignments = await manager
        .getRepository(OtogrowRoleAssignmentEntity)
        .findBy({ workspaceId, workspaceMemberId: memberId });
      return {
        revision: state.revision,
        roleIds: assignments.map((item) => item.roleId),
      };
    }
    // Legacy access was an explicit grant; editable job titles were never authorization.
    const legacy = await manager
      .getRepository(DeliveryMemberEntity)
      .findOneBy({ workspaceId, workspaceMemberId: memberId });
    const key =
      legacy?.access === 'ADMIN'
        ? 'admin'
        : legacy?.access === 'MANAGER'
          ? 'project-manager'
          : null;
    return {
      revision: 0,
      roleIds: key ? [v5(`otogrow-role:${key}`, workspaceId)] : [],
    };
  }

  private async isNativeAdministrator(
    workspaceId: string,
    userWorkspaceId: string,
  ): Promise<boolean> {
    try {
      return await this.permissions.userHasWorkspaceSettingPermission({
        workspaceId,
        userWorkspaceId,
        setting: PermissionFlagType.ROLES,
      });
    } catch (error) {
      // Membership creation and native role assignment are separate writes during onboarding.
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE
      )
        return false;
      throw error;
    }
  }

  private async resolve(
    workspaceId: string,
    member: ActiveMember,
    roles: OtogrowRole[],
    manager: EntityManager,
  ): Promise<OtogrowAccess> {
    const [assignment, nativeAdministrator] = await Promise.all([
      this.memberRoles(workspaceId, member.memberId, manager),
      this.isNativeAdministrator(workspaceId, member.userWorkspaceId),
    ]);
    const grants: OtogrowAccess['grants'] = roles
      .filter((role) => assignment.roleIds.includes(role.id))
      .flatMap((role) =>
        role.capabilities
          .filter((capability) =>
            OTOGROW_CAPABILITIES.some((known) => known === capability),
          )
          .map((capability) => ({
            capability,
            sourceId: role.id,
            sourceName: role.name,
            sourceType: 'role' as const,
          })),
      );
    if (nativeAdministrator)
      grants.push(
        ...OTOGROW_CAPABILITIES.map((capability) => ({
          capability,
          sourceId: 'native-administrator',
          sourceName: 'CRM administrator',
          sourceType: 'native' as const,
        })),
      );
    // Existing administrators retain finance; phone still requires its own grant.
    for (const grant of [...grants]) {
      const inherited =
        grant.capability === 'workspace.admin'
          ? ['delivery.manage', 'finance.read', 'finance.manage']
          : grant.capability === 'finance.manage'
            ? ['finance.read']
            : [];
      for (const capability of inherited) {
        if (
          !grants.some(
            (item) =>
              item.capability === capability &&
              item.sourceId === grant.sourceId,
          )
        )
          grants.push({ ...grant, capability });
      }
    }
    return {
      workspaceId,
      memberId: member.memberId,
      userWorkspaceId: member.userWorkspaceId,
      nativeAdministrator,
      capabilities: [...new Set(grants.map((grant) => grant.capability))],
      roleIds: assignment.roleIds.filter((id) =>
        roles.some((role) => role.id === id),
      ),
      grants,
    };
  }

  async getAccess(
    workspaceId: string,
    memberId: string | undefined,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<OtogrowAccess> {
    if (!memberId || !isValidUuid(memberId))
      throw new ForbiddenException('Active workspace membership is required.');
    const members = await this.listActiveMembers(workspaceId, manager);
    const member = members.find((item) => item.memberId === memberId);
    if (!member)
      throw new ForbiddenException('Active workspace membership is required.');
    return this.resolve(
      workspaceId,
      member,
      await this.roles(workspaceId, manager),
      manager,
    );
  }

  async requireCapability(
    workspaceId: string,
    memberId: string | undefined,
    capability: OtogrowCapability,
  ): Promise<OtogrowAccess> {
    const access = await this.getAccess(workspaceId, memberId);
    if (!access.capabilities.includes(capability))
      throw new ForbiddenException(
        'Your current roles do not allow this action.',
      );
    return access;
  }

  async listMemberIdsWithCapability(
    workspaceId: string,
    capability: OtogrowCapability,
  ): Promise<string[]> {
    return (await this.listAccess(workspaceId))
      .filter((member) => member.capabilities.includes(capability))
      .map((member) => member.memberId);
  }

  async listAccess(
    workspaceId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<OtogrowAccess[]> {
    const members = await this.listActiveMembers(workspaceId, manager);
    const roles = await this.roles(workspaceId, manager);
    return Promise.all(
      members.map((member) =>
        this.resolve(workspaceId, member, roles, manager),
      ),
    );
  }

  async accessForUser(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const access = await this.getAccess(workspaceId, memberId, manager);
    if (access.userWorkspaceId !== userWorkspaceId)
      throw new ForbiddenException('Workspace identity has changed.');
    return access;
  }

  async directory(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<OtogrowRoleDirectory> {
    const actor = await this.accessForUser(
      workspaceId,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.capabilities.includes('workspace.admin'))
      throw new ForbiddenException(
        'Only an administrator can manage team roles.',
      );
    const roles = await this.roles(workspaceId, manager);
    const members = await this.listActiveMembers(workspaceId, manager);
    return {
      actor,
      roles,
      members: await Promise.all(
        members.map(async (member) => ({
          memberId: member.memberId,
          name: member.name,
          ...(await this.memberRoles(workspaceId, member.memberId, manager)),
          access: await this.resolve(workspaceId, member, roles, manager),
        })),
      ),
    };
  }

  private async lock(workspaceId: string, manager: EntityManager) {
    // Share the delivery lock so a permission change cannot race an authorized delivery write.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`delivery:${workspaceId}`],
    );
  }

  private async materializeRoles(workspaceId: string, manager: EntityManager) {
    await manager
      .getRepository(OtogrowRoleEntity)
      .createQueryBuilder()
      .insert()
      .values(
        this.defaultRoles(workspaceId).map((role) => ({
          ...role,
          workspaceId,
        })),
      )
      .orIgnore()
      .execute();
  }

  private assertAdministratorRetained(
    before: OtogrowRoleDirectory,
    after: OtogrowRoleDirectory,
  ) {
    if (!after.actor.capabilities.includes('workspace.admin'))
      throw new BadRequestException(
        'Ask another administrator to change the roles that give you administrator access.',
      );
    if (
      before.members.some((member) =>
        member.access.capabilities.includes('workspace.admin'),
      ) &&
      !after.members.some((member) =>
        member.access.capabilities.includes('workspace.admin'),
      )
    )
      throw new BadRequestException('Keep at least one active administrator.');
  }

  async saveRole(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<OtogrowRoleDirectory> {
    const parsed = ROLE_INPUT.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Provide a role name, description and supported permissions.',
      );
    const command = parsed.data;
    return this.dataSource.transaction(async (manager) => {
      await this.lock(workspaceId, manager);
      const before = await this.directory(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      const existing = command.id
        ? before.roles.find((role) => role.id === command.id)
        : undefined;
      if (command.id && !existing)
        throw new BadRequestException('Select a role in this workspace.');
      if (existing && existing.revision !== command.revision)
        throw new ConflictException(
          'This role changed. Reload the latest access before saving.',
        );
      if (!existing && isDefined(command.revision))
        throw new BadRequestException(
          'A new role must not specify a revision.',
        );
      if (
        before.roles.some(
          (role) =>
            role.id !== existing?.id &&
            role.name.toLocaleLowerCase() === command.name.toLocaleLowerCase(),
        )
      )
        throw new BadRequestException('Choose a unique role name.');
      await this.materializeRoles(workspaceId, manager);
      const role: OtogrowRole = {
        id: existing?.id ?? v4(),
        name: command.name,
        description: command.description,
        capabilities: [...new Set(command.capabilities)],
        revision: (existing?.revision ?? 0) + 1,
      };
      await manager
        .getRepository(OtogrowRoleEntity)
        .save({ ...role, workspaceId });
      // Evaluate before the admin-only directory query to return a useful self-revocation error.
      const actor = await this.accessForUser(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      if (!actor.capabilities.includes('workspace.admin'))
        throw new BadRequestException(
          'Ask another administrator to change the roles that give you administrator access.',
        );
      const after = await this.directory(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      this.assertAdministratorRetained(before, after);
      await manager.getRepository(OtogrowAccessEventEntity).insert({
        workspaceId,
        actorMemberId: memberId,
        subjectMemberId: null,
        roleId: role.id,
        action: existing ? 'ROLE_UPDATED' : 'ROLE_CREATED',
        before: existing ? { ...existing } : null,
        after: { ...role },
      });
      await recordOtogrowActivity(manager, {
        workspaceId,
        actorId: memberId,
        category: 'ACCESS',
        action: existing ? 'ROLE_UPDATED' : 'ROLE_CREATED',
        outcome: 'RECORDED',
        summary: existing
          ? 'Updated a business role'
          : 'Created a business role',
        sourceType: 'roles',
        sourceId: role.id,
        changes: [
          { field: 'Role', before: existing?.name ?? null, after: role.name },
          {
            field: 'Permissions',
            before: existing?.capabilities.join(', ') ?? null,
            after: role.capabilities.join(', ') || null,
          },
        ],
      });
      return after;
    });
  }

  async assignRoles(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<OtogrowRoleDirectory> {
    const parsed = ASSIGNMENT_INPUT.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Select a member, their roles and the current revision.',
      );
    const command = parsed.data;
    return this.dataSource.transaction(async (manager) => {
      await this.lock(workspaceId, manager);
      const before = await this.directory(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      if (memberId === command.memberId)
        throw new BadRequestException(
          'Ask another administrator to change your own roles.',
        );
      const member = before.members.find(
        (item) => item.memberId === command.memberId,
      );
      if (!member)
        throw new BadRequestException(
          'Select an active member of this workspace.',
        );
      if (member.revision !== command.revision)
        throw new ConflictException(
          'This person’s roles changed. Reload the latest access before saving.',
        );
      const roleIds = [...new Set(command.roleIds)];
      if (roleIds.some((id) => !before.roles.some((role) => role.id === id)))
        throw new BadRequestException('Select roles from this workspace.');
      if (
        command.roleRevisions.length !== roleIds.length ||
        roleIds.some((id) => {
          const preview = command.roleRevisions.find((role) => role.id === id);
          return (
            !preview ||
            preview.revision !==
              before.roles.find((role) => role.id === id)?.revision
          );
        })
      )
        throw new ConflictException(
          'A selected role changed. Reload its latest permissions before saving.',
        );
      await this.materializeRoles(workspaceId, manager);
      await manager.getRepository(OtogrowMemberAccessEntity).upsert(
        {
          workspaceId,
          workspaceMemberId: member.memberId,
          revision: member.revision + 1,
        },
        ['workspaceId', 'workspaceMemberId'],
      );
      const repository = manager.getRepository(OtogrowRoleAssignmentEntity);
      await repository.delete({
        workspaceId,
        workspaceMemberId: member.memberId,
      });
      if (roleIds.length)
        await repository.insert(
          roleIds.map((roleId) => ({
            workspaceId,
            workspaceMemberId: member.memberId,
            roleId,
          })),
        );
      const after = await this.directory(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      this.assertAdministratorRetained(before, after);
      const updated = after.members.find(
        (item) => item.memberId === member.memberId,
      );
      await manager.getRepository(OtogrowAccessEventEntity).insert({
        workspaceId,
        actorMemberId: memberId,
        subjectMemberId: member.memberId,
        roleId: null,
        action: 'ROLES_ASSIGNED',
        before: {
          roleIds: member.roleIds,
          revision: member.revision,
          capabilities: member.access.capabilities,
        },
        after: {
          roleIds,
          revision: member.revision + 1,
          capabilities: updated?.access.capabilities ?? [],
        },
      });
      await recordOtogrowActivity(manager, {
        workspaceId,
        actorId: memberId,
        subjectMemberId: member.memberId,
        category: 'ACCESS',
        action: 'ROLES_ASSIGNED',
        outcome: 'RECORDED',
        summary: 'Changed a team member’s business roles',
        sourceType: 'roles',
        sourceId: member.memberId,
        changes: [
          {
            field: 'Roles',
            before:
              before.roles
                .filter((role) => member.roleIds.includes(role.id))
                .map((role) => role.name)
                .join(', ') || null,
            after:
              after.roles
                .filter((role) => roleIds.includes(role.id))
                .map((role) => role.name)
                .join(', ') || null,
          },
          {
            field: 'Permissions',
            before: member.access.capabilities.join(', ') || null,
            after: updated?.access.capabilities.join(', ') || null,
          },
        ],
      });
      return after;
    });
  }
}
