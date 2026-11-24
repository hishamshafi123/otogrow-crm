import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { OnboardingModule } from 'src/engine/core-modules/onboarding/onboarding.module';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { OtogrowAccessEventEntity } from 'src/modules/otogrow-access/entities/otogrow-access-event.entity';
import { OtogrowMemberAccessEntity } from 'src/modules/otogrow-access/entities/otogrow-member-access.entity';
import { OtogrowRoleAssignmentEntity } from 'src/modules/otogrow-access/entities/otogrow-role-assignment.entity';
import { OtogrowRoleEntity } from 'src/modules/otogrow-access/entities/otogrow-role.entity';
import { OtogrowAccessResolver } from 'src/modules/otogrow-access/otogrow-access.resolver';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { OtogrowEmployeeLoginService } from 'src/modules/otogrow-access/otogrow-employee-login.service';

@Module({
  imports: [
    PermissionsModule,
    UserWorkspaceModule,
    OnboardingModule,
    WorkspaceDomainsModule,
    TypeOrmModule.forFeature([
      UserEntity,
      WorkspaceEntity,
      DeliveryMemberEntity,
      OtogrowRoleEntity,
      OtogrowMemberAccessEntity,
      OtogrowRoleAssignmentEntity,
      OtogrowAccessEventEntity,
    ]),
  ],
  providers: [
    OtogrowAccessService,
    OtogrowEmployeeLoginService,
    OtogrowAccessResolver,
  ],
  exports: [OtogrowAccessService, OtogrowEmployeeLoginService],
})
export class OtogrowAccessModule {}
