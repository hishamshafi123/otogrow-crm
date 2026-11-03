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
import { DeliveryFinanceExportService } from 'src/modules/delivery/finance/export/delivery-finance-export.service';
import {
  DeliveryFinanceExportBatchInput,
  DeliveryFinanceExportBatchResultDTO,
  DeliveryFinanceExportDownloadDTO,
  DeliveryFinanceExportDownloadInput,
  DeliveryFinanceExportHistoryDTO,
  DeliveryFinanceExportHistoryInput,
  DeliveryFinanceExportImportStatusInput,
  DeliveryFinanceExportPreviewDTO,
  DeliveryFinanceExportPreviewInput,
  DeliveryFinanceExportProfileInput,
  DeliveryFinanceExportProfileResultDTO,
  DeliveryFinanceExportsDTO,
  DeliveryFinanceExportsInput,
} from 'src/modules/delivery/finance/export/delivery-finance-export.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceExportResolver {
  constructor(private readonly exports: DeliveryFinanceExportService) {}
  @Query(() => DeliveryFinanceExportsDTO)
  deliveryFinanceExports(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportsInput,
  ) {
    return this.exports.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceExportPreviewDTO)
  deliveryFinanceExportPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportPreviewInput,
  ) {
    return this.exports.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceExportDownloadDTO)
  deliveryFinanceExportDownload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportDownloadInput,
  ) {
    return this.exports.download(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryFinanceExportHistoryDTO)
  deliveryFinanceExportHistory(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportHistoryInput,
  ) {
    return this.exports.history(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFinanceExportProfileResultDTO)
  saveDeliveryFinanceExportProfile(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportProfileInput,
  ) {
    return this.exports.saveProfile(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFinanceExportBatchResultDTO)
  createDeliveryFinanceExportBatch(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportBatchInput,
  ) {
    return this.exports.createBatch(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFinanceExportBatchResultDTO)
  changeDeliveryFinanceExportImportStatus(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFinanceExportImportStatusInput,
  ) {
    return this.exports.changeImportStatus(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
}
