import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  DeliveryWorkspaceContextDTO,
  DeliveryTaskListDTO,
  DeliveryTaskListInput,
  DeliveryTaskDetailDTO,
  DeliveryTaskDetailInput,
  DeliveryTaskCommandInput,
  DeliveryTaskCommandResultDTO,
  DeliveryTaskAssignmentSeenDTO,
  DeliveryTaskAssignmentSeenInput,
} from 'src/modules/delivery/tasks/delivery-tasks.dto';
import { DeliveryTasksService } from 'src/modules/delivery/tasks/delivery-tasks.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryTasksResolver {
  constructor(private readonly tasks: DeliveryTasksService) {}
  @Query(() => DeliveryWorkspaceContextDTO)
  deliveryWorkspaceContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.tasks.context(workspace, memberId, userWorkspaceId);
  }
  @Query(() => DeliveryTaskListDTO)
  deliveryTaskList(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskListInput,
  ) {
    return this.tasks.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryTaskDetailDTO)
  deliveryTaskDetail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskDetailInput,
  ) {
    return this.tasks.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryTaskAssignmentSeenDTO)
  seeDeliveryTaskAssignment(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskAssignmentSeenInput,
  ) {
    return this.tasks.seeAssignment(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryTaskCommandResultDTO)
  changeDeliveryTask(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskCommandInput,
  ) {
    return this.tasks.command(workspace, memberId, userWorkspaceId, input);
  }
}
