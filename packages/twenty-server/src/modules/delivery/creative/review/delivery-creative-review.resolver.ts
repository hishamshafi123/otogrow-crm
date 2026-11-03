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
  DeliveryCreativeFeedbackChangeInput,
  DeliveryCreativeFeedbackCreateInput,
  DeliveryCreativeFeedbackHistoryDTO,
  DeliveryCreativeFeedbackHistoryInput,
  DeliveryCreativeFeedbackResultDTO,
  DeliveryCreativeReviewInput,
  DeliveryCreativeReviewSnapshotDTO,
} from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
import { DeliveryCreativeReviewService } from 'src/modules/delivery/creative/review/delivery-creative-review.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCreativeReviewResolver {
  constructor(private readonly review: DeliveryCreativeReviewService) {}
  @Query(() => DeliveryCreativeReviewSnapshotDTO)
  deliveryCreativeReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeReviewInput,
  ) {
    return this.review.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeFeedbackHistoryDTO)
  deliveryCreativeFeedbackHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeFeedbackHistoryInput,
  ) {
    return this.review.history(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCreativeFeedbackResultDTO)
  createDeliveryCreativeFeedback(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeFeedbackCreateInput,
  ) {
    return this.review.create(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCreativeFeedbackResultDTO)
  changeDeliveryCreativeFeedback(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeFeedbackChangeInput,
  ) {
    return this.review.change(workspace, memberId, userWorkspaceId, input);
  }
}
