import { Readable } from 'stream';
import { type ReadableStream } from 'stream/web';

import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { isUUID } from 'class-validator';
import { type Response } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CallWorkspaceEntity } from 'src/modules/calling/standard-objects/call.workspace-entity';

@Controller('rest/calls')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class CallRecordingController {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  @Get(':callId/recording')
  async streamRecording(
    @Param('callId') callId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Res() response: Response,
  ) {
    if (!isUUID(callId)) {
      throw new NotFoundException('Call not found');
    }

    const recordingSid =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const callRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspace.id,
              CallWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          const call = await callRepository.findOne({ where: { id: callId } });

          return call?.recordingSid ?? null;
        },
        buildSystemAuthContext(workspace.id),
      );

    if (!isDefined(recordingSid)) {
      throw new NotFoundException('Recording not found');
    }

    const config = await this.twilioConfigService.findByWorkspaceId(
      workspace.id,
    );

    if (!isDefined(config)) {
      throw new NotFoundException('Recording not found');
    }

    const authToken = this.twilioConfigService.decryptAuthToken(config);

    // The recording binary is fetched server-side so the Twilio credentials
    // never reach the browser.
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${recordingSid}.mp3`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${authToken}`).toString('base64')}`,
        },
      },
    );

    if (!twilioResponse.ok || !isDefined(twilioResponse.body)) {
      throw new ServiceUnavailableException(
        'Recording is not available from the provider yet',
      );
    }

    response.set({
      'Content-Type': 'audio/mpeg',
      ...(isDefined(twilioResponse.headers.get('content-length'))
        ? {
            'Content-Length': twilioResponse.headers.get(
              'content-length',
            ) as string,
          }
        : {}),
    });

    Readable.fromWeb(twilioResponse.body as ReadableStream).pipe(response);
  }
}
