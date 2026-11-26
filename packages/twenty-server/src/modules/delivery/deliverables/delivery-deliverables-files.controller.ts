import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Request, type Response } from 'express';
import { createReadStream, mkdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { FileTypeParser } from 'file-type';
import { v4 } from 'uuid';
import { z } from 'zod';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import {
  ALLOWED_DELIVERABLE_MIMES,
  assetKindForMime,
  currentMonthKey,
  DELIVERABLE_MAX_UPLOAD_BYTES,
  extensionForMime,
  formatDriveDeliverableFilename,
  formatDriveVariationFilename,
  MONTH_KEY_REGEX,
  parseByteRangeHeader,
  verifyDeliverableMediaToken,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryDeliverablesService } from 'src/modules/delivery/deliverables/delivery-deliverables.service';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import { DeliveryMediaProbeService } from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import { DeliveryVideoHooksService } from 'src/modules/delivery/deliverables/delivery-video-hooks.service';

const UPLOAD_TEMP_ROOT = path.join(os.tmpdir(), 'otogrow-deliverable-uploads');
mkdirSync(UPLOAD_TEMP_ROOT, { recursive: true });

const OVERLAY_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const uploadBodySchema = z
  .object({
    companyId: z.uuid(),
    projectId: z.uuid().optional(),
    engagementId: z.uuid().optional(),
    serviceKey: z.string().trim().min(1).max(100),
    monthKey: z.string().regex(MONTH_KEY_REGEX).optional(),
    sequenceNumber: z.coerce.number().int().positive().max(9999).optional(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    publishImmediately: z
      .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
      .transform((value) => value === true || value === 'true' || value === '1')
      .optional(),
    linkedTaskId: z.uuid().optional(),
  })
  .strict();

const detectMimeFromDisk = async (filePath: string): Promise<string | null> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead <= 0) return null;
    const detected = await new FileTypeParser().fromBuffer(
      buffer.subarray(0, bytesRead),
    );
    return detected?.mime ?? null;
  } finally {
    await handle.close();
  }
};

