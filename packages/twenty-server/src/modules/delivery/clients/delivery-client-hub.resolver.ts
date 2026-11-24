import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryClientHubService } from 'src/modules/delivery/clients/delivery-client-hub.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryClientHubResolver {
  constructor(private readonly clientHub: DeliveryClientHubService) {}

  @Query(() => GraphQLJSON)
  deliveryClientHub() {
    return this.clientHub.hub(getWorkspaceAuthContext());
  }

  @Query(() => GraphQLJSON)
  deliveryClientDirectoryCandidates(
    @Args('search', { type: () => String, nullable: true }) search?: string,
  ) {
    return this.clientHub.directoryCandidates(
      getWorkspaceAuthContext(),
      search ?? '',
    );
  }

  @Mutation(() => GraphQLJSON)
  updateDeliveryClientRoster(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.clientHub.updateRoster(getWorkspaceAuthContext(), input);
  }
}
