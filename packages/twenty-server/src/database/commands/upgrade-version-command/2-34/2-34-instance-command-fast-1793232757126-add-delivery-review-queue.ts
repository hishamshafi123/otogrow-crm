import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793232757126)
export class AddDeliveryReviewQueueFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryReviewAssignment" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "submissionVersion" integer NOT NULL, "revision" integer NOT NULL, "mode" text NOT NULL, "reviewerId" uuid, "reviewerName" text, "reason" text NOT NULL, "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_702de8cb7f611331901172f6b7" CHECK (length(btrim(reason)) BETWEEN 1 AND 2000), CONSTRAINT "CHK_57f2c7e59f2fa832d3b2a62b8b" CHECK ((mode=\'PRIMARY\' AND "reviewerId" IS NULL) OR (mode=\'BACKUP\' AND "reviewerId" IS NOT NULL)), CONSTRAINT "CHK_ffff7cc1d90be74ee81f15db13" CHECK (revision>0 AND "submissionVersion">0), CONSTRAINT "PK_44caeab37bfb1f85822c3df7ed9" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_f100bed9a1c349f472aa9955f2" ON "core"."deliveryReviewAssignment" ("workspaceId", "taskId", "id", "submissionVersion") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_8a0a120be8b81a2b5637d61c54" ON "core"."deliveryReviewAssignment" ("workspaceId", "taskId", "submissionVersion") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryReviewAssignmentEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "assignmentId" uuid NOT NULL, "submissionVersion" integer NOT NULL, "commandId" uuid NOT NULL, "requestHash" text NOT NULL, "revision" integer NOT NULL, "mode" text NOT NULL, "reviewerId" uuid, "reviewerName" text, "primaryReviewerName" text NOT NULL, "primaryReviewerId" uuid, "previousMode" text NOT NULL, "previousReviewerName" text, "previousReviewerId" uuid, "reason" text NOT NULL, "actorId" uuid NOT NULL, "actorName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_8acdf8218af7638c0976b979a6" CHECK ("requestHash" ~ \'^[0-9a-f]{64}$\'), CONSTRAINT "CHK_f3b390559e6bf4fedc2265891d" CHECK (length(btrim(reason)) BETWEEN 1 AND 2000), CONSTRAINT "CHK_ffc4c8a2e728d2f02f2497b298" CHECK ("previousMode" IN (\'PRIMARY\',\'BACKUP\')), CONSTRAINT "CHK_494d1c46168a649b369ccda22f" CHECK ((mode=\'PRIMARY\' AND "reviewerId" IS NULL) OR (mode=\'BACKUP\' AND "reviewerId" IS NOT NULL)), CONSTRAINT "CHK_e92068f3cf7865b8d7428d1349" CHECK (revision>0 AND "submissionVersion">0), CONSTRAINT "PK_7b660d0942fb40800fb0b2ba5b4" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_91035af31d3402bff2dba9cb4c" ON "core"."deliveryReviewAssignmentEvent" ("workspaceId", "taskId", "submissionVersion", "createdAt", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_d7fff3c6aaa36c6e268ebf3f88" ON "core"."deliveryReviewAssignmentEvent" ("workspaceId", "taskId", "assignmentId", "revision") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_a73b6a6996276d0ab4b4fe3ce2" ON "core"."deliveryReviewAssignmentEvent" ("workspaceId", "commandId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFounderEscalationRule" ADD "minimumReviewWaitHours" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFounderEscalationRule" ADD CONSTRAINT "CHK_4e991781e141cc89867b0bceac" CHECK ((condition=\'TASK_REVIEW_WAIT\' AND "minimumReviewWaitHours" IS NOT NULL AND "minimumReviewWaitHours" BETWEEN 1 AND 720) OR (condition<>\'TASK_REVIEW_WAIT\' AND "minimumReviewWaitHours" IS NULL))',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignment" ADD CONSTRAINT "FK_35125dc68fdd4534d0e0287c674" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignment" ADD CONSTRAINT "FK_f752809b85525a8db0eafdd42c5" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignmentEvent" ADD CONSTRAINT "FK_293f7d792f0f4dae0106542628e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignmentEvent" ADD CONSTRAINT "FK_3b5d777c16c70690e3e8a9f19f7" FOREIGN KEY ("workspaceId", "taskId", "assignmentId", "submissionVersion") REFERENCES "core"."deliveryReviewAssignment"("workspaceId","taskId","id","submissionVersion") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `LOCK TABLE core."deliveryReviewAssignment",core."deliveryReviewAssignmentEvent",core."deliveryFounderEscalationRule",core."deliveryFounderEscalationNotice",core."otogrowActivityEvent",core."deliveryOperations" IN SHARE ROW EXCLUSIVE MODE`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM core."deliveryReviewAssignment")
        OR EXISTS(SELECT 1 FROM core."deliveryReviewAssignmentEvent")
        OR EXISTS(SELECT 1 FROM core."deliveryOperations" WHERE state @> '{"notices":[{"kind":"REVIEW_ASSIGNMENT"}]}'::jsonb)
        OR EXISTS(SELECT 1 FROM core."deliveryFounderEscalationRule" WHERE "minimumReviewWaitHours" IS NOT NULL OR condition='TASK_REVIEW_WAIT')
        OR EXISTS(SELECT 1 FROM core."deliveryFounderEscalationNotice" WHERE "ruleSnapshot"->>'condition'='TASK_REVIEW_WAIT' OR "ruleSnapshot"->>'minimumReviewWaitHours' IS NOT NULL)
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE action IN ('REVIEW_BACKUP_ASSIGNED','REVIEW_PRIMARY_RESTORED'))
      THEN RAISE EXCEPTION 'Review assignment or wait-alert history exists; retain the additive schema.';
      END IF;
    END $$`);
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignmentEvent" DROP CONSTRAINT "FK_3b5d777c16c70690e3e8a9f19f7"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignmentEvent" DROP CONSTRAINT "FK_293f7d792f0f4dae0106542628e"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignment" DROP CONSTRAINT "FK_f752809b85525a8db0eafdd42c5"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryReviewAssignment" DROP CONSTRAINT "FK_35125dc68fdd4534d0e0287c674"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFounderEscalationRule" DROP CONSTRAINT "CHK_4e991781e141cc89867b0bceac"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFounderEscalationRule" DROP COLUMN "minimumReviewWaitHours"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_a73b6a6996276d0ab4b4fe3ce2"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d7fff3c6aaa36c6e268ebf3f88"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_91035af31d3402bff2dba9cb4c"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."deliveryReviewAssignmentEvent"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_8a0a120be8b81a2b5637d61c54"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_f100bed9a1c349f472aa9955f2"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryReviewAssignment"');
  }
}
