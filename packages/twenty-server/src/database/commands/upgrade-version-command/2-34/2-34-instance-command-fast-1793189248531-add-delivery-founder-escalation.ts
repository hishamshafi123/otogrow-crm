import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793189248531)
export class AddDeliveryFounderEscalationFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryFounderEscalationRule" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "enabled" boolean NOT NULL DEFAULT false, "name" text NOT NULL, "condition" text NOT NULL, "recipientId" uuid NOT NULL, "recipientName" text NOT NULL, "priority" text NOT NULL, "projectScope" text NOT NULL, "projectIds" uuid array NOT NULL, "includeCompany" boolean NOT NULL, "currency" text, "serviceMonth" text, "repeatMode" text NOT NULL, "repeatHours" integer, "maxSends" integer NOT NULL, "grantedBy" uuid, "grantUserWorkspaceId" uuid, "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastEvaluatedAt" TIMESTAMP WITH TIME ZONE, "evaluationError" text, CONSTRAINT "CHK_b8ae0d35aff1ea5fa806b8e282" CHECK (("repeatMode"=\'ONCE\' AND "repeatHours" IS NULL AND "maxSends"=1) OR ("repeatMode"=\'INTERVAL\' AND "repeatHours" BETWEEN 1 AND 720 AND "maxSends" BETWEEN 2 AND 20)), CONSTRAINT "CHK_251eb972d5b01b717b5785175f" CHECK (("projectScope"=\'ALL\' AND cardinality("projectIds")=0) OR ("projectScope"=\'SELECTED\' AND (cardinality("projectIds")>0 OR "includeCompany"))), CONSTRAINT "CHK_048a100f14f5b4cfeb22790fbb" CHECK ("projectScope" IN (\'ALL\',\'SELECTED\')), CONSTRAINT "CHK_fed35252bd2799ced8cf6b64df" CHECK (priority IN (\'NORMAL\',\'URGENT\')), CONSTRAINT "CHK_e432d8d4d8b4ac7bb91b329685" CHECK (revision > 0), CONSTRAINT "PK_9b76c04d5d42fb952dd782bed42" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_94bc19d785f7765f1188679ae9" ON "core"."deliveryFounderEscalationRule" ("workspaceId", "enabled", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_a5afe2bb0561a597706e272402" ON "core"."deliveryFounderEscalationRule" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFounderEscalationEpisode" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ruleId" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "sourceKey" text NOT NULL, "condition" text NOT NULL, "status" text NOT NULL, "source" jsonb NOT NULL, "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "resolvedAt" TIMESTAMP WITH TIME ZONE, "acknowledgedAt" TIMESTAMP WITH TIME ZONE, "acknowledgedByName" text, "acknowledgementReason" text, CONSTRAINT "CHK_2326072d27e7ba2364823e04ad" CHECK (status IN (\'OPEN\',\'UNAVAILABLE\',\'RESOLVED\',\'WITHDRAWN\')), CONSTRAINT "CHK_4dd24bb1b5809469a28efdd396" CHECK (revision > 0), CONSTRAINT "PK_ec48662aeca59b1a8610afd5dde" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_ec9671d791732284b775e52b75" ON "core"."deliveryFounderEscalationEpisode" ("workspaceId", "ruleId", "sourceKey") WHERE status IN (\'OPEN\',\'UNAVAILABLE\')');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_848d4024cfa4bd0281b96a3b8c" ON "core"."deliveryFounderEscalationEpisode" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFounderEscalationNotice" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ruleId" uuid NOT NULL, "episodeId" uuid, "kind" text NOT NULL, "sequence" integer NOT NULL, "ruleRevision" integer NOT NULL, "commandId" uuid, "requestHash" text, "ruleSnapshot" jsonb NOT NULL, "source" jsonb, "recipientId" uuid NOT NULL, "recipientName" text NOT NULL, "priority" text NOT NULL, "createdBy" uuid, "actorName" text NOT NULL, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_471cf7047105f9b77916570e2a" CHECK ((kind=\'ALERT\' AND "episodeId" IS NOT NULL AND sequence>0 AND "commandId" IS NULL) OR (kind<>\'ALERT\' AND sequence=0 AND "commandId" IS NOT NULL AND "requestHash" IS NOT NULL)), CONSTRAINT "CHK_fa365d338ea4040d69c34a47a2" CHECK (kind IN (\'ALERT\',\'RULE_SAVED\',\'RULE_ENABLED\',\'RULE_PAUSED\',\'ACKNOWLEDGED\')), CONSTRAINT "PK_729d2e1dff2b4988e9ae7023ad4" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_5f133c801543ac6b312c9c8609" ON "core"."deliveryFounderEscalationNotice" ("workspaceId", "episodeId", "sequence") WHERE kind=\'ALERT\'');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_6f425a94442cf9015941a726d1" ON "core"."deliveryFounderEscalationNotice" ("workspaceId", "commandId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_38b41bd05c2b0aaec314252d31" ON "core"."deliveryFounderEscalationNotice" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationRule" ADD CONSTRAINT "FK_f8b81a4a727496bb76ea7aee0e0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationEpisode" ADD CONSTRAINT "FK_df635efd270f32864f8663009ed" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationEpisode" ADD CONSTRAINT "FK_3f94d5aaad6ebdbde6037764b5e" FOREIGN KEY ("workspaceId", "ruleId") REFERENCES "core"."deliveryFounderEscalationRule"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" ADD CONSTRAINT "FK_4d0b0361002fbe703991e4234f5" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" ADD CONSTRAINT "FK_5eda3b198eeffa1ce57dc2b7cc1" FOREIGN KEY ("workspaceId", "ruleId") REFERENCES "core"."deliveryFounderEscalationRule"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" ADD CONSTRAINT "FK_0c4fa8c5a57740208d7137e4644" FOREIGN KEY ("workspaceId", "episodeId") REFERENCES "core"."deliveryFounderEscalationEpisode"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A concurrent writer must not add history between the emptiness check and drop.
    await queryRunner.query('LOCK TABLE core."deliveryFounderEscalationRule", core."deliveryFounderEscalationEpisode", core."deliveryFounderEscalationNotice" IN SHARE ROW EXCLUSIVE MODE');
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryFounderEscalationRule")
        OR EXISTS (SELECT 1 FROM core."deliveryFounderEscalationEpisode")
        OR EXISTS (SELECT 1 FROM core."deliveryFounderEscalationNotice")
        OR EXISTS (SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='founder-alert')
        OR EXISTS (SELECT 1 FROM core."deliveryOperations" WHERE state#>>'{founderEscalationRouting,mode}'='RULES') THEN
        RAISE EXCEPTION 'Cannot remove founder escalation with recorded rules, issues, history or adopted routing';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" DROP CONSTRAINT "FK_0c4fa8c5a57740208d7137e4644"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" DROP CONSTRAINT "FK_5eda3b198eeffa1ce57dc2b7cc1"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationNotice" DROP CONSTRAINT "FK_4d0b0361002fbe703991e4234f5"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationEpisode" DROP CONSTRAINT "FK_3f94d5aaad6ebdbde6037764b5e"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationEpisode" DROP CONSTRAINT "FK_df635efd270f32864f8663009ed"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFounderEscalationRule" DROP CONSTRAINT "FK_f8b81a4a727496bb76ea7aee0e0"');
    await queryRunner.query('DROP INDEX "core"."IDX_38b41bd05c2b0aaec314252d31"');
    await queryRunner.query('DROP INDEX "core"."IDX_6f425a94442cf9015941a726d1"');
    await queryRunner.query('DROP INDEX "core"."IDX_5f133c801543ac6b312c9c8609"');
    await queryRunner.query('DROP TABLE "core"."deliveryFounderEscalationNotice"');
    await queryRunner.query('DROP INDEX "core"."IDX_848d4024cfa4bd0281b96a3b8c"');
    await queryRunner.query('DROP INDEX "core"."IDX_ec9671d791732284b775e52b75"');
    await queryRunner.query('DROP TABLE "core"."deliveryFounderEscalationEpisode"');
    await queryRunner.query('DROP INDEX "core"."IDX_a5afe2bb0561a597706e272402"');
    await queryRunner.query('DROP INDEX "core"."IDX_94bc19d785f7765f1188679ae9"');
    await queryRunner.query('DROP TABLE "core"."deliveryFounderEscalationRule"');
  }
}
