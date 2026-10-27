import { UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryReadinessService } from 'src/modules/delivery/readiness/delivery-readiness.service';
import { DeliveryReadinessSnapshotDTO } from 'src/modules/delivery/readiness/delivery-readiness.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryReadinessResolver {
  constructor(private readonly readiness: DeliveryReadinessService) {}
  @Query(() => DeliveryReadinessSnapshotDTO)
  deliveryReadiness(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.readiness.snapshot(workspace, memberId, userWorkspaceId);
  }
}
