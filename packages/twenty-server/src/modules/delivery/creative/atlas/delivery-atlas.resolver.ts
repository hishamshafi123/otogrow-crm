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
import { DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import { DeliveryAtlasProductionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-production.service';
import { DeliveryAtlasService } from 'src/modules/delivery/creative/atlas/delivery-atlas.service';
import {
  DeliveryAtlasSettingsDTO,
  DeliveryAtlasSettingsInput,
  DeliveryAtlasRevisionInput,
  DeliveryAtlasProductionDTO,
  DeliveryAtlasProductionInput,
  DeliveryAtlasProductionAccessInput,
  DeliveryAtlasQuoteDTO,
  DeliveryAtlasQuoteInput,
  DeliveryAtlasRunDTO,
  DeliveryAtlasRunInput,
  DeliveryAtlasStartInput,
  DeliveryAtlasRunsDTO,
  DeliveryAtlasRunsInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryAtlasResolver {
  constructor(
    private readonly connections: DeliveryAtlasConnectionService,
    private readonly production: DeliveryAtlasProductionService,
    private readonly atlas: DeliveryAtlasService,
  ) {}
  @Query(() => DeliveryAtlasSettingsDTO)
  deliveryAtlasSettings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.connections.settings(workspace, memberId, userWorkspaceId);
  }
  @Mutation(() => DeliveryAtlasSettingsDTO)
  saveDeliveryAtlasSettings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasSettingsInput,
  ) {
    return this.connections.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasSettingsDTO)
  verifyDeliveryAtlasConnection(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRevisionInput,
  ) {
    return this.connections.verify(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasSettingsDTO)
  removeDeliveryAtlasConnection(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRevisionInput,
  ) {
    return this.connections.remove(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAtlasProductionDTO)
  deliveryAtlasProduction(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasProductionInput,
  ) {
    return this.production.read(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasProductionDTO)
  configureDeliveryAtlasProductionAccess(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasProductionAccessInput,
  ) {
    return this.production.configure(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryAtlasQuoteDTO)
  quoteDeliveryAtlasGeneration(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasQuoteInput,
  ) {
    return this.atlas.quote(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasRunDTO)
  startDeliveryAtlasGeneration(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasStartInput,
  ) {
    return this.atlas.start(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAtlasRunDTO)
  deliveryAtlasRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRunInput,
  ) {
    return this.atlas.run(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryAtlasRunsDTO)
  deliveryAtlasRuns(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRunsInput,
  ) {
    return this.atlas.runs(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasRunDTO)
  cancelDeliveryAtlasGeneration(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRunInput,
  ) {
    return this.atlas.cancel(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryAtlasRunDTO)
  resumeDeliveryAtlasGeneration(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryAtlasRunInput,
  ) {
    return this.atlas.resume(workspace, memberId, userWorkspaceId, input);
  }
}
