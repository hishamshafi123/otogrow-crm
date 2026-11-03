import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  OtogrowActivityContextDTO,
  OtogrowActivityPageDTO,
  OtogrowActivityPageInput,
  OtogrowActivityOptionsDTO,
  OtogrowActivityOptionsInput,
  OtogrowActivityEventDetailDTO,
  OtogrowActivityEventInput,
  OtogrowActivityFeedDTO,
  OtogrowActivityFilterInput,
} from 'src/modules/otogrow-activity/otogrow-activity.dto';
import { OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class OtogrowActivityResolver {
  constructor(private readonly activity: OtogrowActivityService) {}

  @Query(() => OtogrowActivityFeedDTO)
  otogrowActivity(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityFilterInput,
  ) {
    return this.activity.feed(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => OtogrowActivityContextDTO)
  otogrowActivityContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.activity.context(workspace, memberId, userWorkspaceId);
  }

  @Query(() => OtogrowActivityPageDTO)
  otogrowActivityPage(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityPageInput,
  ) {
    return this.activity.page(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => OtogrowActivityOptionsDTO)
  otogrowActivityOptions(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityOptionsInput,
  ) {
    return this.activity.options(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => OtogrowActivityEventDetailDTO)
  otogrowActivityEvent(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityEventInput,
  ) {
    return this.activity.event(workspace, memberId, userWorkspaceId, input);
  }
}
