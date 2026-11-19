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
import {
  DeliveryFounderPerformanceInput,
  DeliveryFounderPerformanceSnapshotDTO,
} from 'src/modules/delivery/founder/performance/delivery-founder-performance.dto';
import { DeliveryFounderPerformanceService } from 'src/modules/delivery/founder/performance/delivery-founder-performance.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFounderPerformanceResolver {
  constructor(
    private readonly performance: DeliveryFounderPerformanceService,
  ) {}

  @Query(() => DeliveryFounderPerformanceSnapshotDTO)
  deliveryFounderPerformance(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderPerformanceInput,
  ) {
    return this.performance.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
