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
import { DeliveryReleaseService } from './delivery-release.service';
import {
  DeliveryReleaseChoicesDTO,
  DeliveryReleaseChoicesInput,
  DeliveryReleaseDecisionInput,
  DeliveryReleaseDetailDTO,
  DeliveryReleaseListDTO,
  DeliveryReleaseListInput,
  DeliveryReleaseProjectsDTO,
  DeliveryReleasePreviewDTO,
  DeliveryReleaseProjectsInput,
  DeliveryReleaseReceiptDTO,
  DeliveryReleaseReceiptInput,
  DeliveryReleaseReceiptResultDTO,
  DeliveryReleaseSaveInput,
  DeliveryReleaseSelectionInput,
} from './delivery-release.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryReleaseResolver {
  constructor(private readonly releases: DeliveryReleaseService) {}
  @Query(() => DeliveryReleaseProjectsDTO)
  deliveryReleaseProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseProjectsInput,
  ) {
    return this.releases.projects(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReleaseListDTO)
  deliveryReleaseList(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseListInput,
  ) {
    return this.releases.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReleaseDetailDTO)
  deliveryReleaseDetail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseSelectionInput,
  ) {
    return this.releases.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReleaseChoicesDTO)
  deliveryReleaseChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseChoicesInput,
  ) {
    return this.releases.choices(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReleaseReceiptResultDTO)
  deliveryReleaseReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseReceiptInput,
  ) {
    return this.releases.receipt(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryReleasePreviewDTO)
  previewDeliveryRelease(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseSaveInput,
  ) {
    return this.releases.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryReleaseReceiptDTO)
  saveDeliveryRelease(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseSaveInput,
  ) {
    return this.releases.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryReleaseReceiptDTO)
  decideDeliveryRelease(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryReleaseDecisionInput,
  ) {
    return this.releases.decide(workspace, memberId, userWorkspaceId, input);
  }
}
