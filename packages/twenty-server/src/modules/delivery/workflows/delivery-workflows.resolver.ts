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
import { DeliveryWorkflowsService } from 'src/modules/delivery/workflows/delivery-workflows.service';
import {
  DeliveryWorkflowCatalogInput,
  DeliveryWorkflowCatalogDTO,
  DeliveryWorkflowSaveInput,
  DeliveryWorkflowArchiveInput,
  DeliveryTaskWorkflowInput,
  DeliveryTaskWorkflowDTO,
  DeliveryWorkflowApplyInput,
  DeliveryWorkflowProgressInput,
} from 'src/modules/delivery/workflows/delivery-workflows.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryWorkflowsResolver {
  constructor(private readonly workflows: DeliveryWorkflowsService) {}

  @Query(() => DeliveryWorkflowCatalogDTO)
  deliveryWorkflowCatalog(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryWorkflowCatalogInput,
  ) {
    return this.workflows.catalog(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryWorkflowCatalogDTO)
  saveDeliveryWorkflow(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryWorkflowSaveInput,
  ) {
    return this.workflows.save(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryWorkflowCatalogDTO)
  archiveDeliveryWorkflow(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryWorkflowArchiveInput,
  ) {
    return this.workflows.archive(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => DeliveryTaskWorkflowDTO)
  deliveryTaskWorkflow(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryTaskWorkflowInput,
  ) {
    return this.workflows.task(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryTaskWorkflowDTO)
  applyDeliveryWorkflow(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryWorkflowApplyInput,
  ) {
    return this.workflows.apply(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => DeliveryTaskWorkflowDTO)
  saveDeliveryWorkflowProgress(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryWorkflowProgressInput,
  ) {
    return this.workflows.progress(workspace, memberId, userWorkspaceId, input);
  }
}
