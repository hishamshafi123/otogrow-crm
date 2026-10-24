import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';

@Controller('portal/delivery-client-files')
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class DeliveryClientFilesController {
  constructor(
    private readonly clients: DeliveryClientsService,
    private readonly storage: FileStorageDriverFactory,
  ) {}

  @Get(':engagementId/:assetId')
  async download(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('engagementId') engagementId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ) {
    const { asset, path } = await this.clients.staffBrandAsset(
      workspace,
      memberId,
      userWorkspaceId,
      engagementId,
      assetId,
    );
    const stream = await this.storage
      .getCurrentDriver()
      .readFile({ filePath: path });
    response.set({
      'Content-Type': asset.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(stream, response);
  }
}
