import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { isRequestOriginAllowed } from 'src/engine/core-modules/user-session/utils/is-request-origin-allowed.util';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { DeliveryClientPortalV2Service } from 'src/modules/delivery/deliverables/delivery-client-portal-v2.service';
import {
  streamStoredMediaFile,
  streamThumbnailFile,
} from 'src/modules/delivery/deliverables/delivery-deliverables-files.controller';
import {
  CLIENT_PORTAL_V2_COOKIE_NAME,
  formatDriveDeliverableFilename,
  formatDriveVariationFilename,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';

const SESSION_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

const readCookie = (req: Request, name: string): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
};

const isSecureRequest = (req: Request): boolean =>
  process.env.NODE_ENV === 'production' || Boolean(req.secure);

@Controller('portal/client')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DeliveryClientPortalV2Controller {
  constructor(
    private readonly portal: DeliveryClientPortalV2Service,
    private readonly throttle: ThrottlerService,
    private readonly storage: FileStorageDriverFactory,
    private readonly driveService: DeliveryDriveService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private setSecurityHeaders(res: Response) {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
  }

  private assertAllowedOrigin(req: Request, requireJsonBody = false) {
    const origin = req.headers.origin;
    if (
      typeof origin !== 'string' ||
      !origin.trim() ||
      !isRequestOriginAllowed({
        origin,
        request: req,
        twentyConfigService: this.twentyConfigService,
      })
    ) {
      throw new ForbiddenException(
        'Request origin is not allowed for client portal actions.',
      );
    }
    if (requireJsonBody) {
      const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
      if (!contentType.includes('application/json')) {
        throw new BadRequestException('Content-Type must be application/json.');
      }
    }
  }

  private async applyThrottle(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<void> {
    try {
      await this.throttle.tokenBucketThrottleOrThrow(key, 1, limit, windowMs);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new HttpException(
          'Too many requests. Please wait a few minutes and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }

  private setSessionCookie(req: Request, res: Response, token: string) {
    res.cookie(CLIENT_PORTAL_V2_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(req),
      path: '/portal/client',
      maxAge: SESSION_COOKIE_MAX_AGE_SEC * 1000,
    });
  }

  private clearSessionCookie(req: Request, res: Response) {
    res.clearCookie(CLIENT_PORTAL_V2_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(req),
      path: '/portal/client',
    });
  }

  @Get(':slug/info')
  async getPublicPortalInfo(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSecurityHeaders(res);
    await this.applyThrottle(`client-portal-v2:info:${req.ip}`, 30, 600_000);
    return this.portal.getPublicPortalInfo(slug);
  }

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticate(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSecurityHeaders(res);
    this.assertAllowedOrigin(req, true);
    await this.applyThrottle(`client-portal-v2:auth:ip:${req.ip}`, 15, 600_000);
    const rawSlug =
      body &&
      typeof body === 'object' &&
      'slug' in body &&
      typeof body.slug === 'string'
        ? body.slug.trim().toLowerCase()
        : '';
    if (rawSlug && /^[a-z0-9-]{2,80}$/.test(rawSlug)) {
      await this.applyThrottle(
        `client-portal-v2:auth:slug:${rawSlug}:ip:${req.ip}`,
        10,
        600_000,
      );
      await this.applyThrottle(
        `client-portal-v2:auth:target:${rawSlug}`,
        25,
        600_000,
      );
    } else {
      await this.applyThrottle(
        `client-portal-v2:auth:code-only:ip:${req.ip}`,
        8,
        600_000,
      );
    }

    const result = await this.portal.authenticate(body);
    this.setSessionCookie(req, res, result.cookieToken);

    return {
      authenticated: true,
      slug: result.slug,
      displayName: result.displayName,
      stakeholderName: result.stakeholderName,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSecurityHeaders(res);
    this.assertAllowedOrigin(req, false);
    this.clearSessionCookie(req, res);
    return { ok: true };
  }

  @Get('dashboard')
  async getDashboard(
    @Query('monthKey') monthKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSecurityHeaders(res);
    await this.applyThrottle(
      `client-portal-v2:dash:ip:${req.ip}`,
      180,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access, session } =
      await this.portal.verifySessionCookie(cookieValue);
    return this.portal.getDashboard(access, session, monthKey);
  }

  @Post('deliverables/:id/review')
  @HttpCode(HttpStatus.OK)
  async submitReview(
    @Param('id') deliverableId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSecurityHeaders(res);
    this.assertAllowedOrigin(req, true);
    await this.applyThrottle(
      `client-portal-v2:review:ip:${req.ip}`,
      60,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access, session } =
      await this.portal.verifySessionCookie(cookieValue);
    return this.portal.submitClientReview(access, session, deliverableId, body);
  }

  @Get('media/:deliverableId/stream')
  async streamDeliverable(
    @Param('deliverableId') deliverableId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    await this.applyThrottle(
      `client-portal-v2:media:ip:${req.ip}`,
      300,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access } = await this.portal.verifySessionCookie(cookieValue);
    const deliverable = await this.portal.authorizeClientDeliverableMedia(
      access,
      deliverableId,
    );

    await streamStoredMediaFile(
      this.storage,
      req,
      res,
      {
        workspaceId: access.workspaceId,
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

  @Get('media/:deliverableId/thumbnail')
  async getDeliverableThumbnail(
    @Param('deliverableId') deliverableId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    await this.applyThrottle(
      `client-portal-v2:media:ip:${req.ip}`,
      300,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access } = await this.portal.verifySessionCookie(cookieValue);
    const deliverable = await this.portal.authorizeClientDeliverableMedia(
      access,
      deliverableId,
    );
    await streamThumbnailFile(this.storage, res, deliverable.thumbnailKey, 3600);
  }

  @Get('media/variations/:variationId/stream')
  async streamVariation(
    @Param('variationId') variationId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    await this.applyThrottle(
      `client-portal-v2:media:ip:${req.ip}`,
      300,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access } = await this.portal.verifySessionCookie(cookieValue);
    const variation = await this.portal.authorizeClientVariationMedia(
      access,
      variationId,
    );

    await streamStoredMediaFile(
      this.storage,
      req,
      res,
      {
        workspaceId: access.workspaceId,
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

  @Get('media/variations/:variationId/thumbnail')
  async getVariationThumbnail(
    @Param('variationId') variationId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    await this.applyThrottle(
      `client-portal-v2:media:ip:${req.ip}`,
      300,
      600_000,
    );
    const cookieValue = readCookie(req, CLIENT_PORTAL_V2_COOKIE_NAME);
    const { access } = await this.portal.verifySessionCookie(cookieValue);
    const variation = await this.portal.authorizeClientVariationMedia(
      access,
      variationId,
    );
    await streamThumbnailFile(this.storage, res, variation.thumbnailKey, 3600);
  }
}
