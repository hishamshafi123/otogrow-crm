import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryStudioService } from 'src/modules/delivery/studio/delivery-studio.service';
import { type StudioRoutingMode } from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';
import { type StudioProviderId } from 'src/modules/delivery/studio/delivery-studio-provider-router.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryStudioResolver {
  constructor(private readonly studio: DeliveryStudioService) {}

  @Query(() => GraphQLJSON)
  deliveryStudioWorkspace(
    @Args('companyId', { type: () => String, nullable: true })
    companyId?: string | null,
    @Args('projectId', { type: () => String, nullable: true })
    projectId?: string | null,
  ) {
    return this.studio.getStudioWorkspace(getWorkspaceAuthContext(), {
      companyId,
      projectId,
    });
  }

  @Query(() => GraphQLJSON)
  deliveryStudioProviderConfig() {
    return this.studio.getProviderConfig(getWorkspaceAuthContext());
  }

  @Query(() => GraphQLJSON, { nullable: true })
  deliveryStudioHookProject(
    @Args('assetId', { type: () => String }) assetId: string,
  ) {
    return this.studio.getHookProjectForStudioVideo(
      getWorkspaceAuthContext(),
      assetId,
    );
  }

  @Query(() => GraphQLJSON)
  deliveryStudioAgentCapabilities() {
    return this.studio.getAgentCapabilitiesManifest();
  }

  @Mutation(() => GraphQLJSON)
  saveDeliveryStudioProviderConfig(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.saveProviderConfig(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  testDeliveryStudioProviderKey(
    @Args('provider', { type: () => String }) provider: StudioProviderId,
    @Args('apiKey', { type: () => String, nullable: true })
    apiKey?: string | null,
  ) {
    return this.studio.testProviderConnection(
      getWorkspaceAuthContext(),
      provider,
      apiKey,
    );
  }

  @Mutation(() => GraphQLJSON)
  upsertDeliveryStudioPreset(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.upsertPreset(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  archiveDeliveryStudioPreset(
    @Args('id', { type: () => String }) id: string,
  ) {
    return this.studio.archivePreset(getWorkspaceAuthContext(), id);
  }

  @Mutation(() => GraphQLJSON)
  archiveDeliveryStudioReferenceVideo(
    @Args('id', { type: () => String }) id: string,
  ) {
    return this.studio.archiveReferenceVideo(getWorkspaceAuthContext(), id);
  }

  @Mutation(() => GraphQLJSON)
  upsertDeliveryStudioProductKit(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.upsertProductKit(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  removeDeliveryStudioProductKitAsset(
    @Args('productKitId', { type: () => String }) productKitId: string,
    @Args('assetId', { type: () => String }) assetId: string,
  ) {
    return this.studio.removeProductKitAsset(
      getWorkspaceAuthContext(),
      productKitId,
      assetId,
    );
  }

  @Mutation(() => GraphQLJSON)
  archiveDeliveryStudioProductKit(
    @Args('id', { type: () => String }) id: string,
  ) {
    return this.studio.archiveProductKit(getWorkspaceAuthContext(), id);
  }

  @Mutation(() => GraphQLJSON)
  generateDeliveryStudioCharacterSheet(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.queueCharacterSheetGeneration(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  generateDeliveryStudioVideo(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.queueVideoGeneration(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  batchGenerateDeliveryStudioVideos(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.queueBatchVideoGeneration(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  retryDeliveryStudioJob(
    @Args('jobId', { type: () => String }) jobId: string,
    @Args('routingMode', { type: () => String, nullable: true })
    routingMode?: StudioRoutingMode,
  ) {
    return this.studio.retryJob(
      getWorkspaceAuthContext(),
      jobId,
      routingMode,
    );
  }

  @Mutation(() => GraphQLJSON)
  cancelDeliveryStudioJob(
    @Args('jobId', { type: () => String }) jobId: string,
  ) {
    return this.studio.cancelJob(getWorkspaceAuthContext(), jobId);
  }

  @Mutation(() => GraphQLJSON)
  setDeliveryStudioAssetApproved(
    @Args('assetId', { type: () => String }) assetId: string,
    @Args('approved', { type: () => Boolean }) approved: boolean,
  ) {
    return this.studio.setAssetApproved(
      getWorkspaceAuthContext(),
      assetId,
      approved,
    );
  }

  @Mutation(() => GraphQLJSON)
  archiveDeliveryStudioAsset(
    @Args('assetId', { type: () => String }) assetId: string,
  ) {
    return this.studio.archiveAsset(getWorkspaceAuthContext(), assetId);
  }

  @Query(() => GraphQLJSON)
  deliveryStudioClientDriveFolders(
    @Args('companyId', { type: () => String }) companyId: string,
  ) {
    return this.studio.getClientDriveFolders(
      getWorkspaceAuthContext(),
      companyId,
    );
  }

  @Mutation(() => GraphQLJSON)
  importDeliveryStudioProductFromUrl(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.importProductFromUrl(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  updateDeliveryStudioProductAssets(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.updateProductAssets(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  suggestDeliveryStudioVideoHooks(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.suggestHooksForVideo(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  renderDeliveryStudioVideoHooks(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.renderSelectedHooksForVideo(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  saveDeliveryStudioVideoToDrive(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.saveVideoToDrive(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  saveDeliveryStudioHookDefault(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.studio.saveHookDefault(getWorkspaceAuthContext(), input);
  }
}
