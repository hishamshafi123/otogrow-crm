import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryClientPortalAccessService } from 'src/modules/delivery/deliverables/delivery-client-portal-access.service';
import { DeliveryDeliverablesService } from 'src/modules/delivery/deliverables/delivery-deliverables.service';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import { DeliveryVideoHooksService } from 'src/modules/delivery/deliverables/delivery-video-hooks.service';
import { DeliveryVpsCleanupService } from 'src/modules/delivery/deliverables/delivery-vps-cleanup.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryDeliverablesResolver {
  constructor(
    private readonly deliverables: DeliveryDeliverablesService,
    private readonly portalAccess: DeliveryClientPortalAccessService,
    private readonly driveService: DeliveryDriveService,
    private readonly vpsCleanup: DeliveryVpsCleanupService,
    private readonly videoHooks: DeliveryVideoHooksService,
  ) {}

  @Query(() => GraphQLJSON)
  deliveryDeliverables(
    @Args('filter', { type: () => GraphQLJSON, nullable: true })
    filter?: unknown,
  ) {
    return this.deliverables.list(getWorkspaceAuthContext(), filter);
  }

  @Query(() => GraphQLJSON)
  deliveryDeliverable(@Args('id', { type: () => String }) id: string) {
    return this.deliverables.read(getWorkspaceAuthContext(), id);
  }

  @Mutation(() => GraphQLJSON)
  createDeliveryLinkDeliverable(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.deliverables.createLinkDeliverable(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  updateDeliveryDeliverable(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.deliverables.update(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  reviewDeliveryDeliverable(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.deliverables.addStaffReview(getWorkspaceAuthContext(), input);
  }

  @Query(() => GraphQLJSON, { nullable: true })
  deliveryClientPortalAccess(
    @Args('companyId', { type: () => String }) companyId: string,
  ) {
    return this.portalAccess.getForCompany(
      getWorkspaceAuthContext(),
      companyId,
    );
  }

  @Query(() => GraphQLJSON)
  deliveryClientPortalAccessList() {
    return this.portalAccess.listForWorkspace(getWorkspaceAuthContext());
  }

  @Mutation(() => GraphQLJSON)
  manageDeliveryClientPortalAccess(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.portalAccess.manage(getWorkspaceAuthContext(), input);
  }

  @Query(() => GraphQLJSON)
  deliveryDriveConfig() {
    return this.driveService.getConfig(getWorkspaceAuthContext());
  }

  @Query(() => GraphQLJSON)
  deliveryDriveFolders(
    @Args('parentId', { type: () => String, nullable: true })
    parentId?: string | null,
    @Args('search', { type: () => String, nullable: true })
    search?: string | null,
  ) {
    return this.driveService.listFolders(
      getWorkspaceAuthContext(),
      parentId,
      search,
    );
  }

  @Mutation(() => GraphQLJSON)
  startDeliveryDriveOAuth(
    @Args('returnTo', { type: () => String, nullable: true })
    returnTo?: string,
  ) {
    return this.driveService.startOAuth(getWorkspaceAuthContext(), returnTo);
  }

  @Mutation(() => GraphQLJSON)
  updateDeliveryDriveSettings(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.driveService.updateSettings(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  disconnectDeliveryDrive() {
    return this.driveService.disconnect(getWorkspaceAuthContext());
  }

  @Mutation(() => GraphQLJSON)
  createDeliveryDriveFolder(
    @Args('name', { type: () => String }) name: string,
    @Args('parentId', { type: () => String, nullable: true })
    parentId?: string | null,
  ) {
    return this.driveService.createFolder(
      getWorkspaceAuthContext(),
      name,
      parentId,
    );
  }

  @Mutation(() => GraphQLJSON)
  bindDeliveryClientDriveFolder(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.driveService.bindClientFolder(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  syncDeliveryDeliverableToDrive(
    @Args('deliverableId', { type: () => String }) deliverableId: string,
  ) {
    return this.driveService.requestDeliverableSync(
      getWorkspaceAuthContext(),
      deliverableId,
    );
  }

  @Mutation(() => GraphQLJSON)
  runDeliveryVpsCleanup(
    @Args('dryRun', { type: () => Boolean, nullable: true }) dryRun?: boolean,
  ) {
    return this.vpsCleanup.runManualCleanup(
      getWorkspaceAuthContext(),
      Boolean(dryRun),
    );
  }

  @Query(() => GraphQLJSON)
  deliveryHookProject(
    @Args('deliverableId', { type: () => String }) deliverableId: string,
  ) {
    return this.videoHooks.getOrCreateProject(
      getWorkspaceAuthContext(),
      deliverableId,
    );
  }

  @Mutation(() => GraphQLJSON)
  analyzeDeliveryHookContext(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.videoHooks.analyzeContext(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  generateDeliveryHookSuggestions(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.videoHooks.generateSuggestions(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  saveDeliveryHookProject(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.videoHooks.saveProject(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  queueDeliveryHookRender(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.videoHooks.queueRender(getWorkspaceAuthContext(), input);
  }

  @Mutation(() => GraphQLJSON)
  publishDeliveryHookVariations(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.videoHooks.publishVariations(getWorkspaceAuthContext(), input);
  }

  @Query(() => GraphQLJSON)
  deliveryContentMetricSnapshots(
    @Args('filter', { type: () => GraphQLJSON, nullable: true })
    filter?: unknown,
  ) {
    return this.deliverables.listContentMetricSnapshots(
      getWorkspaceAuthContext(),
      filter,
    );
  }

  @Mutation(() => GraphQLJSON)
  upsertDeliveryContentMetricSnapshot(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.deliverables.upsertContentMetricSnapshot(
      getWorkspaceAuthContext(),
      input,
    );
  }

  @Mutation(() => GraphQLJSON)
  deleteDeliveryContentMetricSnapshot(
    @Args('id', { type: () => String }) id: string,
  ) {
    return this.deliverables.deleteContentMetricSnapshot(
      getWorkspaceAuthContext(),
      id,
    );
  }
}
