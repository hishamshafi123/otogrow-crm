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
import { DeliveryFinanceForecastService } from 'src/modules/delivery/finance/delivery-finance-forecast.service';
import {
  DeliveryFinanceForecastAnchorInput,
  DeliveryFinanceForecastAnchorResultDTO,
  DeliveryFinanceForecastHistoryDTO,
  DeliveryFinanceForecastHistoryInput,
  DeliveryFinanceForecastInput,
  DeliveryFinanceForecastItemInput,
  DeliveryFinanceForecastItemResultDTO,
  DeliveryFinanceForecastRealizationResultDTO,
  DeliveryFinanceForecastRealizeInput,
  DeliveryFinanceForecastReverseInput,
  DeliveryFinanceForecastSnapshotDTO,
  DeliveryFinanceForecastSourcesDTO,
  DeliveryFinanceForecastSourcesInput,
} from 'src/modules/delivery/finance/delivery-finance-forecast.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceForecastResolver {
  constructor(private readonly forecasts: DeliveryFinanceForecastService) {}
  @Query(() => DeliveryFinanceForecastSnapshotDTO)
  deliveryFinanceForecast(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastInput,
  ) {
    return this.forecasts.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceForecastSourcesDTO)
  deliveryFinanceForecastSources(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastSourcesInput,
  ) {
    return this.forecasts.sources(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceForecastHistoryDTO)
  deliveryFinanceForecastHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastHistoryInput,
  ) {
    return this.forecasts.history(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceForecastAnchorResultDTO)
  saveDeliveryFinanceForecastAnchor(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastAnchorInput,
  ) {
    return this.forecasts.saveAnchor(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFinanceForecastItemResultDTO)
  saveDeliveryFinanceForecastItem(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastItemInput,
  ) {
    return this.forecasts.saveItem(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceForecastRealizationResultDTO)
  realizeDeliveryFinanceForecastOutflow(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastRealizeInput,
  ) {
    return this.forecasts.realize(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceForecastRealizationResultDTO)
  reverseDeliveryFinanceForecastRealization(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceForecastReverseInput,
  ) {
    return this.forecasts.reverseRealization(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
