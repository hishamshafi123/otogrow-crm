import { DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { DeliveryMetaAdapter } from 'src/modules/delivery/advertising/delivery-meta.adapter';
import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { DeliveryClientFilesController } from 'src/modules/delivery/clients/delivery-client-files.controller';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { DeliveryClientsController } from 'src/modules/delivery/clients/delivery-clients.controller';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { LeadAssignmentModule } from 'src/modules/lead-assignment/lead-assignment.module';
import { DeliveryAssemblyAdapter } from 'src/modules/delivery/creative/delivery-assembly.adapter';
import { DeliveryMediaService } from 'src/modules/delivery/creative/delivery-media.service';
import { DeliveryGoogleMediaAdapter } from 'src/modules/delivery/creative/delivery-google-media.adapter';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryCreativeFilesController } from 'src/modules/delivery/creative/delivery-creative-files.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryResolver } from 'src/modules/delivery/delivery.resolver';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';

@Module({
  imports: [
    SecretEncryptionModule,
    ThrottlerModule,
    AiModelsModule,
    LeadAssignmentModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      DeliveryOperationsEntity,
      DeliveryMemberEntity,
      DeliveryProjectEntity,
      DeliveryTaskEntity,
      DeliveryAgentEntity,
      DeliveryAgentRunEntity,
    ]),
  ],
  controllers: [
    DeliveryCreativeFilesController,
    DeliveryClientsController,
    DeliveryClientFilesController,
  ],
  providers: [
    DeliveryMetaService,
    DeliveryMetaAdapter,
    DeliveryBusinessService,
    DeliveryClientsService,
    DeliveryOperationsService,
    DeliveryService,
    DeliveryResolver,
    DeliveryAgentService,
    DeliveryCreativeService,
    DeliveryMediaService,
    DeliveryGoogleMediaAdapter,
    DeliveryAssemblyAdapter,
  ],
  exports: [
    DeliveryAgentService,
    DeliveryMediaService,
    DeliveryOperationsService,
  ],
})
export class DeliveryModule {}
