import { DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DeliveryMediaService } from 'src/modules/delivery/creative/delivery-media.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryResolver {
  constructor(
    private readonly service: DeliveryService,
    private readonly meta: DeliveryMetaService,
    private readonly business: DeliveryBusinessService,
    private readonly clients: DeliveryClientsService,
    private readonly agents: DeliveryAgentService,
    private readonly creative: DeliveryCreativeService,
    private readonly media: DeliveryMediaService,
    private readonly operations: DeliveryOperationsService,
  ) {}

  @Query(() => GraphQLJSON)
  deliveryMeta(
    @Args('input', { type: () => GraphQLJSON, nullable: true }) input: unknown,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.meta.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input ?? {},
    );
  }
  @Query(() => GraphQLJSON)
  deliveryMetaReport(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.meta.report(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => GraphQLJSON)
  changeDeliveryMeta(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.meta.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryBusiness(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.business.snapshot(workspace, memberId, userWorkspaceId);
  }
  @Mutation(() => GraphQLJSON)
  changeDeliveryBusiness(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.business.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryClients(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.clients.snapshot(workspace, memberId, userWorkspaceId);
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryClients(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.clients.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryOperations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.operations.snapshot(workspace, memberId, userWorkspaceId);
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryOperations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.operations.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryMediaModels(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('taskId') taskId: string,
  ) {
    return this.media.models(workspace, memberId, userWorkspaceId, taskId);
  }
  @Mutation(() => GraphQLJSON)
  changeDeliveryMedia(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.media.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryCreative(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('taskId') taskId: string,
  ) {
    return this.creative.read(workspace, memberId, userWorkspaceId, taskId);
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryCreative(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.creative.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryAgents(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.agents.snapshot(workspace, memberId, userWorkspaceId);
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryAgents(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.agents.command(workspace, memberId, userWorkspaceId, input);
  }

  @Query(() => GraphQLJSON)
  deliveryWorkspace(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.service.snapshot(workspace, memberId, userWorkspaceId);
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryWorkspace(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.service.command(workspace, memberId, userWorkspaceId, input);
  }
}
