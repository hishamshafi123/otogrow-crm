import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryHandoffsService } from 'src/modules/delivery/handoffs/delivery-handoffs.service';
import {
  DeliveryHandoffCreateInput,
  DeliveryHandoffDirectoryDTO,
  DeliveryHandoffDTO,
  DeliveryHandoffPreviewDTO,
  DeliveryHandoffPreviewInput,
} from 'src/modules/delivery/handoffs/delivery-handoffs.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryHandoffsResolver {
  constructor(private readonly handoffs: DeliveryHandoffsService) {}
  @Query(() => DeliveryHandoffDirectoryDTO)
  deliveryHandoffs(@Args('search', { nullable: true }) search?: string) {
    return this.handoffs.directory(getWorkspaceAuthContext(), search);
  }
  @Query(() => DeliveryHandoffPreviewDTO)
  deliveryHandoffPreview(@Args('input') input: DeliveryHandoffPreviewInput) {
    return this.handoffs.preview(getWorkspaceAuthContext(), input);
  }
  @Mutation(() => DeliveryHandoffDTO)
  createDeliveryHandoff(@Args('input') input: DeliveryHandoffCreateInput) {
    return this.handoffs.create(getWorkspaceAuthContext(), input);
  }
}
