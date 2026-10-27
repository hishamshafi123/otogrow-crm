import { Readable } from 'stream';
import { type ReadableStream } from 'stream/web';

import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { isUUID } from 'class-validator';
import { type Request, type Response } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CallWorkspaceEntity } from 'src/modules/calling/standard-objects/call.workspace-entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

@Controller('rest/calls')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, CustomPermissionGuard)
@UseFilters(RestApiExceptionFilter)
export class CallRecordingController {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly access: OtogrowAccessService,
  ) {}

  @Get(':callId/recording')
  async streamRecording(
    @Param('callId') callId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const access = await this.access.requireCapability(
      workspace.id,
      request.workspaceMemberId,
      'phone.use',
    );
    if (
      !isDefined(request.user) ||
      !isDefined(request.workspaceMember) ||
      !isDefined(request.workspace) ||
      request.workspace.id !== workspace.id ||
      request.user.id !== request.workspaceMember.userId ||
      request.userWorkspaceId !== access.userWorkspaceId ||
      request.workspaceMember.id !== access.memberId
    )
      throw new ForbiddenException('A current workspace member is required.');
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
            );

          const call = await callRepository.findOne({
            where: { id: callId },
            select: { id: true, recordingSid: true },
          });

          return call?.recordingSid ?? null;
        },
        buildUserAuthContext({
          workspace: request.workspace,
          user: request.user,
          userWorkspaceId: access.userWorkspaceId,
          workspaceMemberId: access.memberId,
          workspaceMember: request.workspaceMember,
          application: request.application,
        }),
      );

    if (!isDefined(recordingSid) || !/^RE[\da-f]{32}$/i.test(recordingSid)) {
      throw new NotFoundException('Recording not found');
    }

    const config = await this.twilioConfigService.findByWorkspaceId(
      workspace.id,
    );

    if (!isDefined(config) || !/^AC[\da-f]{32}$/i.test(config.accountSid)) {
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
      'Cache-Control': 'private, no-store',
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
