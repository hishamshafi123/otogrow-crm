import {
  OtogrowAiSpendHistoryInput,
  OtogrowAiSpendHistoryDTO,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-spend-history.dto';
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
import {
  OtogrowAiBudgetSnapshotDTO,
  OtogrowAiBudgetSnapshotInput,
  OtogrowAiBudgetSaveInput,
  OtogrowAiPriceSaveInput,
  OtogrowAiSpendReconcileInput,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.dto';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class OtogrowAiBudgetResolver {
  constructor(private readonly budget: OtogrowAiBudgetService) {}

  @Query(() => OtogrowAiBudgetSnapshotDTO)
  otogrowAiBudgetSnapshot(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowAiBudgetSnapshotInput,
  ) {
    return this.budget.snapshot(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => OtogrowAiSpendHistoryDTO)
  otogrowAiSpendHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowAiSpendHistoryInput,
  ) {
    return this.budget.spendHistory(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => OtogrowAiBudgetSnapshotDTO)
  saveOtogrowAiBudget(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowAiBudgetSaveInput,
  ) {
    return this.budget.saveBudget(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => OtogrowAiBudgetSnapshotDTO)
  saveOtogrowAiPrice(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowAiPriceSaveInput,
  ) {
    return this.budget.savePrice(workspace, memberId, userWorkspaceId, input);
  }

  @Mutation(() => OtogrowAiBudgetSnapshotDTO)
  reconcileOtogrowAiSpend(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowAiSpendReconcileInput,
  ) {
    return this.budget.reconcile(workspace, memberId, userWorkspaceId, input);
  }
}
