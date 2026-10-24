import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { FileTypeParser } from 'file-type';
import { v4 } from 'uuid';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';

const uploadSchema = z
  .object({
    revision: z.coerce.number().int().positive(),
    kind: z.enum([
      'REFERENCE',
      'IMAGE',
      'CLIP',
      'BASE',
      'HOOK',
      'CTA',
      'FINAL',
      'AUDIO',
    ]),
    shotId: z.string().uuid().optional(),
  })
  .strict();
const ALLOWED_MEDIA = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
]);

@Controller('delivery-creative')
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class DeliveryCreativeFilesController {
  constructor(
    private readonly creative: DeliveryCreativeService,
    private readonly storage: FileStorageDriverFactory,
  ) {}

  @Post(':taskId/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  async upload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @UploadedFile() file: {
      buffer: Buffer;
      originalname: string;
      size: number;
    },
  ) {
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success || !file?.buffer?.length)
      throw new BadRequestException(
        'Choose a file, asset type and current task version.',
      );
    const detected = await new FileTypeParser().fromBuffer(file.buffer);
    if (!detected || !ALLOWED_MEDIA.has(detected.mime))
      throw new BadRequestException(
        'Upload PNG, JPEG, WebP, MP4, WebM, MOV or supported audio.',
      );
    const id = v4();
    const folderPath = `${workspace.id}/delivery-creative/${taskId}`;
    const driver = this.storage.getCurrentDriver();
    // Permission and revision checks happen before bytes enter storage.
    return await this.creative.addAsset(
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
      parsed.data.revision,
      {
        id,
        name: file.originalname.replace(/[\r\n/\\]/g, '_').slice(0, 200),
        mimeType: detected.mime,
        size: file.size,
        createdAt: new Date().toISOString(),
        uploadedBy: memberId,
        shotId: parsed.data.shotId ?? null,
        kind: parsed.data.kind,
      },
      async () => {
        await driver.writeFile({
          filePath: `${folderPath}/${id}`,
          sourceFile: file.buffer,
          mimeType: detected.mime,
        });
      },
    );
  }

  @Get(':taskId/assets/:assetId')
  async download(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('taskId') taskId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ) {
    const { document } = await this.creative.read(
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    const asset = document?.assets.find((item) => item.id === assetId);
    if (!asset || asset.storageState !== 'READY')
      throw new BadRequestException('Asset is unavailable.');
    const stream = await this.storage.getCurrentDriver().readFile({
      filePath: `${workspace.id}/delivery-creative/${taskId}/${asset.id}`,
    });
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(stream, response);
  }
}
