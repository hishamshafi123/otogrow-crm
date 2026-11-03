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
import { DeliveryFounderEscalationService } from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.service';
import {
  DeliveryFounderEscalationsInput,
  DeliveryFounderEscalationsSnapshotDTO,
  DeliveryFounderEscalationRuleDraftInput,
  DeliveryFounderEscalationPreviewDTO,
  DeliveryFounderEscalationRuleSaveInput,
  DeliveryFounderEscalationRuleResultDTO,
  DeliveryFounderEscalationRuleStateInput,
  DeliveryFounderEscalationAcknowledgeInput,
  DeliveryFounderEscalationEpisodeResultDTO,
} from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFounderEscalationResolver {
  constructor(private readonly escalation: DeliveryFounderEscalationService) {}
  @Query(() => DeliveryFounderEscalationsSnapshotDTO)
  deliveryFounderEscalations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderEscalationsInput,
  ) {
    return this.escalation.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryFounderEscalationPreviewDTO)
  previewDeliveryFounderEscalationRule(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderEscalationRuleDraftInput,
  ) {
    return this.escalation.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFounderEscalationRuleResultDTO)
  saveDeliveryFounderEscalationRule(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderEscalationRuleSaveInput,
  ) {
    return this.escalation.saveRule(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFounderEscalationRuleResultDTO)
  changeDeliveryFounderEscalationRule(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderEscalationRuleStateInput,
  ) {
    return this.escalation.changeRule(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFounderEscalationEpisodeResultDTO)
  acknowledgeDeliveryFounderEscalation(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFounderEscalationAcknowledgeInput,
  ) {
    return this.escalation.acknowledge(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
