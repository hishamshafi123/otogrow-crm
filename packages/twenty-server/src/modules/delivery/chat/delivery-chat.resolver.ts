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
import { DeliveryChatService } from 'src/modules/delivery/chat/delivery-chat.service';
import {
  DeliveryChatInput,
  DeliveryChatSendInput,
  DeliveryChatViewedInput,
  DeliveryChatSnapshotDTO,
} from 'src/modules/delivery/chat/delivery-chat.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryChatResolver {
  constructor(private readonly chat: DeliveryChatService) {}
  @Query(() => DeliveryChatSnapshotDTO)
  deliveryChat(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryChatInput,
  ) {
    return this.chat.snapshot(workspace.id, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  sendDeliveryChatMessage(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryChatSendInput,
  ) {
    return this.chat.send(workspace.id, memberId, userWorkspaceId, input);
  }
  @Mutation(() => Boolean)
  viewDeliveryChatMessages(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryChatViewedInput,
  ) {
    return this.chat.view(workspace.id, memberId, userWorkspaceId, input);
  }
}
