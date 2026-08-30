import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type Request } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { ChannelMessageWebhookService } from 'src/modules/messaging/channels/services/channel-message-webhook.service';
import { verifyTwilioSignature } from 'src/modules/messaging/channels/utils/twilio-signature-verifier.util';

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const TWILIO_WEBHOOK_THROTTLE_LIMIT = 100;
const TWILIO_WEBHOOK_THROTTLE_TTL_MS = 60 * 1000;

@Controller()
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class TwilioWebhookController {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly channelMessageWebhookService: ChannelMessageWebhookService,
    private readonly throttlerService: ThrottlerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Post(`${ApiPath.Webhooks}/twilio/:workspaceId/inbound`)
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleInboundWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: Request,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.throttle(workspaceId, request);
    await this.assertValidSignature(workspaceId, request, body);

    const from = body.From ?? '';
    const to = body.To ?? '';

    await this.channelMessageWebhookService.handleInbound({
      workspaceId,
      channel: from.toLowerCase().startsWith('whatsapp:') ? 'WHATSAPP' : 'SMS',
      from,
      to,
      body: body.Body ?? '',
      externalId: isNonEmptyString(body.MessageSid) ? body.MessageSid : null,
    });

    return EMPTY_TWIML;
  }

  @Post(`${ApiPath.Webhooks}/twilio/:workspaceId/status`)
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleStatusWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: Request,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.throttle(workspaceId, request);
    await this.assertValidSignature(workspaceId, request, body);

    if (
      isNonEmptyString(body.MessageSid) &&
      isNonEmptyString(body.MessageStatus)
    ) {
      await this.channelMessageWebhookService.handleStatusUpdate({
        workspaceId,
        externalId: body.MessageSid,
        twilioStatus: body.MessageStatus,
        errorMessage: isNonEmptyString(body.ErrorMessage)
          ? body.ErrorMessage
          : null,
      });
    }

    return EMPTY_TWIML;
  }

  private async throttle(workspaceId: string, request: Request) {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `twilio-webhook:${workspaceId}:${request.ip}`,
        1,
        TWILIO_WEBHOOK_THROTTLE_LIMIT,
        TWILIO_WEBHOOK_THROTTLE_TTL_MS,
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

  private async assertValidSignature(
    workspaceId: string,
    request: Request,
    body: Record<string, string>,
  ): Promise<void> {
    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config)) {
      throw new ForbiddenException('Twilio is not configured');
    }

    const signature = request.headers['x-twilio-signature'];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

    if (!isNonEmptyString(signatureHeader)) {
      throw new ForbiddenException('Missing Twilio signature');
    }

    const authToken = this.twilioConfigService.decryptAuthToken(config);

    // The validation URL is rebuilt from config instead of the Host header so
    // proxies cannot influence signature verification.
    const url = `${this.twentyConfigService.get('SERVER_URL')}${request.path}`;

    const isValid = verifyTwilioSignature({
      authToken,
      url,
      params: body,
      signature: signatureHeader,
    });

    if (!isValid) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }
}
