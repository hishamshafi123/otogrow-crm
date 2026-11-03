import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793228706459)
export class AddDeliveryCreativeReviewFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeFeedback" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "taskId" uuid NOT NULL, "projectId" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "targetKind" text NOT NULL, "submissionVersion" integer, "assetId" uuid NOT NULL, "target" jsonb NOT NULL, "body" text NOT NULL, "anchorKind" text NOT NULL, "startMs" integer, "endMs" integer, "status" text NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "correction" jsonb, CONSTRAINT "CHK_c572ce580ed12b206f31b7550d" CHECK (("anchorKind"=\'GENERAL\' AND "startMs" IS NULL AND "endMs" IS NULL) OR ("anchorKind"=\'TIME\' AND "startMs" IS NOT NULL AND "startMs" BETWEEN 0 AND 2147483647 AND "endMs" IS NULL) OR ("anchorKind"=\'RANGE\' AND "startMs" IS NOT NULL AND "endMs" IS NOT NULL AND "startMs" BETWEEN 0 AND 2147483647 AND "endMs">"startMs" AND "endMs"<=2147483647)), CONSTRAINT "CHK_e2b186c9bcc58efbbcfda92d72" CHECK (("targetKind"=\'ASSET\' AND "submissionVersion" IS NULL) OR ("targetKind"=\'SUBMISSION\' AND "submissionVersion" IS NOT NULL AND "submissionVersion">0)), CONSTRAINT "CHK_e43dc236fc5823c1cc8c1a37f5" CHECK (status IN (\'OPEN\',\'ADDRESSED\',\'RESOLVED\')), CONSTRAINT "CHK_ab3b84833f21e2e333dafa7a1a" CHECK (length(btrim(body)) BETWEEN 1 AND 6000), CONSTRAINT "CHK_80a5a3851885f6b5c0cd6b9b16" CHECK (revision>0), CONSTRAINT "PK_41349bd8bf9ffde9d16e7f9dc80" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_8e3a7f6f2fc250f210b021bd73" ON "core"."deliveryCreativeFeedback" ("workspaceId", "taskId", "targetKind", "assetId", "submissionVersion", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_9fdd7666021d78e36aeddc1b9a" ON "core"."deliveryCreativeFeedback" ("workspaceId", "taskId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeFeedbackEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "feedbackId" uuid NOT NULL, "commandId" uuid NOT NULL, "requestHash" text NOT NULL, "revision" integer NOT NULL, "action" text NOT NULL, "body" text NOT NULL, "actorId" uuid NOT NULL, "actorName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "beforeStatus" text, "afterStatus" text NOT NULL, "correction" jsonb, CONSTRAINT "CHK_713e2b46d575d3ff6f074f230e" CHECK ("beforeStatus" IS NULL OR "beforeStatus" IN (\'OPEN\',\'ADDRESSED\',\'RESOLVED\')), CONSTRAINT "CHK_a63d990d1dc46969a0094d81a4" CHECK ("afterStatus" IN (\'OPEN\',\'ADDRESSED\',\'RESOLVED\')), CONSTRAINT "CHK_8a2576c2560dcdf95347f17707" CHECK (action IN (\'CREATED\',\'REPLY\',\'ADDRESSED\',\'RESOLVED\',\'REOPENED\')), CONSTRAINT "CHK_58caded20314371b6f44e908e9" CHECK ("requestHash" ~ \'^[0-9a-f]{64}$\'), CONSTRAINT "CHK_16da5c2ea77c379d86c16eb3ce" CHECK (length(btrim(body)) BETWEEN 1 AND 6000), CONSTRAINT "CHK_4f360da8a03400c8a3b53c3255" CHECK (revision>0), CONSTRAINT "PK_f5401f81dfa4a94ae4a1c6c5f41" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_dfb26800cb0a66b76e3fb6ef9a" ON "core"."deliveryCreativeFeedbackEvent" ("workspaceId", "taskId", "feedbackId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_ef8b4399d2ac89c38828362765" ON "core"."deliveryCreativeFeedbackEvent" ("workspaceId", "taskId", "feedbackId", "revision") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_4bbc50a4b49074f3ea17ca08f9" ON "core"."deliveryCreativeFeedbackEvent" ("workspaceId", "commandId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedback" ADD CONSTRAINT "FK_64ec27d837e60d6635bbe68e58d" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedback" ADD CONSTRAINT "FK_dfb5d8fd34e34004adafcd7a43e" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedbackEvent" ADD CONSTRAINT "FK_36b40a51d5a83907e6824f8f439" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedbackEvent" ADD CONSTRAINT "FK_433a6790ff3f4a6ac60faf96c9b" FOREIGN KEY ("workspaceId", "taskId", "feedbackId") REFERENCES "core"."deliveryCreativeFeedback"("workspaceId","taskId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Hold writers out of the emptiness check so retained review evidence cannot race the drop.
    await queryRunner.query('LOCK TABLE core."deliveryCreativeFeedback", core."deliveryCreativeFeedbackEvent" IN SHARE ROW EXCLUSIVE MODE');
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryCreativeFeedback")
        OR EXISTS (SELECT 1 FROM core."deliveryCreativeFeedbackEvent")
        OR EXISTS (SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='creative-review') THEN
        RAISE EXCEPTION 'Cannot remove creative review with retained feedback or history';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedbackEvent" DROP CONSTRAINT "FK_433a6790ff3f4a6ac60faf96c9b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedbackEvent" DROP CONSTRAINT "FK_36b40a51d5a83907e6824f8f439"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedback" DROP CONSTRAINT "FK_dfb5d8fd34e34004adafcd7a43e"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeFeedback" DROP CONSTRAINT "FK_64ec27d837e60d6635bbe68e58d"');
    await queryRunner.query('DROP INDEX "core"."IDX_4bbc50a4b49074f3ea17ca08f9"');
    await queryRunner.query('DROP INDEX "core"."IDX_ef8b4399d2ac89c38828362765"');
    await queryRunner.query('DROP INDEX "core"."IDX_dfb26800cb0a66b76e3fb6ef9a"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeFeedbackEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_9fdd7666021d78e36aeddc1b9a"');
    await queryRunner.query('DROP INDEX "core"."IDX_8e3a7f6f2fc250f210b021bd73"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeFeedback"');
  }
}
