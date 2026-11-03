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
  DeliveryReviewAssignmentHistoryDTO,
  DeliveryReviewAssignmentHistoryInput,
  DeliveryReviewAssignmentInput,
  DeliveryReviewAssignmentResultDTO,
  DeliveryReviewQueueInput,
  DeliveryReviewQueueSnapshotDTO,
  DeliveryTaskReviewInput,
  DeliveryTaskReviewSnapshotDTO,
  DeliveryReviewAssignmentSeenInput,
  DeliveryReviewAssignmentAcknowledgeInput,
  DeliveryReviewAssignmentAcknowledgementDTO,
} from 'src/modules/delivery/reviews/delivery-reviews.dto';
import { DeliveryReviewsService } from 'src/modules/delivery/reviews/delivery-reviews.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryReviewsResolver {
  constructor(private readonly reviews: DeliveryReviewsService) {}
  @Mutation(() => DeliveryReviewAssignmentAcknowledgementDTO)
  acknowledgeDeliveryReviewAssignment(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReviewAssignmentAcknowledgeInput,
  ) {
    return this.reviews.acknowledge(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryTaskReviewSnapshotDTO)
  seeDeliveryReviewAssignment(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReviewAssignmentSeenInput,
  ) {
    return this.reviews.seen(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReviewQueueSnapshotDTO)
  deliveryReviewQueue(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReviewQueueInput,
  ) {
    return this.reviews.queue(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryTaskReviewSnapshotDTO)
  deliveryTaskReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskReviewInput,
  ) {
    return this.reviews.task(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReviewAssignmentHistoryDTO)
  deliveryReviewAssignmentHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReviewAssignmentHistoryInput,
  ) {
    return this.reviews.history(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryReviewAssignmentResultDTO)
  assignDeliveryReview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReviewAssignmentInput,
  ) {
    return this.reviews.assign(workspace, memberId, userWorkspaceId, input);
  }
}
