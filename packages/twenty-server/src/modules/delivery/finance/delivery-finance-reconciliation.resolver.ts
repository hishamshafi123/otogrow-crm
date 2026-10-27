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
import { DeliveryFinanceReconciliationService } from 'src/modules/delivery/finance/delivery-finance-reconciliation.service';
import {
  DeliveryFinancePaymentsSnapshotDTO,
  DeliveryFinancePaymentsInput,
  DeliveryFinancePaymentInput,
  DeliveryFinanceSettlementInput,
  DeliveryFinanceCashMatchInput,
  DeliveryFinanceReverseRelationInput,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceReconciliationResolver {
  constructor(
    private readonly reconciliation: DeliveryFinanceReconciliationService,
  ) {}
  @Query(() => DeliveryFinancePaymentsSnapshotDTO)
  deliveryFinancePayments(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePaymentsInput,
  ) {
    return this.reconciliation.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => String)
  recordDeliveryFinancePayment(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinancePaymentInput,
  ) {
    return this.reconciliation.recordPayment(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => String)
  settleDeliveryFinanceReceivable(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceSettlementInput,
  ) {
    return this.reconciliation.settleReceivable(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => String)
  matchDeliveryFinanceCash(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceCashMatchInput,
  ) {
    return this.reconciliation.matchCash(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => String)
  reverseDeliveryFinanceRelation(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceReverseRelationInput,
  ) {
    return this.reconciliation.reverseRelation(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
