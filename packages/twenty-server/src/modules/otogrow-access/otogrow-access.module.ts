import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { OtogrowAccessEventEntity } from 'src/modules/otogrow-access/entities/otogrow-access-event.entity';
import { OtogrowMemberAccessEntity } from 'src/modules/otogrow-access/entities/otogrow-member-access.entity';
import { OtogrowRoleAssignmentEntity } from 'src/modules/otogrow-access/entities/otogrow-role-assignment.entity';
import { OtogrowRoleEntity } from 'src/modules/otogrow-access/entities/otogrow-role.entity';
import { OtogrowAccessResolver } from 'src/modules/otogrow-access/otogrow-access.resolver';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

@Module({
  imports: [
    PermissionsModule,
    TypeOrmModule.forFeature([
      DeliveryMemberEntity,
      OtogrowRoleEntity,
      OtogrowMemberAccessEntity,
      OtogrowRoleAssignmentEntity,
      OtogrowAccessEventEntity,
    ]),
  ],
  providers: [OtogrowAccessService, OtogrowAccessResolver],
  exports: [OtogrowAccessService],
})
export class OtogrowAccessModule {}
