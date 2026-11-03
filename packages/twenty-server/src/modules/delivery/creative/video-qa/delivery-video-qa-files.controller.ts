import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { DeliveryVideoQaService } from './delivery-video-qa.service';

@Controller('delivery-creative')
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class DeliveryVideoQaFilesController {
  constructor(private readonly videoQa: DeliveryVideoQaService) {}
  @Get(':taskId/video-qa/:runId/:file')
  async evidence(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('taskId') taskId: string,
    @Param('runId') runId: string,
    @Param('file') file: string,
    @Res() response: Response,
  ) {
    const evidence = await this.videoQa.evidence(
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
      runId,
      file,
    );
    response.setHeader('Content-Type', evidence.mimeType);
    response.setHeader('Content-Length', evidence.bytes.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `inline; filename="${file}"`);
    response.end(evidence.bytes);
  }
}