@Controller('portal/delivery-deliverables')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryDeliverablesFilesController {
  constructor(
    private readonly deliverables: DeliveryDeliverablesService,
    private readonly probe: DeliveryMediaProbeService,
    private readonly storage: FileStorageDriverFactory,
    private readonly driveService: DeliveryDriveService,
    private readonly hooksService: DeliveryVideoHooksService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: UPLOAD_TEMP_ROOT,
      limits: {
        fileSize: DELIVERABLE_MAX_UPLOAD_BYTES,
        files: 1,
        fields: 15,
      },
    }),
  )
  async upload(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Body() body: unknown,
    @UploadedFile()
    file: {
      path: string;
      originalname: string;
      size: number;
    },
  ) {
    const tempFilePath = file?.path;
    let tempThumbPath: string | null = null;
    try {
      const parsed = uploadBodySchema.safeParse(body);
      if (!parsed.success || !tempFilePath || !file?.size) {
        throw new BadRequestException(
          parsed.success
            ? 'Choose a file to upload.'
            : (parsed.error.issues[0]?.message ?? 'Invalid upload metadata.'),
        );
      }

      // Authorize caller and company access before running ffprobe/ffmpeg or writing bytes.
      await this.deliverables.verifyStaffCompanyAccess(
        workspace.id,
        memberId,
        userWorkspaceId,
        parsed.data.companyId,
        parsed.data.projectId ?? null,
      );

      const detectedMime = await detectMimeFromDisk(tempFilePath);
      if (!detectedMime || !ALLOWED_DELIVERABLE_MIMES.has(detectedMime)) {
        throw new BadRequestException(
          'Unsupported file type. Upload MP4, MOV, WebM, PNG, JPEG, WebP, or PDF.',
        );
      }

      const assetKind = assetKindForMime(detectedMime);
      const fileId = v4();
      const ext = extensionForMime(detectedMime);
      const storageKey = `${workspace.id}/delivery-deliverables/${parsed.data.companyId}/${fileId}.${ext}`;
      let thumbnailKey: string | null = null;

      let mediaMeta = {};
      if (assetKind === 'VIDEO') {
        mediaMeta = await this.probe.probeMedia(tempFilePath);
        mkdirSync(UPLOAD_TEMP_ROOT, { recursive: true });
        tempThumbPath = path.join(UPLOAD_TEMP_ROOT, `${fileId}.thumb.jpg`);
        const durationSec =
          'durationSec' in mediaMeta
            ? (mediaMeta as { durationSec?: number }).durationSec
            : undefined;
        const extracted = await this.probe.extractVideoThumbnail(
          tempFilePath,
          tempThumbPath,
          durationSec,
        );
        if (extracted) {
          thumbnailKey = `${workspace.id}/delivery-deliverables/${parsed.data.companyId}/${fileId}.thumb.jpg`;
        }
      }

      const driver = this.storage.getCurrentDriver();
      let wroteMain = false;
      let wroteThumb = false;
      try {
        await driver.writeFileStream({
          filePath: storageKey,
          stream: createReadStream(tempFilePath),
          mimeType: detectedMime,
        });
        wroteMain = true;

        if (thumbnailKey && tempThumbPath) {
          await driver.writeFileStream({
            filePath: thumbnailKey,
            stream: createReadStream(tempThumbPath),
            mimeType: 'image/jpeg',
          });
          wroteThumb = true;
        }

        return await this.deliverables.createUploadedDeliverable(
          workspace,
          memberId,
          userWorkspaceId,
          {
            companyId: parsed.data.companyId,
            projectId: parsed.data.projectId ?? null,
            engagementId: parsed.data.engagementId ?? null,
            serviceKey: parsed.data.serviceKey,
            monthKey: parsed.data.monthKey ?? currentMonthKey(),
            sequenceNumber: parsed.data.sequenceNumber,
            title: parsed.data.title,
            description: parsed.data.description,
            assetKind,
            originalFileName: file.originalname
              .replace(/[\r\n/\\]/g, '_')
              .slice(0, 240),
            storageKey,
            thumbnailKey,
            mimeType: detectedMime,
            sizeBytes: file.size,
            mediaMeta,
            publishImmediately: parsed.data.publishImmediately,
            linkedTaskId: parsed.data.linkedTaskId ?? null,
          },
        );
      } catch (writeOrDbError) {
        if (wroteMain) {
          await driver
            .delete({ folderPath: storageKey })
            .catch(() => undefined);
        }
        if (wroteThumb && thumbnailKey) {
          await driver
            .delete({ folderPath: thumbnailKey })
            .catch(() => undefined);
        }
        throw writeOrDbError;
      }
    } finally {
      if (tempFilePath) {
        await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
      }
      if (tempThumbPath) {
        await fs.rm(tempThumbPath, { force: true }).catch(() => undefined);
      }
    }
  }

  private async streamStoredFile(
    req: Request,
    res: Response,
    params: {
      workspaceId: string;
      storageKey: string | null;
      driveFileId: string | null;
      knownSizeBytes?: number;
      mimeType: string;
      downloadFilename: string;
      forceDownload: boolean;
      storageState: string;
    },
  ) {
    await streamStoredMediaFile(
      this.storage,
      req,
      res,
      params,
      this.driveService,
    );
  }

  @Get(':id/stream')
  async streamDeliverable(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const deliverable = await this.deliverables.authorizeMediaRead(
      workspace,
      memberId,
      userWorkspaceId,
      id,
    );
    await this.streamStoredFile(req, res, {
      workspaceId: workspace.id,
      storageKey: deliverable.storageKey,
      driveFileId: deliverable.driveFileId,
      knownSizeBytes: Number(deliverable.sizeBytes ?? 0),
      mimeType: deliverable.mimeType ?? 'application/octet-stream',
      downloadFilename: formatDriveDeliverableFilename(
        deliverable.sequenceNumber,
        deliverable.mimeType,
      ),
      forceDownload: download === '1' || download === 'true',
      storageState: deliverable.storageState,
    });
  }

  @Get(':id/thumbnail')
  async getDeliverableThumbnail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const deliverable = await this.deliverables.authorizeMediaRead(
      workspace,
      memberId,
      userWorkspaceId,
      id,
    );
    await streamThumbnailFile(this.storage, res, deliverable.thumbnailKey, 86400);
  }

  @Get('variations/:variationId/stream')
  async streamVariation(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('variationId') variationId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const variation = await this.deliverables.authorizeVariationMediaRead(
      workspace,
      memberId,
      userWorkspaceId,
      variationId,
    );
    await this.streamStoredFile(req, res, {
      workspaceId: workspace.id,
      storageKey: variation.outputStorageKey,
      driveFileId: variation.driveFileId,
      knownSizeBytes: Number(variation.outputSizeBytes ?? 0),
      mimeType: 'video/mp4',
      downloadFilename: formatDriveVariationFilename(
        variation.variationNumber,
        'video/mp4',
      ),
      forceDownload: download === '1' || download === 'true',
      storageState: variation.storageState,
    });
  }

  @Get('variations/:variationId/thumbnail')
  async getVariationThumbnail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('variationId') variationId: string,
    @Res() res: Response,
  ) {
    const variation = await this.deliverables.authorizeVariationMediaRead(
      workspace,
      memberId,
      userWorkspaceId,
      variationId,
    );
    await streamThumbnailFile(this.storage, res, variation.thumbnailKey, 86400);
  }

  @Post('variations/:variationId/overlay')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: UPLOAD_TEMP_ROOT,
      limits: {
        fileSize: OVERLAY_MAX_UPLOAD_BYTES,
        files: 1,
        fields: 4,
      },
    }),
  )
  async uploadVariationOverlay(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('variationId') variationId: string,
    @UploadedFile()
    file: {
      path: string;
      size: number;
    },
  ) {
    const tempFilePath = file?.path;
    try {
      if (!tempFilePath || !file?.size) {
        throw new BadRequestException('Overlay PNG file is required.');
      }
      return await this.hooksService.saveVariationOverlayPng(
        workspace,
        memberId,
        userWorkspaceId,
        variationId,
        tempFilePath,
        file.size,
      );
    } finally {
      if (tempFilePath) {
        await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
      }
    }
  }
}

