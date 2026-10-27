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
import { DeliveryBatchesService } from 'src/modules/delivery/batches/delivery-batches.service';
import {
  DeliveryBatchesDTO,
  DeliveryBatchesInput,
  DeliveryBatchSaveInput,
  DeliveryBatchStateInput,
  DeliveryBatchItemInput,
} from 'src/modules/delivery/batches/delivery-batches.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryBatchesResolver {
  constructor(private readonly batches: DeliveryBatchesService) {}
  @Query(() => DeliveryBatchesDTO)
  deliveryBatches(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryBatchesInput,
  ) {
    return this.batches.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryBatchesDTO)
  saveDeliveryBatch(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryBatchSaveInput,
  ) {
    return this.batches.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryBatchesDTO)
  setDeliveryBatchState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryBatchStateInput,
  ) {
    return this.batches.state(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryBatchesDTO)
  saveDeliveryBatchItem(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryBatchItemInput,
  ) {
    return this.batches.item(workspace, memberId, userWorkspaceId, input);
  }
}
