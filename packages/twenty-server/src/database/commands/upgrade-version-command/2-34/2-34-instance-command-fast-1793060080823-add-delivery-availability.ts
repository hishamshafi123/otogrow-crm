import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793060080823)
export class AddDeliveryAvailabilityFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryAvailability" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "memberId" uuid NOT NULL, "date" date NOT NULL, "minutes" integer, "revision" integer NOT NULL DEFAULT \'1\', CONSTRAINT "PK_3593fc0d7f5b46db110d5a8163c" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_d529c61022c918a0bf41a5958a" ON "core"."deliveryAvailability" ("workspaceId", "memberId", "date") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAvailability" ADD CONSTRAINT "FK_f0587c04d375b5a13c9b7c4444e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAvailability" DROP CONSTRAINT "FK_f0587c04d375b5a13c9b7c4444e"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d529c61022c918a0bf41a5958a"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryAvailability"');
  }
}
