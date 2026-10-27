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
import { DeliveryFinanceService } from 'src/modules/delivery/finance/delivery-finance.service';
import {
  DeliveryFinanceInput,
  DeliveryFinancePlanInput,
  DeliveryFinanceEntryInput,
  DeliveryFinancePostInput,
  DeliveryFinanceVoidInput,
  DeliveryFinancePrepareInput,
  DeliveryFinanceHistoryInput,
  DeliveryFinanceSnapshotDTO,
  DeliveryFinancePreparationDTO,
  DeliveryFinanceHistoryDTO,
} from 'src/modules/delivery/finance/delivery-finance.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceResolver {
  constructor(private readonly finance: DeliveryFinanceService) {}
  @Query(() => DeliveryFinanceSnapshotDTO)
  deliveryFinance(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceInput,
  ) {
    return this.finance.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceHistoryDTO)
  deliveryFinanceEntryHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceHistoryInput,
  ) {
    return this.finance.history(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  saveDeliveryFinancePlan(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePlanInput,
  ) {
    return this.finance.savePlan(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinancePreparationDTO)
  prepareDeliveryFinanceMonth(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePrepareInput,
  ) {
    return this.finance.prepareMonth(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => String)
  saveDeliveryFinanceEntry(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceEntryInput,
  ) {
    return this.finance.saveEntry(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  postDeliveryFinanceEntry(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePostInput,
  ) {
    return this.finance.postEntry(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  voidDeliveryFinanceEntry(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceVoidInput,
  ) {
    return this.finance.voidEntry(workspace, memberId, userWorkspaceId, input);
  }
}
