import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793136306094)
export class AddDeliveryFinancePeriodFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryFinancePeriod" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "month" text NOT NULL, "status" text NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reason" text NOT NULL, CONSTRAINT "CHK_4641d3456b66f8e2118cd4cd0c" CHECK (length(btrim(reason)) > 0), CONSTRAINT "CHK_84115a5233ff94d80039dba1ec" CHECK (month ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left(month,4)<>\'0000\'), CONSTRAINT "CHK_4bdfd9aaedf29707f4eff42619" CHECK (revision > 0), CONSTRAINT "CHK_2511450dd2d5ecaa639e29ffc1" CHECK (status IN (\'OPEN\',\'LOCKED\')), CONSTRAINT "PK_004c866636cdcce797086abd85f" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_5d1c04e587bb3349d813a89931" ON "core"."deliveryFinancePeriod" ("workspaceId", "month") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinancePeriod" ADD CONSTRAINT "FK_c61e629dad38930af66a2ffbaf9" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryFinancePeriod")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceEvent" WHERE "sourceType"='PERIOD') THEN
        RAISE EXCEPTION 'Monthly result review history exists; preserve it before rolling back this schema.';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFinancePeriod" DROP CONSTRAINT "FK_c61e629dad38930af66a2ffbaf9"');
    await queryRunner.query('DROP INDEX "core"."IDX_5d1c04e587bb3349d813a89931"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinancePeriod"');
  }
}
