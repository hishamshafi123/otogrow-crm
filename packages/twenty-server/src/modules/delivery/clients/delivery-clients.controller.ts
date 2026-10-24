import { FileInterceptor } from '@nestjs/platform-express';
import { FileTypeParser } from 'file-type';
import {
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';

@Controller('portal/delivery-client')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DeliveryClientsController {
  constructor(
    private readonly clients: DeliveryClientsService,
    private readonly throttle: ThrottlerService,
    private readonly storage: FileStorageDriverFactory,
  ) {}

  private async credentials(request: Request, response: Response) {
    response.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    try {
      await this.throttle.tokenBucketThrottleOrThrow(
        `delivery-client:ip:${request.ip}`,
        1,
        60,
        600000,
      );
      await this.throttle.tokenBucketThrottleOrThrow(
        `delivery-client:token:${createHash('sha256').update(token).digest('hex')}`,
        1,
        60,
        600000,
      );
    } catch (error) {
      if (error instanceof ThrottlerException)
        throw new HttpException(
          'Too many requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      throw error;
    }
    return token;
  }

  @Get('session')
  async portal(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.clients.portal(await this.credentials(request, response));
  }

  @Post('response')
  async respond(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    return this.clients.respond(
      await this.credentials(request, response),
      body,
    );
  }

  @Post('assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async upload(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
  ) {
    const token = await this.credentials(request, response);
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a brand asset.');
    const detected = await new FileTypeParser().fromBuffer(file.buffer);
    if (
      !detected ||
      !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(
        detected.mime,
      )
    )
      throw new BadRequestException(
        'Choose PNG, JPEG, WebP or PDF, up to 20 MB.',
      );
    const id = randomUUID();
    let storedPath: string | null = null;
    const driver = this.storage.getCurrentDriver();
    try {
      await this.clients.upload(
        token,
        {
          id,
          name: file.originalname.replace(/[\r\n/\\]/g, '_').slice(0, 200),
          size: file.size,
          mimeType: detected.mime,
          createdAt: new Date().toISOString(),
        },
        async (path) => {
          storedPath = path;
          await driver.writeFile({
            filePath: path,
            sourceFile: file.buffer,
            mimeType: detected.mime,
          });
        },
      );
    } catch (error) {
      if (storedPath)
        await driver
          .delete({
            folderPath: String(storedPath).split('/').slice(0, -1).join('/'),
            filename: id,
          })
          .catch(() => undefined);
      throw error;
    }
    return this.clients.portal(token);
  }

  @Get('assets/:assetId')
  async brandAsset(
    @Req() request: Request,
    @Res() response: Response,
    @Param('assetId') assetId: string,
  ) {
    const { asset, path } = await this.clients.brandAsset(
      await this.credentials(request, response),
      assetId,
    );
    const stream = await this.storage
      .getCurrentDriver()
      .readFile({ filePath: path });
    response.set({
      'Content-Type': asset.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    });
    await pipeline(stream, response);
  }

  @Get('shares/:shareId/asset')
  async asset(
    @Req() request: Request,
    @Res() response: Response,
    @Param('shareId') shareId: string,
  ) {
    const { asset, path } = await this.clients.asset(
      await this.credentials(request, response),
      shareId,
    );
    const stream = await this.storage
      .getCurrentDriver()
      .readFile({ filePath: path });
    response.set({
      'Content-Type': asset.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    });
    await pipeline(stream, response);
  }
}
