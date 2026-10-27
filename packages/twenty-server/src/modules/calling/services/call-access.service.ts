import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

@Injectable()
export class CallAccessService {
  constructor(
    private readonly access: OtogrowAccessService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceOrm: GlobalWorkspaceOrmManager,
  ) {}

  async requireMemberContext(
    workspaceId: string,
    memberId: string | undefined,
  ): Promise<UserWorkspaceAuthContext> {
    const access = await this.access.requireCapability(
      workspaceId,
      memberId,
      'phone.use',
    );
    const membership = await this.dataSource
      .getRepository(UserWorkspaceEntity)
      .findOne({
        where: { id: access.userWorkspaceId, workspaceId },
        relations: { user: true, workspace: true },
      });
    if (
      !isDefined(membership) ||
      !isDefined(membership.user) ||
      !isDefined(membership.workspace) ||
      membership.user.disabled ||
      isDefined(membership.user.deletedAt) ||
      isDefined(membership.workspace.deletedAt)
    )
      throw new ForbiddenException('Calling access is no longer available.');

    // Signed Twilio callbacks have an identity but no session; bootstrap only that member before applying native record permissions.
    const member = await this.workspaceOrm.executeInWorkspaceContext(
      async () => {
        const repository = await this.workspaceOrm.getRepository(
          workspaceId,
          WorkspaceMemberWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );
        return repository.findOne({
          where: { id: access.memberId, userId: membership.userId },
        });
      },
      buildSystemAuthContext(workspaceId),
    );
    if (!isDefined(member))
      throw new ForbiddenException('Calling access is no longer available.');

    return buildUserAuthContext({
      workspace: fromWorkspaceEntityToFlat(membership.workspace),
      user: fromUserEntityToFlat(membership.user),
      userWorkspaceId: membership.id,
      workspaceMemberId: member.id,
      workspaceMember: member,
    });
  }
}
