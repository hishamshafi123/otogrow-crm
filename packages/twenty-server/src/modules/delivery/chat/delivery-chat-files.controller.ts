import {
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
import { pipeline } from 'node:stream/promises';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  DeliveryChatService,
} from 'src/modules/delivery/chat/delivery-chat.service';

@Controller('portal/delivery-chat-files')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryChatFilesController {
  constructor(private readonly chat: DeliveryChatService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: CHAT_ATTACHMENT_MAX_BYTES,
        files: 1,
        fields: 4,
        fieldSize: 8192,
      },
    }),
  )
  upload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Body() body: unknown,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    return this.chat.uploadAttachment(
      workspace.id,
      memberId,
      userWorkspaceId,
      body,
      file,
    );
  }

  @Get(':attachmentId')
  async download(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @Res() response: Response,
  ) {
    const { attachment, stream } = await this.chat.downloadAttachment(
      workspace.id,
      memberId,
      userWorkspaceId,
      attachmentId,
    );
    const canInline =
      inline === 'true' &&
      (attachment.kind === 'IMAGE' || attachment.kind === 'VOICE');
    const disposition = canInline ? 'inline' : 'attachment';
    response.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    await pipeline(stream, response);
  }
}
