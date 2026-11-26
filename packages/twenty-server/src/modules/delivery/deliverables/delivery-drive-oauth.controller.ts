import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';

@Controller('delivery-drive/oauth')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DeliveryDriveOAuthController {
  constructor(private readonly driveService: DeliveryDriveService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.driveService.handleOAuthCallback({
      code,
      state,
      error,
    });
    res.redirect(302, redirectUrl);
  }
}
