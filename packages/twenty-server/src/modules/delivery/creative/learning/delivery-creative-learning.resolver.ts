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
import { DeliveryCreativeLearningService } from './delivery-creative-learning.service';
import {
  DeliveryCreativeAdLinkChoicesDTO,
  DeliveryCreativeAdLinkChoicesInput,
  DeliveryCreativeAdLinkDTO,
  DeliveryCreativeAdLinkDecisionInput,
  DeliveryCreativeAdLinkPreviewDTO,
  DeliveryCreativeAdLinkPreviewInput,
  DeliveryCreativeAdLinkSaveInput,
  DeliveryCreativeAdLinkSelectionInput,
  DeliveryCreativeAdLinkStateDTO,
  DeliveryCreativeAdLinkStateInput,
  DeliveryCreativeAdLinksDTO,
  DeliveryCreativeAdLinksInput,
  DeliveryCreativeLearningReceiptDTO,
  DeliveryCreativeLearningReceiptInput,
  DeliveryCreativeLessonSaveInput,
  DeliveryCreativeLessonsDTO,
  DeliveryCreativeLessonsInput,
} from './delivery-creative-learning.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCreativeLearningResolver {
  constructor(private readonly learning: DeliveryCreativeLearningService) {}
  @Query(() => DeliveryCreativeAdLinkPreviewDTO)
  deliveryCreativeAdLinkPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkPreviewInput,
  ) {
    return this.learning.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeAdLinkChoicesDTO)
  deliveryCreativeAdLinkChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkChoicesInput,
  ) {
    return this.learning.choices(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeAdLinksDTO)
  deliveryCreativeAdLinks(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinksInput,
  ) {
    return this.learning.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeAdLinkDTO)
  deliveryCreativeAdLink(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkSelectionInput,
  ) {
    return this.learning.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeAdLinkStateDTO)
  deliveryCreativeAdLinkState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkStateInput,
  ) {
    return this.learning.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeLearningReceiptDTO)
  deliveryCreativeLearningReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeLearningReceiptInput,
  ) {
    return this.learning.receipt(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeLessonsDTO)
  deliveryCreativeLessons(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeLessonsInput,
  ) {
    return this.learning.lessons(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCreativeLearningReceiptDTO)
  saveDeliveryCreativeAdLink(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkSaveInput,
  ) {
    return this.learning.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCreativeLearningReceiptDTO)
  decideDeliveryCreativeAdLink(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeAdLinkDecisionInput,
  ) {
    return this.learning.decide(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCreativeLearningReceiptDTO)
  recordDeliveryCreativeLesson(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeLessonSaveInput,
  ) {
    return this.learning.recordLesson(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
