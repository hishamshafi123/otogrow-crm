import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryStudioService } from 'src/modules/delivery/studio/delivery-studio.service';
import { type StudioRoutingMode } from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';

/**
 * Agentic-First REST API Surface for Otogrow AI Studio.
 * Designed so internal Otogrow assistants or external AI agents can discover
 * capabilities and programmatically run the entire creative pipeline end-to-end:
 *   capabilities -> workspace -> presets / product kits -> character sheets ->
 *   single or batch AI videos -> video-assessed N text hooks -> FFmpeg render & Google Drive sync.
 */
@Controller('portal/delivery-studio/agent')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryStudioAgentController {
  constructor(private readonly studio: DeliveryStudioService) {}

  @Get('capabilities')
  getCapabilities() {
    return this.studio.getAgentCapabilitiesManifest();
  }

  @Get('workspace')
  getWorkspace(
    @Query('companyId') companyId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.studio.getStudioWorkspace(getWorkspaceAuthContext(), {
      companyId: companyId || null,
      projectId: projectId || null,
    });
  }

  @Post('presets')
  upsertPreset(@Body() body: unknown) {
    return this.studio.upsertPreset(getWorkspaceAuthContext(), body);
  }

  @Post('product-kits')
  upsertProductKit(@Body() body: unknown) {
    return this.studio.upsertProductKit(getWorkspaceAuthContext(), body);
  }

  @Post('character-sheets/generate')
  generateCharacterSheet(@Body() body: unknown) {
    return this.studio.queueCharacterSheetGeneration(
      getWorkspaceAuthContext(),
      body,
    );
  }

  @Post('videos/generate')
  generateVideo(@Body() body: unknown) {
    return this.studio.queueVideoGeneration(getWorkspaceAuthContext(), body);
  }

  @Post('videos/batch')
  batchGenerateVideos(@Body() body: unknown) {
    return this.studio.queueBatchVideoGeneration(
      getWorkspaceAuthContext(),
      body,
    );
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') jobId: string) {
    return this.studio.getJobById(getWorkspaceAuthContext(), jobId);
  }

  @Post('jobs/:jobId/retry')
  retryJob(
    @Param('jobId') jobId: string,
    @Body() body?: { routingMode?: StudioRoutingMode },
  ) {
    return this.studio.retryJob(
      getWorkspaceAuthContext(),
      jobId,
      body?.routingMode,
    );
  }

  @Post('assets/:assetId/approve')
  approveAsset(
    @Param('assetId') assetId: string,
    @Body() body?: { approved?: boolean },
  ) {
    return this.studio.setAssetApproved(
      getWorkspaceAuthContext(),
      assetId,
      body?.approved ?? true,
    );
  }

  @Post('videos/:assetId/hooks/suggest')
  suggestHooks(
    @Param('assetId') assetId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.studio.suggestHooksForVideo(getWorkspaceAuthContext(), {
      ...(body ?? {}),
      assetId,
    });
  }

  @Post('videos/:assetId/hooks/render-and-sync')
  renderAndSyncHooks(
    @Param('assetId') assetId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.studio.renderSelectedHooksForVideo(getWorkspaceAuthContext(), {
      ...(body ?? {}),
      assetId,
    });
  }
}
