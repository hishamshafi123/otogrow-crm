import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { FormPublicController } from 'src/engine/metadata-modules/form/controllers/form-public.controller';
import { FormEntity } from 'src/engine/metadata-modules/form/entities/form.entity';
import { FormSubmissionService } from 'src/engine/metadata-modules/form/form-submission.service';
import { FormResolver } from 'src/engine/metadata-modules/form/form.resolver';
import { FormService } from 'src/engine/metadata-modules/form/form.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ContactCreationManagerModule } from 'src/modules/contact-creation-manager/contact-creation-manager.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormEntity]),
    ThrottlerModule,
    PermissionsModule,
    ContactCreationManagerModule,
  ],
  controllers: [FormPublicController],
  providers: [FormService, FormSubmissionService, FormResolver],
  exports: [FormService],
})
export class FormModule {}
