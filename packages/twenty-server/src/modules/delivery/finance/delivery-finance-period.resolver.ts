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
import { DeliveryFinancePeriodService } from 'src/modules/delivery/finance/delivery-finance-period.service';
import {
  DeliveryFinancePeriodChangeInput,
  DeliveryFinancePeriodChangeResultDTO,
  DeliveryFinancePeriodHistoryDTO,
  DeliveryFinancePeriodHistoryInput,
  DeliveryFinancePeriodInput,
  DeliveryFinancePeriodSnapshotDTO,
} from 'src/modules/delivery/finance/delivery-finance-period.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinancePeriodResolver {
  constructor(private readonly periods: DeliveryFinancePeriodService) {}
  @Query(() => DeliveryFinancePeriodSnapshotDTO)
  deliveryFinancePeriod(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePeriodInput,
  ) {
    return this.periods.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinancePeriodChangeResultDTO)
  changeDeliveryFinancePeriod(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePeriodChangeInput,
  ) {
    return this.periods.change(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinancePeriodHistoryDTO)
  deliveryFinancePeriodHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePeriodHistoryInput,
  ) {
    return this.periods.history(workspace, memberId, userWorkspaceId, input);
  }
}
