import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792924760229)
export class AddDeliveryReminderOutboxFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryReminderOutbox" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "noticeId" uuid NOT NULL, "status" character varying NOT NULL DEFAULT \'QUEUED\', "attemptedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, "error" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b791044c34c048c93dec774c267" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_b52cd9e22356202863c971a74f" ON "core"."deliveryReminderOutbox" ("status", "createdAt") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_5ca63ad7c7820a7186933af1e3" ON "core"."deliveryReminderOutbox" ("workspaceId", "noticeId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryReminderOutbox" ADD CONSTRAINT "FK_441b06d037f216f5d4c609d886f" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryReminderOutbox" DROP CONSTRAINT "FK_441b06d037f216f5d4c609d886f"');
    await queryRunner.query('DROP INDEX "core"."IDX_5ca63ad7c7820a7186933af1e3"');
    await queryRunner.query('DROP INDEX "core"."IDX_b52cd9e22356202863c971a74f"');
    await queryRunner.query('DROP TABLE "core"."deliveryReminderOutbox"');
  }
}
