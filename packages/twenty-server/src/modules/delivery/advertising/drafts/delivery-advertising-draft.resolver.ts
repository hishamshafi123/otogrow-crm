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
import { DeliveryAdvertisingDraftService } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.service';
import {
  CancelDeliveryAdvertisingDraftInput,
  DeliveryAdvertisingDraftPreviewDTO,
  DeliveryAdvertisingDraftPreviewInput,
  DeliveryAdvertisingDraftRequestDTO,
  DeliveryAdvertisingDraftRequestInput,
  DeliveryAdvertisingDraftRunDetailDTO,
  DeliveryAdvertisingDraftRunInput,
  DeliveryAdvertisingDraftRunsDTO,
  DeliveryAdvertisingDraftRunsInput,
  DeliveryAdvertisingDraftRunStateDTO,
  StartDeliveryAdvertisingDraftInput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryAdvertisingDraftResolver {
  constructor(private readonly drafts: DeliveryAdvertisingDraftService) {}
  @Query(() => DeliveryAdvertisingDraftPreviewDTO)
  deliveryAdvertisingDraftPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingDraftPreviewInput,
  ) {
    return this.drafts.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAdvertisingDraftRunsDTO)
  deliveryAdvertisingDraftRuns(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingDraftRunsInput,
  ) {
    return this.drafts.runs(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAdvertisingDraftRunDetailDTO)
  deliveryAdvertisingDraftRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingDraftRunInput,
  ) {
    return this.drafts.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAdvertisingDraftRunStateDTO)
  deliveryAdvertisingDraftRunState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingDraftRunInput,
  ) {
    return this.drafts.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAdvertisingDraftRequestDTO)
  deliveryAdvertisingDraftRequest(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingDraftRequestInput,
  ) {
    return this.drafts.request(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAdvertisingDraftRequestDTO)
  startDeliveryAdvertisingDraft(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: StartDeliveryAdvertisingDraftInput,
  ) {
    return this.drafts.start(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAdvertisingDraftRequestDTO)
  cancelDeliveryAdvertisingDraft(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: CancelDeliveryAdvertisingDraftInput,
  ) {
    return this.drafts.cancel(workspace, memberId, userWorkspaceId, input);
  }
}
