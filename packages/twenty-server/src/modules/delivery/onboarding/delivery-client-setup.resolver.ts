import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryClientSetupService } from 'src/modules/delivery/onboarding/delivery-client-setup.service';
import {
  DeliveryClientServiceCatalogDTO,
  DeliveryClientSetupContextDTO,
  DeliveryClientSetupContextInput,
  DeliveryClientSetupCreateInput,
  DeliveryClientSetupReceiptDTO,
  DeliveryClientSetupReceiptInput,
} from 'src/modules/delivery/onboarding/delivery-client-setup.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryClientSetupResolver {
  constructor(private readonly setup: DeliveryClientSetupService) {}
  @Query(() => DeliveryClientServiceCatalogDTO)
  deliveryClientServiceCatalog() {
    return this.setup.serviceCatalog(getWorkspaceAuthContext());
  }
  @Mutation(() => DeliveryClientServiceCatalogDTO)
  addDeliveryClientService(@Args('name') name: string) {
    return this.setup.addService(getWorkspaceAuthContext(), name);
  }
  @Query(() => DeliveryClientSetupContextDTO)
  deliveryClientSetup(@Args('input') input: DeliveryClientSetupContextInput) {
    return this.setup.context(getWorkspaceAuthContext(), input);
  }
  @Mutation(() => DeliveryClientSetupReceiptDTO)
  createDeliveryClientSetup(
    @Args('input') input: DeliveryClientSetupCreateInput,
  ) {
    return this.setup.create(getWorkspaceAuthContext(), input);
  }
  @Query(() => DeliveryClientSetupReceiptDTO, { nullable: true })
  deliveryClientSetupReceipt(
    @Args('input') input: DeliveryClientSetupReceiptInput,
  ) {
    return this.setup.receipt(getWorkspaceAuthContext(), input);
  }
}
