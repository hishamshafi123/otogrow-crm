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
import { DeliveryFinanceAiCostService } from 'src/modules/delivery/finance/delivery-finance-ai-cost.service';
import {
  DeliveryFinanceAiCostPostInput,
  DeliveryFinanceAiCostPrepareInput,
  DeliveryFinanceAiCostResultDTO,
  DeliveryFinanceAiCostsInput,
  DeliveryFinanceAiCostsSnapshotDTO,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceAiCostResolver {
  constructor(private readonly finance: DeliveryFinanceAiCostService) {}
  @Query(() => DeliveryFinanceAiCostsSnapshotDTO)
  deliveryFinanceAiCosts(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceAiCostsInput,
  ) {
    return this.finance.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceAiCostResultDTO)
  prepareDeliveryFinanceAiCost(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceAiCostPrepareInput,
  ) {
    return this.finance.prepare(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceAiCostResultDTO)
  postDeliveryFinanceAiCost(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceAiCostPostInput,
  ) {
    return this.finance.post(workspace, memberId, userWorkspaceId, input);
  }
}
