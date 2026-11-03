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
import { DeliveryAssistantsService } from 'src/modules/delivery/agents/reads/delivery-assistants.service';
import {
  DecideDeliveryAssistantInput,
  DeliveryAssistantCatalogDTO,
  DeliveryAssistantCatalogInput,
  DeliveryAssistantConfigurationDetailDTO,
  DeliveryAssistantContextDTO,
  DeliveryAssistantContextInput,
  DeliveryAssistantPreviewDTO,
  DeliveryAssistantRequestDTO,
  DeliveryAssistantRequestInput,
  DeliveryAssistantRunDetailDTO,
  DeliveryAssistantRunInput,
  DeliveryAssistantRunReceiptDTO,
  DeliveryAssistantRunsDTO,
  DeliveryAssistantRunsInput,
  DeliveryAssistantSaveReceiptDTO,
  DeliveryAssistantSelectionDTO,
  DeliveryAssistantSelectionInput,
  PreviewDeliveryAssistantInput,
  SaveDeliveryAssistantInput,
  StartDeliveryAssistantInput,
} from 'src/modules/delivery/agents/reads/delivery-assistants.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryAssistantsResolver {
  constructor(private readonly assistants: DeliveryAssistantsService) {}
  @Query(() => DeliveryAssistantContextDTO)
  deliveryAssistantContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantContextInput,
  ) {
    return this.assistants.context(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAssistantCatalogDTO)
  deliveryAssistantCatalog(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantCatalogInput,
  ) {
    return this.assistants.catalog(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAssistantSelectionDTO)
  deliveryAssistant(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantSelectionInput,
  ) {
    return this.assistants.assistant(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryAssistantConfigurationDetailDTO)
  deliveryAssistantConfiguration(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantSelectionInput,
  ) {
    return this.assistants.configuration(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryAssistantRunsDTO)
  deliveryAssistantRuns(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantRunsInput,
  ) {
    return this.assistants.runs(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAssistantRunDetailDTO)
  deliveryAssistantRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantRunInput,
  ) {
    return this.assistants.run(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAssistantRequestDTO)
  deliveryAssistantRequest(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantRequestInput,
  ) {
    return this.assistants.request(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAssistantSaveReceiptDTO)
  saveDeliveryAssistant(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: SaveDeliveryAssistantInput,
  ) {
    return this.assistants.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAssistantPreviewDTO)
  previewDeliveryAssistant(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: PreviewDeliveryAssistantInput,
  ) {
    return this.assistants.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAssistantRunReceiptDTO)
  startDeliveryAssistant(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: StartDeliveryAssistantInput,
  ) {
    return this.assistants.start(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAssistantRunReceiptDTO)
  cancelDeliveryAssistantRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAssistantRunInput,
  ) {
    return this.assistants.cancel(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAssistantRunReceiptDTO)
  decideDeliveryAssistantRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DecideDeliveryAssistantInput,
  ) {
    return this.assistants.decide(workspace, memberId, userWorkspaceId, input);
  }
}
