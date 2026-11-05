import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Response } from 'express';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { DeliveryKnowledgeAssetsService } from './delivery-knowledge-assets.service';
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  parseKnowledgeAssetInput,
} from './delivery-knowledge-assets.policy';

@Controller('portal/delivery-knowledge-files')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryKnowledgeAssetsController {
  constructor(private readonly assets: DeliveryKnowledgeAssetsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: KNOWLEDGE_ASSET_MAX_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 4096,
      },
    }),
  )
  upload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    const form = parseKnowledgeAssetInput(
      z.object({ input: z.string().max(4096) }).strict(),
      body,
    );
    let input: unknown;
    try {
      input = JSON.parse(form.input);
    } catch {
      throw new BadRequestException(
        'Choose a brand file with its exact upload details.',
      );
    }
    return this.assets.upload(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      file,
    );
  }

  private respond(
    response: Response,
    result: Awaited<ReturnType<DeliveryKnowledgeAssetsService['download']>>,
    inline?: string,
  ) {
    const { asset, bytes } = result;
    const disposition =
      inline === 'true' && asset.mimeType.startsWith('image/')
        ? 'inline'
        : 'attachment';
    response.set({
      'Content-Type': asset.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    response.send(bytes);
  }

  @Get('upload/:id')
  async privateFile(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('id') id: string,
    @Query('inline') inline: string | undefined,
    @Res() response: Response,
  ) {
    this.respond(
      response,
      await this.assets.download(workspace, memberId, userWorkspaceId, id),
      inline,
    );
  }

  @Get(':sourceId/:version/:id')
  async publishedFile(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('sourceId') sourceId: string,
    @Param('version') version: string,
    @Param('id') id: string,
    @Query('inline') inline: string | undefined,
    @Res() response: Response,
  ) {
    const versionNumber = parseKnowledgeAssetInput(
      z.coerce.number().int().positive(),
      version,
    );
    this.respond(
      response,
      await this.assets.download(
        workspace,
        memberId,
        userWorkspaceId,
        id,
        sourceId,
        versionNumber,
      ),
      inline,
    );
  }
}
