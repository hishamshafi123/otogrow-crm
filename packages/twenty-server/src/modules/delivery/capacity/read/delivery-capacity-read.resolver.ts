import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryCapacityReadService } from 'src/modules/delivery/capacity/read/delivery-capacity-read.service';
import {
  DeliveryCapacitySummaryDTO,
  DeliveryCapacitySummaryInput,
  DeliveryCapacityAssignmentsDTO,
  DeliveryCapacityAssignmentsInput,
} from 'src/modules/delivery/capacity/read/delivery-capacity-read.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCapacityReadResolver {
  constructor(private readonly capacity: DeliveryCapacityReadService) {}
  @Query(() => DeliveryCapacitySummaryDTO)
  deliveryCapacitySummary(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCapacitySummaryInput,
  ) {
    return this.capacity.summary(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCapacityAssignmentsDTO)
  deliveryCapacityAssignments(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCapacityAssignmentsInput,
  ) {
    return this.capacity.assignments(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
