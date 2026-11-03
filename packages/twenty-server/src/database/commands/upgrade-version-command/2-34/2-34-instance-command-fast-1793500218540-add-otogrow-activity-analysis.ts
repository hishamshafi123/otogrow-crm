import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793500218540)
export class AddOtogrowActivityAnalysisFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."otogrowActivityAnalysisRun" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "requestId" uuid NOT NULL, "initiatorId" uuid NOT NULL, "initiatorName" text NOT NULL, "userWorkspaceId" uuid NOT NULL, "agentId" uuid NOT NULL, "agentVersion" integer NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "status" text NOT NULL DEFAULT \'QUEUED\', "inputHash" text NOT NULL, "bodyFingerprint" text NOT NULL, "contextFingerprint" text NOT NULL, "input" jsonb NOT NULL, "configuration" jsonb NOT NULL, "agent" jsonb NOT NULL, "basis" jsonb NOT NULL, "context" jsonb NOT NULL, "startReceipt" jsonb NOT NULL, "result" jsonb, "usage" jsonb, "error" text, "cancelRequestId" uuid, "cancelInputHash" text, "cancelReceipt" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_1728001a1db806007242060b27" CHECK (("cancelRequestId" IS NULL AND "cancelInputHash" IS NULL AND "cancelReceipt" IS NULL) OR ("cancelRequestId" IS NOT NULL AND "cancelInputHash" IS NOT NULL AND "cancelInputHash" ~ \'^[a-f0-9]{64}$\' AND "cancelReceipt" IS NOT NULL AND status=\'CANCELLED\')), CONSTRAINT "CHK_4e9bdedb6ca476a45b7345503e" CHECK ((status=\'SUCCEEDED\') = (result IS NOT NULL)), CONSTRAINT "CHK_af9cc16a3d56fba49c3ff14585" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\' AND "bodyFingerprint" ~ \'^[a-f0-9]{64}$\' AND "contextFingerprint" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_e95785eaed8694bec6c0eaa933" CHECK (status IN (\'QUEUED\',\'RUNNING\',\'SUCCEEDED\',\'FAILED\',\'CANCELLED\')), CONSTRAINT "CHK_c26d0378ea331cadff75badf5d" CHECK (revision > 0 AND "agentVersion" > 0), CONSTRAINT "PK_e622fce4d19c78db7183d2ad4ae" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_c2a6736a8d4db7ba9ccf7f34a3" ON "core"."otogrowActivityAnalysisRun" ("status", "updatedAt", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_f6f2b54af97199c849843f4a6b" ON "core"."otogrowActivityAnalysisRun" ("workspaceId", "agentId", "createdAt") ');
    await queryRunner.query('CREATE INDEX "IDX_426e066c40c7c5b790f0cb4ece" ON "core"."otogrowActivityAnalysisRun" ("workspaceId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_ec3c6b86634faa444ff1fc226a" ON "core"."otogrowActivityAnalysisRun" ("workspaceId", "cancelRequestId") WHERE "cancelRequestId" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_e1abec1bdd13cf1849b8b2a9f8" ON "core"."otogrowActivityAnalysisRun" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_32d32a9dc469f91f3ee73ef11b" ON "core"."otogrowActivityAnalysisRun" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityAnalysisRun" ADD CONSTRAINT "FK_30569b1daa50e26c075becff969" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "core"."otogrowActivityAnalysisRun" IN EXCLUSIVE MODE');
    const [history]: { retained: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM core."otogrowActivityAnalysisRun")
        OR EXISTS(SELECT 1 FROM core."otogrowAiSpend" WHERE "sourceKind"='ACTIVITY_ANALYSIS')
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='activity-analysis' OR action LIKE 'ACTIVITY_ANALYSIS_%')
        OR EXISTS(SELECT 1 FROM core."deliveryAgent" WHERE configuration->>'kind'='ACTIVITY') AS retained`,
    );
    if (history.retained)
      throw new Error('Refusing to remove activity analysis history, usage or configuration. Preserve and migrate it before downgrading.');
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityAnalysisRun" DROP CONSTRAINT "FK_30569b1daa50e26c075becff969"');
    await queryRunner.query('DROP INDEX "core"."IDX_32d32a9dc469f91f3ee73ef11b"');
    await queryRunner.query('DROP INDEX "core"."IDX_e1abec1bdd13cf1849b8b2a9f8"');
    await queryRunner.query('DROP INDEX "core"."IDX_ec3c6b86634faa444ff1fc226a"');
    await queryRunner.query('DROP INDEX "core"."IDX_426e066c40c7c5b790f0cb4ece"');
    await queryRunner.query('DROP INDEX "core"."IDX_f6f2b54af97199c849843f4a6b"');
    await queryRunner.query('DROP INDEX "core"."IDX_c2a6736a8d4db7ba9ccf7f34a3"');
    await queryRunner.query('DROP TABLE "core"."otogrowActivityAnalysisRun"');
  }
}
