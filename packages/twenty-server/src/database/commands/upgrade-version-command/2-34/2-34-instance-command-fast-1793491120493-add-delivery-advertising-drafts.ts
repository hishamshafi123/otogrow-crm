import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793491120493)
export class AddDeliveryAdvertisingDraftsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryAdvertisingDraftRun" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "requestId" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "sourceKind" text NOT NULL, "sourceId" uuid NOT NULL, "initiatorId" uuid NOT NULL, "initiatorName" text NOT NULL, "userWorkspaceId" uuid NOT NULL, "agentId" uuid NOT NULL, "agentVersion" integer NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "status" text NOT NULL DEFAULT \'QUEUED\', "inputHash" text NOT NULL, "bodyFingerprint" text NOT NULL, "contextFingerprint" text NOT NULL, "input" jsonb NOT NULL, "configuration" jsonb NOT NULL, "agent" jsonb NOT NULL, "basis" jsonb NOT NULL, "context" jsonb NOT NULL, "startReceipt" jsonb NOT NULL, "result" jsonb, "usage" jsonb, "error" text, "cancelRequestId" uuid, "cancelInputHash" text, "cancelReceipt" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_75fa81db3460d5a9a74d3f1992" CHECK (("cancelRequestId" IS NULL AND "cancelInputHash" IS NULL AND "cancelReceipt" IS NULL) OR ("cancelRequestId" IS NOT NULL AND "cancelInputHash" IS NOT NULL AND "cancelInputHash" ~ \'^[a-f0-9]{64}$\' AND "cancelReceipt" IS NOT NULL AND status=\'CANCELLED\')), CONSTRAINT "CHK_37324b444a4502470bf2c3e536" CHECK ((status=\'SUCCEEDED\') = (result IS NOT NULL)), CONSTRAINT "CHK_10094ce63b0dd502b63dd885c0" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\' AND "bodyFingerprint" ~ \'^[a-f0-9]{64}$\' AND "contextFingerprint" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_055638223e999490a78dd1dab1" CHECK (status IN (\'QUEUED\',\'RUNNING\',\'SUCCEEDED\',\'FAILED\',\'CANCELLED\') AND "sourceKind" IN (\'META\',\'MANUAL\')), CONSTRAINT "CHK_cd5099092f5cada5c955d6ea43" CHECK (revision > 0 AND "agentVersion" > 0), CONSTRAINT "PK_282f160fc1474a3ec3772031678" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_70e03606558941ca4bead0a9df" ON "core"."deliveryAdvertisingDraftRun" ("status", "updatedAt", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_d19605b93cba67df3cd3b5285a" ON "core"."deliveryAdvertisingDraftRun" ("workspaceId", "agentId", "createdAt") ');
    await queryRunner.query('CREATE INDEX "IDX_129b5f4b6c80906a62ea92bd8a" ON "core"."deliveryAdvertisingDraftRun" ("workspaceId", "sourceKind", "sourceId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_ef8f7df9fe28cfb808c48151d1" ON "core"."deliveryAdvertisingDraftRun" ("workspaceId", "cancelRequestId") WHERE "cancelRequestId" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_288ffae61d6c5076583de3d48b" ON "core"."deliveryAdvertisingDraftRun" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_7896e6666803da8285908013d6" ON "core"."deliveryAdvertisingDraftRun" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryAdvertisingDraftRun" ADD CONSTRAINT "FK_40ebff28648f24449e306e50d8c" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAdvertisingDraftRun" ADD CONSTRAINT "FK_19f95db7b501cf8cebf495602c4" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "core"."deliveryAdvertisingDraftRun" IN EXCLUSIVE MODE');
    const [history]: { retained: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM core."deliveryAdvertisingDraftRun")
        OR EXISTS(SELECT 1 FROM core."otogrowAiSpend" WHERE "sourceKind"='ADVERTISING_DRAFT')
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE action LIKE 'ADVERTISING_DRAFT_%')
        OR EXISTS(SELECT 1 FROM core."deliveryAdvertisingAction" WHERE definition ? 'origin')
        OR EXISTS(SELECT 1 FROM core."deliveryAdvertisingEvent" event,
          jsonb_array_elements(COALESCE(event.definition->'actions','[]'::jsonb)) AS proposal(value) WHERE proposal.value ? 'origin')
        AS retained`,
    );
    if (history.retained)
      throw new Error('Refusing to remove advertising suggestion history, usage or reviewed provenance. Preserve and migrate it before downgrading.');
    await queryRunner.query('ALTER TABLE "core"."deliveryAdvertisingDraftRun" DROP CONSTRAINT "FK_19f95db7b501cf8cebf495602c4"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAdvertisingDraftRun" DROP CONSTRAINT "FK_40ebff28648f24449e306e50d8c"');
    await queryRunner.query('DROP INDEX "core"."IDX_7896e6666803da8285908013d6"');
    await queryRunner.query('DROP INDEX "core"."IDX_288ffae61d6c5076583de3d48b"');
    await queryRunner.query('DROP INDEX "core"."IDX_ef8f7df9fe28cfb808c48151d1"');
    await queryRunner.query('DROP INDEX "core"."IDX_129b5f4b6c80906a62ea92bd8a"');
    await queryRunner.query('DROP INDEX "core"."IDX_d19605b93cba67df3cd3b5285a"');
    await queryRunner.query('DROP INDEX "core"."IDX_70e03606558941ca4bead0a9df"');
    await queryRunner.query('DROP TABLE "core"."deliveryAdvertisingDraftRun"');
  }
}