export const streamThumbnailFile = async (
  storage: FileStorageDriverFactory,
  res: Response,
  thumbnailKey: string | null | undefined,
  maxAgeSeconds = 3600,
) => {
  if (!thumbnailKey) {
    throw new NotFoundException('Thumbnail not available.');
  }
  let stream: NodeJS.ReadableStream;
  try {
    stream = await storage
      .getCurrentDriver()
      .readFile({ filePath: thumbnailKey });
  } catch {
    throw new NotFoundException('Thumbnail file is unavailable.');
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', `private, max-age=${maxAgeSeconds}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    await pipeline(stream, res);
  } catch (error) {
    if (!res.headersSent) {
      throw error;
    }
    res.destroy();
  }
};

export const streamStoredMediaFile = async (
  storage: FileStorageDriverFactory,
  req: Request,
  res: Response,
  params: {
    workspaceId?: string;
    storageKey: string | null;
    driveFileId?: string | null;
    knownSizeBytes?: number;
    mimeType: string;
    downloadFilename: string;
    forceDownload: boolean;
    storageState: string;
  },
  driveService?: DeliveryDriveService,
) => {
  if (params.storageState === 'DRIVE_ONLY' || !params.storageKey) {
    if (driveService && params.workspaceId && params.driveFileId) {
      await driveService.streamDriveFile(
        params.workspaceId,
        params.driveFileId,
        req,
        res,
        {
          mimeType: params.mimeType,
          downloadFilename: params.downloadFilename,
          forceDownload: params.forceDownload,
          knownSizeBytes: params.knownSizeBytes,
        },
      );
      return;
    }
    throw new ServiceUnavailableException(
      'This video has been archived to Google Drive after 24 hours. Open it directly from Google Drive.',
    );
  }

  const driver = storage.getCurrentDriver();
  const metadata = await driver.getFileMetadata({
    filePath: params.storageKey,
  });
  if (!metadata || metadata.size <= 0) {
    if (driveService && params.workspaceId && params.driveFileId) {
      await driveService.streamDriveFile(
        params.workspaceId,
        params.driveFileId,
        req,
        res,
        {
          mimeType: params.mimeType,
          downloadFilename: params.downloadFilename,
          forceDownload: params.forceDownload,
          knownSizeBytes: params.knownSizeBytes,
        },
      );
      return;
    }
    throw new NotFoundException('Stored media file is unavailable.');
  }

  const totalSize = metadata.size;
  const parsedRange = parseByteRangeHeader(req.headers.range, totalSize);
  if (parsedRange === 'INVALID') {
    res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    res.setHeader('Content-Range', `bytes */${totalSize}`);
    res.end();
    return;
  }

  let stream: NodeJS.ReadableStream;
  const isRangeRequest = Boolean(
    parsedRange && typeof driver.readFileRange === 'function',
  );
  try {
    if (isRangeRequest && parsedRange && driver.readFileRange) {
      stream = await driver.readFileRange({
        filePath: params.storageKey,
        start: parsedRange.start,
        end: parsedRange.end,
      });
    } else {
      stream = await driver.readFile({ filePath: params.storageKey });
    }
  } catch {
    if (driveService && params.workspaceId && params.driveFileId) {
      await driveService.streamDriveFile(
        params.workspaceId,
        params.driveFileId,
        req,
        res,
        {
          mimeType: params.mimeType,
          downloadFilename: params.downloadFilename,
          forceDownload: params.forceDownload,
          knownSizeBytes: params.knownSizeBytes,
        },
      );
      return;
    }
    throw new NotFoundException('Stored media file is unavailable.');
  }

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', params.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (params.mimeType === 'application/pdf') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; object-src 'none'; base-uri 'none'",
    );
  } else {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  }
  res.setHeader(
    'Content-Disposition',
    `${params.forceDownload ? 'attachment' : 'inline'}; filename="${params.downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
  );

  if (isRangeRequest && parsedRange) {
    res.status(HttpStatus.PARTIAL_CONTENT);
    res.setHeader(
      'Content-Range',
      `bytes ${parsedRange.start}-${parsedRange.end}/${totalSize}`,
    );
    res.setHeader('Content-Length', String(parsedRange.chunkLength));
  } else {
    res.status(HttpStatus.OK);
    res.setHeader('Content-Length', String(totalSize));
  }

  try {
    await pipeline(stream, res);
  } catch (error) {
    if (!res.headersSent) {
      throw error;
    }
    res.destroy();
  }
};

@Controller('delivery-deliverables/media')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DeliveryDeliverablesMediaController {
  constructor(
    private readonly deliverables: DeliveryDeliverablesService,
    private readonly storage: FileStorageDriverFactory,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly driveService: DeliveryDriveService,
  ) {}

  private verifyToken(
    token: string | undefined,
    kind: 'deliverable' | 'thumbnail' | 'variation' | 'variation-thumbnail',
    id: string,
  ) {
    const secret = this.twentyConfigService.get('APP_SECRET') || '';
    const payload = verifyDeliverableMediaToken(secret, token, kind, id);
    if (!payload) {
      throw new UnauthorizedException('Media playback link has expired.');
    }
    return payload;
  }

  @Get(':id/stream')
  async streamDeliverable(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const payload = this.verifyToken(token, 'deliverable', id);
    const deliverable = await this.deliverables.readDeliverableByWorkspaceId(
      payload.w,
      id,
    );
    await streamStoredMediaFile(
      this.storage,
      req,
      res,
      {
        workspaceId: payload.w,
        storageKey: deliverable.storageKey,
        driveFileId: deliverable.driveFileId,
        knownSizeBytes: Number(deliverable.sizeBytes ?? 0),
        mimeType: deliverable.mimeType ?? 'application/octet-stream',
        downloadFilename: formatDriveDeliverableFilename(
          deliverable.sequenceNumber,
          deliverable.mimeType,
        ),
        forceDownload: download === '1' || download === 'true',
        storageState: deliverable.storageState,
      },
      this.driveService,
    );
  }

  @Get(':id/thumbnail')
  async getDeliverableThumbnail(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const payload = this.verifyToken(token, 'thumbnail', id);
    const deliverable = await this.deliverables.readDeliverableByWorkspaceId(
      payload.w,
      id,
    );
    await streamThumbnailFile(this.storage, res, deliverable.thumbnailKey, 3600);
  }

  @Get('variations/:variationId/stream')
  async streamVariation(
    @Param('variationId') variationId: string,
    @Query('token') token: string | undefined,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const payload = this.verifyToken(token, 'variation', variationId);
    const variation = await this.deliverables.readVariationByWorkspaceId(
      payload.w,
      variationId,
    );
    await streamStoredMediaFile(
      this.storage,
      req,
      res,
      {
        workspaceId: payload.w,
        storageKey: variation.outputStorageKey,
        driveFileId: variation.driveFileId,
        knownSizeBytes: Number(variation.outputSizeBytes ?? 0),
        mimeType: 'video/mp4',
        downloadFilename: formatDriveVariationFilename(
          variation.variationNumber,
          'video/mp4',
        ),
        forceDownload: download === '1' || download === 'true',
        storageState: variation.storageState,
      },
      this.driveService,
    );
  }

  @Get('variations/:variationId/thumbnail')
  async getVariationThumbnail(
    @Param('variationId') variationId: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const payload = this.verifyToken(
      token,
      'variation-thumbnail',
      variationId,
    );
    const variation = await this.deliverables.readVariationByWorkspaceId(
      payload.w,
      variationId,
    );
    await streamThumbnailFile(this.storage, res, variation.thumbnailKey, 3600);
  }
}
