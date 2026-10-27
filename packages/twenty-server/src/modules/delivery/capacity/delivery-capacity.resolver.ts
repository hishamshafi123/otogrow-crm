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
import { DeliveryCapacityService } from 'src/modules/delivery/capacity/delivery-capacity.service';
import {
  DeliveryCapacityDTO,
  DeliveryCapacityInput,
  DeliveryAvailabilityDTO,
  DeliveryAvailabilityInput,
} from 'src/modules/delivery/capacity/delivery-capacity.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCapacityResolver {
  constructor(private readonly capacity: DeliveryCapacityService) {}
  @Query(() => DeliveryCapacityDTO)
  deliveryCapacity(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCapacityInput,
  ) {
    return this.capacity.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAvailabilityDTO)
  saveDeliveryAvailability(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAvailabilityInput,
  ) {
    return this.capacity.save(workspace, memberId, userWorkspaceId, input);
  }
}
