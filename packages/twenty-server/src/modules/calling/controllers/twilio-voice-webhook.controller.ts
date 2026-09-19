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
import { TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { CallLogService } from 'src/modules/calling/services/call-log.service';
import { verifyTwilioSignature } from 'src/modules/messaging/channels/utils/twilio-signature-verifier.util';

const TWILIO_VOICE_WEBHOOK_THROTTLE_LIMIT = 100;
const TWILIO_VOICE_WEBHOOK_THROTTLE_TTL_MS = 60 * 1000;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

@Controller()
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class TwilioVoiceWebhookController {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly callLogService: CallLogService,
    private readonly throttlerService: ThrottlerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Post(`${ApiPath.Webhooks}/twilio/:workspaceId/voice`)
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleVoiceWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: Request,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.throttle(workspaceId, request);
    const config = await this.assertValidSignature(workspaceId, request, body);

    // Preflight test calls carry a temporary TJS… CallSid; answer and hold
    // the line open so the SDK can measure the RTP path both ways.
    if (body.CallSid?.startsWith('TJS')) {
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml('Otogrow connection check in progress.')}</Say><Pause length="60"/></Response>`;
    }

    const isOutboundSdkCall = body.CallDirection === 'outbound';

    if (isOutboundSdkCall) {
      return this.buildOutboundTwiml(workspaceId, config, body);
    }

    return this.handleInboundCall(workspaceId, body);
  }

  @Post(`${ApiPath.Webhooks}/twilio/:workspaceId/voice/status`)
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleVoiceStatusWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: Request,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.throttle(workspaceId, request);
    await this.assertValidSignature(workspaceId, request, body);

    // <Dial> status callbacks report the child leg through DialCallStatus;
    // direct call status callbacks use CallStatus.
    const twilioStatus = body.DialCallStatus ?? body.CallStatus;
    const durationRaw = body.DialCallDuration ?? body.CallDuration;

    if (isNonEmptyString(body.CallSid) && isNonEmptyString(twilioStatus)) {
      await this.callLogService.updateCallStatus({
        workspaceId,
        callSid: body.CallSid,
        twilioStatus,
        callDurationSeconds: isNonEmptyString(durationRaw)
          ? Number.parseInt(durationRaw, 10)
          : null,
        errorMessage: isNonEmptyString(body.ErrorMessage)
          ? body.ErrorMessage
          : null,
      });
    }

    return this.emptyTwiml();
  }

  @Post(`${ApiPath.Webhooks}/twilio/:workspaceId/voice/recording`)
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleVoiceRecordingWebhook(
    @Param('workspaceId') workspaceId: string,
    @Req() request: Request,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.throttle(workspaceId, request);
    await this.assertValidSignature(workspaceId, request, body);

    if (isNonEmptyString(body.CallSid) && isNonEmptyString(body.RecordingSid)) {
      await this.callLogService.attachRecording({
        workspaceId,
        callSid: body.CallSid,
        recordingSid: body.RecordingSid,
        recordingDurationSeconds: isNonEmptyString(body.RecordingDuration)
          ? Number.parseInt(body.RecordingDuration, 10)
          : null,
      });
    }

    return this.emptyTwiml();
  }

  private async buildOutboundTwiml(
    workspaceId: string,
    config: TwilioConfigEntity,
    body: Record<string, string>,
  ): Promise<string> {
    if (!isDefined(config.voiceNumber)) {
      return this.sayTwiml('Calling is not configured for this workspace.');
    }

    const to = body.To ?? '';

    if (!isNonEmptyString(to) || !isNonEmptyString(body.CallSid)) {
      return this.sayTwiml('The number you dialed is invalid.');
    }

    // Magic number for diagnosing browser audio without any PSTN leg: the
    // caller should hear this spoken through the CRM itself.
    if (to === '+15550001111') {
      return this.sayTwiml(
        'Otogrow audio test. If you hear this message in the CRM, your browser audio output is working.',
      );
    }

    // Dictation tools and paste slips append punctuation; dialing a malformed
    // number fails carrier-side with an opaque gateway error, so normalize
    // and validate E.164 before creating any call record or TwiML.
    const normalizedTo = to.replace(/[^\d+]/g, '');

    if (!/^\+[1-9]\d{6,14}$/.test(normalizedTo)) {
      return this.sayTwiml('The number you dialed is invalid.');
    }

    await this.callLogService.upsertOutboundCall({
      workspaceId,
      callSid: body.CallSid,
      fromNumber: config.voiceNumber,
      toNumber: normalizedTo,
      personId: isNonEmptyString(body.PersonId) ? body.PersonId : null,
    });

    const serverUrl = this.twentyConfigService.get('SERVER_URL');
    const statusCallback = `${serverUrl}/${ApiPath.Webhooks}/twilio/${workspaceId}/voice/status`;
    const recordingStatusCallback = `${serverUrl}/${ApiPath.Webhooks}/twilio/${workspaceId}/voice/recording`;

    // Twilio only honors statusCallback on the <Number> noun, not on <Dial>
    // itself (warning 12200 otherwise, and no status webhooks are sent).
    // answerOnBridge: without it the SDK leg hears dead air while the PSTN
    // leg rings (carriers don't send early media), and callers hang up
    // before the callee answers; with it Twilio plays ringback and bridges
    // on answer.
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${escapeXml(config.voiceNumber)}" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(recordingStatusCallback)}"><Number statusCallback="${escapeXml(statusCallback)}" statusCallbackEvent="initiated ringing answered completed">${escapeXml(normalizedTo)}</Number></Dial></Response>`;
  }

  private async handleInboundCall(
    workspaceId: string,
    body: Record<string, string>,
  ): Promise<string> {
    const from = body.From ?? '';
    const to = body.To ?? '';

    if (isNonEmptyString(body.CallSid)) {
      await this.callLogService.handleInboundCall({
        workspaceId,
        callSid: body.CallSid,
        fromNumber: from,
        toNumber: to,
      });
    }

    const serverUrl = this.twentyConfigService.get('SERVER_URL');
    const statusCallback = `${serverUrl}/${ApiPath.Webhooks}/twilio/${workspaceId}/voice/status`;
    const recordingStatusCallback = `${serverUrl}/${ApiPath.Webhooks}/twilio/${workspaceId}/voice/recording`;
    const voicemailVerbs = this.voicemailTwimlVerbs(recordingStatusCallback);

    const memberIdentities =
      await this.callLogService.listWorkspaceMemberIds(workspaceId);

    if (memberIdentities.length === 0) {
      return `<?xml version="1.0" encoding="UTF-8"?><Response>${voicemailVerbs}</Response>`;
    }

    const clientNouns = memberIdentities
      .map(
        (identity) =>
          `<Client statusCallback="${escapeXml(statusCallback)}" statusCallbackEvent="initiated ringing answered completed">${escapeXml(identity)}</Client>`,
      )
      .join('');

    // answerOnBridge: without it the PSTN caller hears dead air while the
    // browser client rings (the SDK leg sends no early media), and callers
    // hang up before anyone answers; with it Twilio plays ringback and
    // bridges on answer. Verbs after <Dial> only run when nobody answered,
    // so the voicemail fallback never fires on a bridged call.
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(recordingStatusCallback)}">${clientNouns}</Dial>${voicemailVerbs}</Response>`;
  }

  private voicemailTwimlVerbs(recordingStatusCallback: string): string {
    return `<Say>Please leave a message after the tone.</Say><Record maxLength="120" recordingStatusCallback="${escapeXml(recordingStatusCallback)}"/>`;
  }

  private sayTwiml(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(message)}</Say><Hangup/></Response>`;
  }

  private emptyTwiml(): string {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  private async throttle(workspaceId: string, request: Request) {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `twilio-voice-webhook:${workspaceId}:${request.ip}`,
        1,
        TWILIO_VOICE_WEBHOOK_THROTTLE_LIMIT,
        TWILIO_VOICE_WEBHOOK_THROTTLE_TTL_MS,
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
  ): Promise<TwilioConfigEntity> {
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

    return config;
  }
}
