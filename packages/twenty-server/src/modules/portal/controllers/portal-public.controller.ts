import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { isUUID } from 'class-validator';
import { type Request, type Response } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { type PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { PortalAccessService } from 'src/modules/portal/services/portal-access.service';
import { PortalDataService } from 'src/modules/portal/services/portal-data.service';
import { QuotePdfService } from 'src/modules/quoting/services/quote-pdf.service';

const PORTAL_THROTTLE_LIMIT = 60;
const PORTAL_THROTTLE_TTL_MS = 10 * 60 * 1000;

// Every lookup failure raises the same generic 404 so the endpoint cannot be
// used as an oracle for token validity.
const PORTAL_NOT_FOUND = 'Portal not found';

@Controller('portal')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class PortalPublicController {
  constructor(
    private readonly portalAccessService: PortalAccessService,
    private readonly portalDataService: PortalDataService,
    private readonly quotePdfService: QuotePdfService,
    private readonly throttlerService: ThrottlerService,
  ) {}

  @Get(':token')
  async getPortal(@Param('token') token: string, @Req() request: Request) {
    const portalAccess = await this.resolvePortalAccess(token, request);

    try {
      return await this.portalDataService.getPortalData(portalAccess);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(PORTAL_NOT_FOUND);
      }

      throw error;
    }
  }

  @Get(':token/quotes/:quoteId/pdf')
  async getQuotePdf(
    @Param('token') token: string,
    @Param('quoteId') quoteId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const portalAccess = await this.resolvePortalAccess(token, request);

    if (!isUUID(quoteId)) {
      throw new NotFoundException(PORTAL_NOT_FOUND);
    }

    try {
      const { pdfBuffer, quoteNumber } =
        await this.quotePdfService.renderQuotePdfBuffer({
          workspaceId: portalAccess.workspaceId,
          quoteId,
          companyId: portalAccess.companyId,
        });

      response.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${quoteNumber}.pdf"`,
      });
      response.send(pdfBuffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(PORTAL_NOT_FOUND);
      }

      throw error;
    }
  }

  private async resolvePortalAccess(
    token: string,
    request: Request,
  ): Promise<PortalAccessEntity> {
    const portalAccess =
      await this.portalAccessService.findActiveByToken(token);

    if (!isDefined(portalAccess)) {
      throw new NotFoundException(PORTAL_NOT_FOUND);
    }

    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `portal:${portalAccess.id}:${request.ip}`,
        1,
        PORTAL_THROTTLE_LIMIT,
        PORTAL_THROTTLE_TTL_MS,
      );
    } catch (error) {
      // ThrottlerException has no REST filter mapping it to a 429
      if (error instanceof ThrottlerException) {
        throw new HttpException(
          'Too many requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw error;
    }

    return portalAccess;
  }
}
