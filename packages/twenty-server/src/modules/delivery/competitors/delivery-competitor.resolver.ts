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
import { DeliveryCompetitorService } from './delivery-competitor.service';
import {
  DeliveryCompetitorProjectsDTO,
  DeliveryCompetitorProjectsInput,
  DeliveryCompetitorSourcesDTO,
  DeliveryCompetitorSourcesInput,
  DeliveryCompetitorSourceChoicesDTO,
  DeliveryCompetitorSourceChoicesInput,
  DeliveryCompetitorSourceDTO,
  DeliveryCompetitorSourceSelectionInput,
  DeliveryCompetitorSourcePreviewDTO,
  DeliveryCompetitorSourceSaveInput,
  DeliveryCompetitorSourceReceiptDTO,
  DeliveryCompetitorSourceReceiptInput,
  DeliveryCompetitorSourceReceiptResultDTO,
  DeliveryCompetitorSourceChangeInput,
} from './delivery-competitor.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCompetitorResolver {
  constructor(private readonly competitors: DeliveryCompetitorService) {}
  @Query(() => DeliveryCompetitorProjectsDTO)
  deliveryCompetitorProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorProjectsInput,
  ) {
    return this.competitors.projects(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryCompetitorSourcesDTO)
  deliveryCompetitorSources(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourcesInput,
  ) {
    return this.competitors.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCompetitorSourceChoicesDTO)
  deliveryCompetitorSourceChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceChoicesInput,
  ) {
    return this.competitors.choices(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryCompetitorSourceDTO)
  deliveryCompetitorSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceSelectionInput,
  ) {
    return this.competitors.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCompetitorSourcePreviewDTO)
  previewDeliveryCompetitorSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceSaveInput,
  ) {
    return this.competitors.preview(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryCompetitorSourceReceiptResultDTO)
  deliveryCompetitorSourceReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceReceiptInput,
  ) {
    return this.competitors.receipt(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryCompetitorSourceReceiptDTO)
  saveDeliveryCompetitorSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceSaveInput,
  ) {
    return this.competitors.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryCompetitorSourceReceiptDTO)
  changeDeliveryCompetitorSourceState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCompetitorSourceChangeInput,
  ) {
    return this.competitors.changeState(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
