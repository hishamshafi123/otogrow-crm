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
import { DeliveryAdvertisingWorkbenchService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.service';
import {
  DeliveryAdvertisingContextDTO,
  DeliveryAdvertisingReviewsDTO,
  DeliveryAdvertisingReviewsInput,
  DeliveryAdvertisingReviewDetailDTO,
  DeliveryAdvertisingReviewInput,
  DeliveryAdvertisingReviewStateDTO,
  DeliveryAdvertisingReceiptDTO,
  DeliveryAdvertisingReceiptInput,
  DeliveryAdvertisingChoicesDTO,
  DeliveryAdvertisingChoicesInput,
  DeliveryAdvertisingObservationsDTO,
  DeliveryAdvertisingObservationsInput,
  DeliveryAdvertisingWriteResultDTO,
  SaveDeliveryAdvertisingReviewInput,
  AssignDeliveryAdvertisingReviewInput,
  ObserveDeliveryAdvertisingActionInput,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.dto';
import {
  DeliveryAdvertisingSourcesDTO,
  DeliveryAdvertisingSourcesInput,
  DeliveryAdvertisingSourceDTO,
  DeliveryAdvertisingSourceInput,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryAdvertisingWorkbenchResolver {
  constructor(
    private readonly workbench: DeliveryAdvertisingWorkbenchService,
  ) {}
  @Query(() => DeliveryAdvertisingContextDTO)
  deliveryAdvertisingContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.workbench.context(workspace, memberId, userWorkspaceId);
  }

  @Query(() => DeliveryAdvertisingSourcesDTO)
  deliveryAdvertisingSources(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingSourcesInput,
  ) {
    return this.workbench.sources(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingSourceDTO)
  deliveryAdvertisingSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingSourceInput,
  ) {
    return this.workbench.source(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingReviewsDTO)
  deliveryAdvertisingReviews(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingReviewsInput,
  ) {
    return this.workbench.reviews(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingReviewDetailDTO)
  deliveryAdvertisingReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingReviewInput,
  ) {
    return this.workbench.review(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingReviewStateDTO)
  deliveryAdvertisingReviewState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingReviewInput,
  ) {
    return this.workbench.state(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingReceiptDTO)
  deliveryAdvertisingReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingReceiptInput,
  ) {
    return this.workbench.receipt(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingChoicesDTO)
  deliveryAdvertisingChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingChoicesInput,
  ) {
    return this.workbench.choices(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryAdvertisingObservationsDTO)
  deliveryAdvertisingObservations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAdvertisingObservationsInput,
  ) {
    return this.workbench.observations(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryAdvertisingWriteResultDTO)
  saveDeliveryAdvertisingReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: SaveDeliveryAdvertisingReviewInput,
  ) {
    return this.workbench.save(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryAdvertisingWriteResultDTO)
  assignDeliveryAdvertisingReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: AssignDeliveryAdvertisingReviewInput,
  ) {
    return this.workbench.assign(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryAdvertisingWriteResultDTO)
  observeDeliveryAdvertisingAction(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: ObserveDeliveryAdvertisingActionInput,
  ) {
    return this.workbench.observe(workspace, memberId, userWorkspaceId, input);
  }
}
