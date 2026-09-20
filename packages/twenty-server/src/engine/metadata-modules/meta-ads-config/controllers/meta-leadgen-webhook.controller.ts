import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type Request } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { MetaAdsConfigEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-ads-config.entity';
import { MetaAdsConfigService } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.service';
import {
  type MetaLeadgenChangeValue,
  MetaLeadIntakeService,
} from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-intake.service';
import { verifyMetaSignature } from 'src/engine/metadata-modules/meta-ads-config/utils/verify-meta-signature.util';

const META_WEBHOOK_THROTTLE_LIMIT = 100;
const META_WEBHOOK_THROTTLE_TTL_MS = 60 * 1000;

const LEADGEN_PATH = `${ApiPath.Webhooks}/meta/:workspaceId/leadgen`;

type MetaLeadgenWebhookPayload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: MetaLeadgenChangeValue;
    }[];
  }[];
};

@Controller()
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class MetaLeadgenWebhookController {
  constructor(
    private readonly metaAdsConfigService: MetaAdsConfigService,
    private readonly metaLeadIntakeService: MetaLeadIntakeService,
    private readonly throttlerService: ThrottlerService,
  ) {}

  // Meta verifies the subscription once with a GET; the challenge must be
  // echoed back when the verify token matches the workspace configuration.
  @Get(LEADGEN_PATH)
  @HttpCode(200)
  async verifyLeadgenWebhook(
    @Param('workspaceId') workspaceId: string,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): Promise<string> {
    const config =
      await this.metaAdsConfigService.findByWorkspaceId(workspaceId);

    if (
      !isDefined(config) ||
      !config.isActive ||
      mode !== 'subscribe' ||
      !isNonEmptyString(verifyToken) ||
      verifyToken !== config.verifyToken ||
      !isNonEmptyString(challenge)
    ) {
      throw new NotFoundException();
    }

    return challenge;
  }

  @Post(LEADGEN_PATH)
  @HttpCode(200)
  async handleLeadgenWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: RawBodyRequest<Request>,
    @Body() body: MetaLeadgenWebhookPayload,
  ): Promise<string> {
    await this.throttle(workspaceId, request);

    const config =
      await this.metaAdsConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config) || !config.isActive) {
      throw new NotFoundException();
    }

    this.assertValidSignature(config, request);

    const leadgenChanges = (body.entry ?? []).flatMap((entry) =>
      (entry.changes ?? []).filter((change) => change.field === 'leadgen'),
    );

    for (const change of leadgenChanges) {
      await this.metaLeadIntakeService.handleLeadgen({
        workspaceId,
        config,
        value: change.value ?? {},
      });
    }

    return 'EVENT_RECEIVED';
  }

  private async throttle(workspaceId: string, request: Request) {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `meta-leadgen-webhook:${workspaceId}:${request.ip}`,
        1,
        META_WEBHOOK_THROTTLE_LIMIT,
        META_WEBHOOK_THROTTLE_TTL_MS,
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
  }

  private assertValidSignature(
    config: MetaAdsConfigEntity,
    request: RawBodyRequest<Request>,
  ): void {
    const signature = request.headers['x-hub-signature-256'];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

    if (!isNonEmptyString(signatureHeader)) {
      throw new ForbiddenException('Missing Meta signature');
    }

    if (!isDefined(request.rawBody)) {
      throw new ForbiddenException('Missing request body');
    }

    const appSecret = this.metaAdsConfigService.decryptAppSecret(config);

    const isValid = verifyMetaSignature({
      appSecret,
      rawBody: request.rawBody,
      signatureHeader,
    });

    if (!isValid) {
      throw new ForbiddenException('Invalid Meta signature');
    }
  }
}
