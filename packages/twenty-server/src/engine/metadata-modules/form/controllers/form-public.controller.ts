import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isUUID } from 'class-validator';
import { type Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { SubmitFormBodyDto } from 'src/engine/metadata-modules/form/dtos/submit-form.body';
import { FormSubmissionService } from 'src/engine/metadata-modules/form/form-submission.service';
import { FormService } from 'src/engine/metadata-modules/form/form.service';

const FORM_SUBMIT_THROTTLE_LIMIT = 10;
const FORM_SUBMIT_THROTTLE_TTL_MS = 10 * 60 * 1000;

@Controller('forms')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class FormPublicController {
  constructor(
    private readonly formService: FormService,
    private readonly formSubmissionService: FormSubmissionService,
    private readonly throttlerService: ThrottlerService,
  ) {}

  @Get(':publicId')
  async getForm(@Param('publicId') publicId: string) {
    const form = isUUID(publicId)
      ? await this.formService.findActiveByPublicId(publicId)
      : null;

    if (!isDefined(form)) {
      throw new NotFoundException('Form not found');
    }

    return {
      name: form.name,
      fields: form.fields,
      successMessage: form.successMessage,
    };
  }

  @Post(':publicId/submit')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async submitForm(
    @Param('publicId') publicId: string,
    @Req() request: Request,
    @Body() body: SubmitFormBodyDto,
  ): Promise<{ success: true }> {
    const form = isUUID(publicId)
      ? await this.formService.findActiveByPublicId(publicId)
      : null;

    if (!isDefined(form)) {
      throw new NotFoundException('Form not found');
    }

    if (isNonEmptyString(body._hp)) {
      return { success: true };
    }

    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        `form-submit:${form.id}:${request.ip}`,
        1,
        FORM_SUBMIT_THROTTLE_LIMIT,
        FORM_SUBMIT_THROTTLE_TTL_MS,
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

    await this.formSubmissionService.submit(form, body.values, body.pageUrl);

    return { success: true };
  }
}
