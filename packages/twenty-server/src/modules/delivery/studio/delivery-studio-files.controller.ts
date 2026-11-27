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
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Request, type Response } from 'express';
import { FileTypeParser } from 'file-type';
import { mkdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { parseByteRangeHeader } from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import {
  STUDIO_ALLOWED_IMAGE_MIMES,
  STUDIO_ALLOWED_VIDEO_MIMES,
  STUDIO_MAX_IMAGE_UPLOAD_BYTES,
  STUDIO_MAX_VIDEO_UPLOAD_BYTES,
  verifyStudioMediaToken,
} from 'src/modules/delivery/studio/delivery-studio.policy';
import { DeliveryStudioService } from 'src/modules/delivery/studio/delivery-studio.service';

const STUDIO_UPLOAD_TMP = path.join(os.tmpdir(), 'otogrow-studio-uploads');
mkdirSync(STUDIO_UPLOAD_TMP, { recursive: true });

const detectFileMime = async (filePath: string): Promise<string | null> => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    if (bytesRead <= 0) return null;
    const detected = await new FileTypeParser().fromBuffer(
      buf.subarray(0, bytesRead),
    );
    return detected?.mime ?? null;
  } finally {
    await handle.close();
  }
};

type StudioUploadedFile = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('portal/delivery-studio')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryStudioFilesController {
  constructor(private readonly studio: DeliveryStudioService) {}

  @Post('reference-videos/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: STUDIO_UPLOAD_TMP,
      limits: {
        fileSize: STUDIO_MAX_VIDEO_UPLOAD_BYTES,
        files: 1,
        fields: 10,
      },
    }),
  )
  async uploadReferenceVideo(
    @UploadedFile() file: StudioUploadedFile | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    if (!file) {
      throw new BadRequestException('Attach a reference video file (MP4, MOV, or WebM).');
    }
    try {
      const detected = (await detectFileMime(file.path)) ?? file.mimetype;
      if (!STUDIO_ALLOWED_VIDEO_MIMES.has(detected)) {
        throw new BadRequestException(
          `Unsupported video format "${detected}". Upload MP4, MOV, or WebM.`,
        );
      }
      const tags = (body.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      return await this.studio.registerReferenceVideo(
        getWorkspaceAuthContext(),
        {
          companyId: body.companyId?.trim() || null,
          projectId: body.projectId?.trim() || null,
          title: body.title?.trim() || file.originalname.replace(/\.[^.]+$/, ''),
          notes: body.notes?.trim() || '',
          tags,
          tempFilePath: file.path,
          originalFileName: file.originalname,
          mimeType: detected,
          sizeBytes: file.size,
        },
      );
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  @Post('product-kits/:productKitId/assets/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: STUDIO_UPLOAD_TMP,
      limits: {
        fileSize: STUDIO_MAX_IMAGE_UPLOAD_BYTES,
        files: 1,
        fields: 6,
      },
    }),
  )
  async uploadProductKitAsset(
    @Param('productKitId') productKitId: string,
    @UploadedFile() file: StudioUploadedFile | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    if (!file) {
      throw new BadRequestException('Attach a product image (PNG, JPG, or WebP).');
    }
    try {
      const detected = (await detectFileMime(file.path)) ?? file.mimetype;
      if (!STUDIO_ALLOWED_IMAGE_MIMES.has(detected)) {
        throw new BadRequestException(
          `Unsupported image format "${detected}". Upload PNG, JPG, or WebP.`,
        );
      }
      return await this.studio.addProductKitAsset(getWorkspaceAuthContext(), {
        productKitId,
        role: body.role?.trim() || 'FRONT',
        label: body.label?.trim() || body.role?.trim() || 'Front',
        tempFilePath: file.path,
        originalFileName: file.originalname,
        mimeType: detected,
        sizeBytes: file.size,
      });
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  @Post('presets/:presetId/image/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: STUDIO_UPLOAD_TMP,
      limits: {
        fileSize: STUDIO_MAX_IMAGE_UPLOAD_BYTES,
        files: 1,
        fields: 4,
      },
    }),
  )
  async uploadPresetReferenceImage(
    @Param('presetId') presetId: string,
    @UploadedFile() file: StudioUploadedFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Attach an image (PNG, JPG, or WebP).');
    }
    try {
      const detected = (await detectFileMime(file.path)) ?? file.mimetype;
      if (!STUDIO_ALLOWED_IMAGE_MIMES.has(detected)) {
        throw new BadRequestException(
          `Unsupported image format "${detected}". Upload PNG, JPG, or WebP.`,
        );
      }
      return await this.studio.setPresetReferenceImage(
        getWorkspaceAuthContext(),
        {
          presetId,
          tempFilePath: file.path,
          originalFileName: file.originalname,
          mimeType: detected,
          sizeBytes: file.size,
        },
      );
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }
}

@Controller('delivery-studio/media')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DeliveryStudioMediaController {
  constructor(
    private readonly studio: DeliveryStudioService,
    private readonly storage: FileStorageDriverFactory,
    private readonly config: TwentyConfigService,
  ) {}

  @Get(':kind/:id')
  async streamMedia(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleStream(kind, id, undefined, token, req, res);
  }

  @Get(':kind/:id/:subId')
  async streamSubMedia(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleStream(kind, id, subId, token, req, res);
  }

  private async handleStream(
    kind: string,
    id: string,
    subId: string | undefined,
    token: string | undefined,
    req: Request,
    res: Response,
  ) {
    const secret = this.config.get('APP_SECRET') || '';
    const verified = token ? verifyStudioMediaToken(secret, token) : null;
    if (
      !verified ||
      verified.t !== kind ||
      verified.id !== id ||
      (subId && verified.subId !== subId)
    ) {
      throw new UnauthorizedException('Invalid or expired studio media token.');
    }

    const target = await this.studio.resolveMediaStreamTarget(
      verified.w,
      verified.t,
      verified.id,
      verified.subId,
    );
    if (!target) {
      throw new NotFoundException('Studio media file not found.');
    }

    const driver = this.storage.getCurrentDriver();
    const rangeHeader = req.headers.range;
    const parsedRange =
      rangeHeader && target.sizeBytes > 0
        ? parseByteRangeHeader(rangeHeader, target.sizeBytes)
        : null;

    res.setHeader('Content-Type', target.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (parsedRange === 'INVALID') {
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      res.setHeader('Content-Range', `bytes */${target.sizeBytes}`);
      res.end();
      return;
    }

    if (parsedRange && typeof driver.readFileRange === 'function') {
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader(
        'Content-Range',
        `bytes ${parsedRange.start}-${parsedRange.end}/${target.sizeBytes}`,
      );
      res.setHeader(
        'Content-Length',
        String(parsedRange.end - parsedRange.start + 1),
      );
      const stream = await driver.readFileRange({
        filePath: target.storageKey,
        start: parsedRange.start,
        end: parsedRange.end,
      });
      await pipeline(stream, res);
      return;
    }

    if (target.sizeBytes > 0) {
      res.setHeader('Content-Length', String(target.sizeBytes));
    }
    const stream = await driver.readFile({ filePath: target.storageKey });
    await pipeline(stream, res);
  }
}
