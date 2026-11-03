import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793315781694)
export class AddDeliveryClientSetupFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryClientSetup" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestId" uuid NOT NULL, "requestHash" text NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "companyId" uuid NOT NULL, "projectId" uuid NOT NULL, "engagementId" uuid NOT NULL, "taskId" uuid, "reusedProject" boolean NOT NULL, "reusedEngagement" boolean NOT NULL, "source" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_d4a77e8343a7ccc58d34829df2" CHECK (length("requestHash")=64), CONSTRAINT "PK_c1d78eb71b3fb032c1999f76d18" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_614f42be74be37d89ebfaf6744" ON "core"."deliveryClientSetup" ("workspaceId", "actorId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_b05714117d484755137901af6d" ON "core"."deliveryClientSetup" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_699fb35023512a9edf6a9334a4" ON "core"."deliveryProject" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" ADD CONSTRAINT "FK_4d8a508a88a442bb2638e409da0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" ADD CONSTRAINT "FK_b6e10683dbf27d20b19a354f184" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" ADD CONSTRAINT "FK_8e7b8d3beef08324f0ae5eea550" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `LOCK TABLE core."deliveryClientSetup",core."otogrowActivityEvent",core."deliveryProject" IN SHARE ROW EXCLUSIVE MODE`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM core."deliveryClientSetup")
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action,13)='CLIENT_SETUP_')
      THEN RAISE EXCEPTION 'Client setup receipts or activity exist; retain the additive schema.';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" DROP CONSTRAINT "FK_8e7b8d3beef08324f0ae5eea550"');
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" DROP CONSTRAINT "FK_b6e10683dbf27d20b19a354f184"');
    await queryRunner.query('ALTER TABLE "core"."deliveryClientSetup" DROP CONSTRAINT "FK_4d8a508a88a442bb2638e409da0"');
    await queryRunner.query('DROP INDEX "core"."IDX_699fb35023512a9edf6a9334a4"');
    await queryRunner.query('DROP INDEX "core"."IDX_b05714117d484755137901af6d"');
    await queryRunner.query('DROP INDEX "core"."IDX_614f42be74be37d89ebfaf6744"');
    await queryRunner.query('DROP TABLE "core"."deliveryClientSetup"');
  }
}
