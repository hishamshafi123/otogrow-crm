import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1790000002003)
export class AddMetaLeadNotificationStatusFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."setterAssignment" ADD "notificationSentAt" TIMESTAMP WITH TIME ZONE DEFAULT now()');
    await queryRunner.query('ALTER TABLE "core"."setterAssignment" ALTER COLUMN "notificationSentAt" DROP DEFAULT');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."setterAssignment" DROP COLUMN "notificationSentAt"');
  }
}
