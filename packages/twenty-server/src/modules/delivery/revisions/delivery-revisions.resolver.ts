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
import { DeliveryRevisionsService } from 'src/modules/delivery/revisions/delivery-revisions.service';
import {
  DeliveryRevisionsDTO,
  DeliveryRevisionsInput,
  DeliveryRevisionSaveInput,
  DeliveryRevisionCostsDTO,
  DeliveryRevisionCostsInput,
} from 'src/modules/delivery/revisions/delivery-revisions.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryRevisionsResolver {
  constructor(private readonly revisions: DeliveryRevisionsService) {}
  @Query(() => DeliveryRevisionsDTO)
  deliveryRevisions(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryRevisionsInput,
  ) {
    return this.revisions.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => Boolean)
  saveDeliveryRevision(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryRevisionSaveInput,
  ) {
    return this.revisions.save(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryRevisionCostsDTO)
  deliveryRevisionCosts(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryRevisionCostsInput,
  ) {
    return this.revisions.costs(workspace, memberId, userWorkspaceId, input);
  }
}
