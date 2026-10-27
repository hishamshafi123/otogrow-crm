import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import {
  OtogrowAccessDTO,
  OtogrowRoleAssignmentInput,
  OtogrowRoleDirectoryDTO,
  OtogrowRoleInput,
} from 'src/modules/otogrow-access/otogrow-access.dto';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class OtogrowAccessResolver {
  constructor(private readonly access: OtogrowAccessService) {}

  @Query(() => OtogrowAccessDTO)
  otogrowAccess(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.access.accessForUser(workspace.id, memberId, userWorkspaceId);
  }

  @Query(() => OtogrowRoleDirectoryDTO)
  otogrowRoleDirectory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.access.directory(workspace.id, memberId, userWorkspaceId);
  }

  @Mutation(() => OtogrowRoleDirectoryDTO)
  saveOtogrowRole(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowRoleInput,
  ) {
    return this.access.saveRole(workspace.id, memberId, userWorkspaceId, input);
  }

  @Mutation(() => OtogrowRoleDirectoryDTO)
  assignOtogrowRoles(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowRoleAssignmentInput,
  ) {
    return this.access.assignRoles(
      workspace.id,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
