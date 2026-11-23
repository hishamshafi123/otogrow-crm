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
import { DeliveryCommitmentsService } from 'src/modules/delivery/commitments/delivery-commitments.service';
import {
  DeliveryCommitmentsDTO,
  DeliveryCommitmentEngagementsDTO,
  DeliveryCommitmentsInput,
  DeliveryCommitmentPeriodSaveInput,
  DeliveryCommitmentPeriodStateInput,
  DeliveryCommitmentLineSaveInput,
  DeliveryCommitmentTaskAssignInput,
  DeliveryCommitmentTaskRemoveInput,
  DeliveryCommitmentOrphanCleanupInput,
  DeliveryCommitmentOrphanCleanupResultDTO,
} from 'src/modules/delivery/commitments/delivery-commitments.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCommitmentsResolver {
  constructor(private readonly commitments: DeliveryCommitmentsService) {}

  @Mutation(() => DeliveryCommitmentOrphanCleanupResultDTO)
  cancelDeliveryOrphanCommitmentCleanup(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentOrphanCleanupInput,
  ) {
    return this.commitments.cancelOrphanCleanup(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentOrphanCleanupResultDTO)
  removeDeliveryOrphanCommitmentAllocation(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentOrphanCleanupInput,
  ) {
    return this.commitments.removeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Query(() => DeliveryCommitmentOrphanCleanupResultDTO)
  deliveryOrphanCommitmentCleanupReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentOrphanCleanupInput,
  ) {
    return this.commitments.orphanCleanupReceipt(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryCommitmentEngagementsDTO)
  deliveryCommitmentEngagements(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.commitments.engagements(workspace, memberId, userWorkspaceId);
  }

  @Query(() => DeliveryCommitmentsDTO)
  deliveryCommitments(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentsInput,
  ) {
    return this.commitments.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentsDTO)
  saveDeliveryCommitmentPeriod(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentPeriodSaveInput,
  ) {
    return this.commitments.savePeriod(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentsDTO)
  setDeliveryCommitmentPeriodState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentPeriodStateInput,
  ) {
    return this.commitments.setPeriodState(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentsDTO)
  saveDeliveryCommitmentLine(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentLineSaveInput,
  ) {
    return this.commitments.saveLine(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentsDTO)
  assignDeliveryCommitmentTask(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentTaskAssignInput,
  ) {
    return this.commitments.assignTask(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => DeliveryCommitmentsDTO)
  removeDeliveryCommitmentTask(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCommitmentTaskRemoveInput,
  ) {
    return this.commitments.removeTask(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
