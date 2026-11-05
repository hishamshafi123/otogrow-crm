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
import { DeliveryKnowledgeAssetsService } from './delivery-knowledge-assets.service';
import {
  DeliveryKnowledgeUploadInput,
  DeliveryKnowledgeUploadsInput,
  DeliveryKnowledgeUploadResultDTO,
  DeliveryKnowledgeUploadsDTO,
} from './delivery-knowledge-assets.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryKnowledgeAssetsResolver {
  constructor(private readonly assets: DeliveryKnowledgeAssetsService) {}
  @Query(() => DeliveryKnowledgeUploadResultDTO)
  deliveryKnowledgeUpload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeUploadInput,
  ) {
    return this.assets.status(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryKnowledgeUploadsDTO)
  deliveryKnowledgeUploads(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeUploadsInput,
  ) {
    return this.assets.list(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryKnowledgeUploadResultDTO)
  recoverDeliveryKnowledgeUpload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeUploadInput,
  ) {
    return this.assets.recover(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryKnowledgeUploadResultDTO)
  discardDeliveryKnowledgeUpload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeUploadInput,
  ) {
    return this.assets.recover(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      true,
    );
  }
}
