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
import { DeliveryContentService } from './delivery-content.service';
import {
  DeliveryContentAccountSaveInput,
  DeliveryContentAssetChoicesDTO,
  DeliveryContentAssetChoicesInput,
  DeliveryContentCalendarDTO,
  DeliveryContentCalendarInput,
  DeliveryContentDecisionInput,
  DeliveryContentDetailDTO,
  DeliveryContentListDTO,
  DeliveryContentListInput,
  DeliveryContentPlanSaveInput,
  DeliveryContentPlansDTO,
  DeliveryContentPlansInput,
  DeliveryContentPreviewDTO,
  DeliveryContentProjectChoicesDTO,
  DeliveryContentProjectChoicesInput,
  DeliveryContentProjectsDTO,
  DeliveryContentProjectsInput,
  DeliveryContentReceiptDTO,
  DeliveryContentReceiptInput,
  DeliveryContentReceiptResultDTO,
  DeliveryContentSaveInput,
  DeliveryContentSelectionInput,
} from './delivery-content.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryContentResolver {
  constructor(private readonly content: DeliveryContentService) {}
  @Query(() => DeliveryContentProjectsDTO)
  deliveryContentProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentProjectsInput,
  ) {
    return this.content.projects(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentProjectChoicesDTO)
  deliveryContentProjectChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentProjectChoicesInput,
  ) {
    return this.content.projectChoices(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryContentPlansDTO)
  deliveryContentPlans(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentPlansInput,
  ) {
    return this.content.plans(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentListDTO)
  deliveryContentList(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentListInput,
  ) {
    return this.content.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentCalendarDTO)
  deliveryContentCalendar(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentCalendarInput,
  ) {
    return this.content.calendar(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentAssetChoicesDTO)
  deliveryContentAssetChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentAssetChoicesInput,
  ) {
    return this.content.assetChoices(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryContentDetailDTO)
  deliveryContentDetail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentSelectionInput,
  ) {
    return this.content.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentReceiptResultDTO)
  deliveryContentReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentReceiptInput,
  ) {
    return this.content.receipt(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryContentPreviewDTO)
  previewDeliveryContent(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentSaveInput,
  ) {
    return this.content.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryContentReceiptDTO)
  saveDeliveryContentAccount(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentAccountSaveInput,
  ) {
    return this.content.saveAccount(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryContentReceiptDTO)
  saveDeliveryContentPlan(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentPlanSaveInput,
  ) {
    return this.content.savePlan(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryContentReceiptDTO)
  saveDeliveryContent(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentSaveInput,
  ) {
    return this.content.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryContentReceiptDTO)
  decideDeliveryContent(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryContentDecisionInput,
  ) {
    return this.content.decide(workspace, memberId, userWorkspaceId, input);
  }
}
