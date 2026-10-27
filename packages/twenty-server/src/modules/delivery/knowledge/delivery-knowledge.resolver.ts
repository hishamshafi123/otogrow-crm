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
import { DeliveryKnowledgeService } from 'src/modules/delivery/knowledge/delivery-knowledge.service';
import {
  DeliveryKnowledgeInput,
  DeliveryKnowledgePublishInput,
  DeliveryKnowledgeSaveInput,
  DeliveryKnowledgeSnapshotDTO,
} from 'src/modules/delivery/knowledge/delivery-knowledge.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryKnowledgeResolver {
  constructor(private readonly knowledge: DeliveryKnowledgeService) {}
  @Query(() => DeliveryKnowledgeSnapshotDTO)
  deliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeInput,
  ) {
    return this.knowledge.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  saveDeliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeSaveInput,
  ) {
    return this.knowledge.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => Boolean)
  publishDeliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgePublishInput,
  ) {
    return this.knowledge.publish(workspace, memberId, userWorkspaceId, input);
  }
}
