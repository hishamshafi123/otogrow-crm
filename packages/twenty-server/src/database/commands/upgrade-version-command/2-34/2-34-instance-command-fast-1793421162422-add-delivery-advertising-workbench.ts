import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793421162422)
export class AddDeliveryAdvertisingWorkbenchFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryAdvertisingReview" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "sourceKind" text NOT NULL, "sourceId" uuid NOT NULL, "projectId" uuid NOT NULL, "revision" integer NOT NULL, "state" text NOT NULL, "source" jsonb NOT NULL, "goal" jsonb NOT NULL, "note" text NOT NULL, "noChangeReason" text NOT NULL, "legacyHandling" jsonb NOT NULL, "createdBy" uuid NOT NULL, "assignedBy" uuid, "assignedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_9dac2e61d005399bc885a71550" CHECK (state IN (\'DRAFT\',\'ASSIGNED\') AND "sourceKind" IN (\'META\',\'MANUAL\')), CONSTRAINT "CHK_17b890cbb03470ff46bebabc15" CHECK (revision > 0), CONSTRAINT "PK_27ee81a2c20068e8fc5eb093023" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_9ae4ea43093b551a33e70cc61b" ON "core"."deliveryAdvertisingReview" ("workspaceId", "projectId", "createdAt", "id") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_e8cd9801d14851feedbc55d58d" ON "core"."deliveryAdvertisingReview" ("workspaceId", "sourceKind", "sourceId", "createdAt", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_5508f9e9bac66c8568972c25b4" ON "core"."deliveryAdvertisingReview" ("workspaceId", "sourceKind", "sourceId") WHERE "state" = \'DRAFT\'',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_b4a7ae4dcd8a6bc4a81a1b98df" ON "core"."deliveryAdvertisingReview" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryAdvertisingAction" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "reviewId" uuid NOT NULL, "position" integer NOT NULL, "definition" jsonb NOT NULL, "ownerName" text NOT NULL, "reviewerName" text NOT NULL, "taskId" uuid, "assistantVersion" integer, "assistantName" text, CONSTRAINT "CHK_e4ada6fa71f2189ce466182f0f" CHECK (position >= 0 AND position < 20), CONSTRAINT "PK_83dce1a0ad88141731bdca9a7fc" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_ab83ac82f210aea7456aa0ce08" ON "core"."deliveryAdvertisingAction" ("workspaceId", "taskId") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_0ce8f309e6b901dfdda13dee4f" ON "core"."deliveryAdvertisingAction" ("workspaceId", "reviewId", "position") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_e206ca6583b290b53e8197bd19" ON "core"."deliveryAdvertisingAction" ("workspaceId", "reviewId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryAdvertisingObservation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "reviewId" uuid NOT NULL, "actionId" uuid NOT NULL, "correctsId" uuid, "actorId" uuid NOT NULL, "observation" jsonb NOT NULL, "source" jsonb, "metric" jsonb, "task" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_67d74077c0ff04fd4e186ae3bc" CHECK ("correctsId" IS NULL OR "correctsId" <> id), CONSTRAINT "PK_6341805d67914361f2e3f536d34" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_c40493becfd1971969b68cbcf9" ON "core"."deliveryAdvertisingObservation" ("workspaceId", "correctsId") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_c6f101da29dc484afaee695124" ON "core"."deliveryAdvertisingObservation" ("workspaceId", "reviewId", "createdAt", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_1d4dcda7b9cbd1978224187e8f" ON "core"."deliveryAdvertisingObservation" ("workspaceId", "reviewId", "actionId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryAdvertisingEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "reviewId" uuid NOT NULL, "actorId" uuid NOT NULL, "action" text NOT NULL, "inputHash" text NOT NULL, "result" jsonb NOT NULL, "definition" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_08217e827224c2f541536abb0d" CHECK (action IN (\'SAVED\',\'ASSIGNED\',\'OBSERVED\')), CONSTRAINT "CHK_fd63c8531b929b1b5e81959dd5" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "PK_57be776cbe7baf48fde42ad7e42" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_d8e7ee26ea1e965cd5ca25b5d1" ON "core"."deliveryAdvertisingEvent" ("workspaceId", "reviewId", "createdAt", "id") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingReview" ADD CONSTRAINT "FK_bba29439bb29f125d2bd907eb6e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingReview" ADD CONSTRAINT "FK_386bc9380bfede385978917d76d" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" ADD CONSTRAINT "FK_27bc7449613b6762b96e65ed5ea" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" ADD CONSTRAINT "FK_6ed7402ddc1be2c4eabc7c86cbd" FOREIGN KEY ("workspaceId", "reviewId") REFERENCES "core"."deliveryAdvertisingReview"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" ADD CONSTRAINT "FK_ab83ac82f210aea7456aa0ce089" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" ADD CONSTRAINT "FK_d47eca87743265e2c70952a98e4" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" ADD CONSTRAINT "FK_6192cdbc8f33ba1113331c2f5ac" FOREIGN KEY ("workspaceId", "reviewId", "actionId") REFERENCES "core"."deliveryAdvertisingAction"("workspaceId","reviewId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" ADD CONSTRAINT "FK_fe31605924972b456d015838ef7" FOREIGN KEY ("workspaceId", "reviewId", "actionId", "correctsId") REFERENCES "core"."deliveryAdvertisingObservation"("workspaceId","reviewId","actionId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingEvent" ADD CONSTRAINT "FK_4ca82fae2ed4690a8a0420ba030" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingEvent" ADD CONSTRAINT "FK_37d845287cc7a4c218444497bff" FOREIGN KEY ("workspaceId", "reviewId") REFERENCES "core"."deliveryAdvertisingReview"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retained recommendation decisions and receipts must never be discarded by downgrade.
    await queryRunner.query(
      'LOCK TABLE core."deliveryAdvertisingReview", core."deliveryAdvertisingAction", core."deliveryAdvertisingObservation", core."deliveryAdvertisingEvent" IN SHARE ROW EXCLUSIVE MODE',
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryAdvertisingReview")
        OR EXISTS (SELECT 1 FROM core."deliveryAdvertisingAction")
        OR EXISTS (SELECT 1 FROM core."deliveryAdvertisingObservation")
        OR EXISTS (SELECT 1 FROM core."deliveryAdvertisingEvent")
        OR EXISTS (SELECT 1 FROM core."otogrowActivityEvent" WHERE action LIKE 'ADVERTISING_WORK_%') THEN
        RAISE EXCEPTION 'Cannot remove advertising workbench with retained decisions, observations or receipts';
      END IF;
    END $$`);
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingEvent" DROP CONSTRAINT "FK_37d845287cc7a4c218444497bff"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingEvent" DROP CONSTRAINT "FK_4ca82fae2ed4690a8a0420ba030"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" DROP CONSTRAINT "FK_fe31605924972b456d015838ef7"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" DROP CONSTRAINT "FK_6192cdbc8f33ba1113331c2f5ac"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingObservation" DROP CONSTRAINT "FK_d47eca87743265e2c70952a98e4"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" DROP CONSTRAINT "FK_ab83ac82f210aea7456aa0ce089"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" DROP CONSTRAINT "FK_6ed7402ddc1be2c4eabc7c86cbd"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingAction" DROP CONSTRAINT "FK_27bc7449613b6762b96e65ed5ea"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingReview" DROP CONSTRAINT "FK_386bc9380bfede385978917d76d"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryAdvertisingReview" DROP CONSTRAINT "FK_bba29439bb29f125d2bd907eb6e"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d8e7ee26ea1e965cd5ca25b5d1"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryAdvertisingEvent"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_1d4dcda7b9cbd1978224187e8f"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_c6f101da29dc484afaee695124"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_c40493becfd1971969b68cbcf9"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."deliveryAdvertisingObservation"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_e206ca6583b290b53e8197bd19"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_0ce8f309e6b901dfdda13dee4f"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_ab83ac82f210aea7456aa0ce08"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryAdvertisingAction"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_b4a7ae4dcd8a6bc4a81a1b98df"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_5508f9e9bac66c8568972c25b4"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_e8cd9801d14851feedbc55d58d"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_9ae4ea43093b551a33e70cc61b"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryAdvertisingReview"');
  }
}
