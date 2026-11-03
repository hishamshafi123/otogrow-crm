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
import { DeliveryMediaService } from 'src/modules/delivery/creative/delivery-media.service';
import { DeliveryVideoQaService } from './delivery-video-qa.service';
import {
  DeliveryVideoQaCancelInput,
  DeliveryVideoQaPreviewDTO,
  DeliveryVideoQaPreviewInput,
  DeliveryVideoQaReceiptDTO,
  DeliveryVideoQaReceiptInput,
  DeliveryVideoQaRunDTO,
  DeliveryVideoQaSelectionInput,
  DeliveryVideoQaStartInput,
  DeliveryVideoQaStateDTO,
} from './delivery-video-qa.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryVideoQaResolver {
  constructor(
    private readonly videoQa: DeliveryVideoQaService,
    private readonly media: DeliveryMediaService,
  ) {}
  @Query(() => DeliveryVideoQaPreviewDTO)
  deliveryVideoQaPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaPreviewInput,
  ) {
    return this.videoQa.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryVideoQaStateDTO)
  deliveryVideoQaState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaSelectionInput,
  ) {
    return this.videoQa.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryVideoQaRunDTO)
  deliveryVideoQaRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaSelectionInput,
  ) {
    return this.videoQa.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryVideoQaReceiptDTO)
  deliveryVideoQaReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaReceiptInput,
  ) {
    return this.videoQa.receipt(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryVideoQaReceiptDTO)
  startDeliveryVideoQa(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaStartInput,
  ) {
    return this.media.startVideoQa(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryVideoQaReceiptDTO)
  cancelDeliveryVideoQa(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryVideoQaCancelInput,
  ) {
    return this.videoQa.cancel(workspace, memberId, userWorkspaceId, input);
  }
}
