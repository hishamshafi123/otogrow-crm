import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793175885332)
export class AddDeliveryFinanceExportFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceExportProfile" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "name" text NOT NULL, "basis" text NOT NULL, "active" boolean NOT NULL, "configuration" jsonb NOT NULL, "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_21989a1d6522a636b7eaba870a" CHECK (length(btrim(name)) > 0), CONSTRAINT "CHK_d086e15548ee37496e9ec2e766" CHECK (basis IN (\'CASH\',\'RECOGNITION\')), CONSTRAINT "CHK_602b8a2e91c622d0c7369872ae" CHECK (revision > 0), CONSTRAINT "PK_318e878a749313e0e81bc11fb67" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_2dd46cbc3ebdba2ab167aee976" ON "core"."deliveryFinanceExportProfile" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceExportBatch" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "profileId" uuid NOT NULL, "profileRevision" integer NOT NULL, "basis" text NOT NULL, "currency" text NOT NULL, "selection" jsonb NOT NULL, "profileSnapshot" jsonb NOT NULL, "rows" jsonb NOT NULL, "sourceIds" uuid array NOT NULL, "identityKeys" text array NOT NULL, "exclusions" jsonb NOT NULL, "totals" jsonb NOT NULL, "rowCount" integer NOT NULL, "csv" text NOT NULL, "checksum" text NOT NULL, "byteLength" integer NOT NULL, "previewToken" text NOT NULL, "requestHash" text NOT NULL, "reexportReason" text, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_15fc9247fde07363f8aa2b553c" CHECK (checksum ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_b296e7f479e3ae17eda91e4f9f" CHECK ("byteLength" > 0 AND "byteLength" <= 5000000), CONSTRAINT "CHK_134b6e2d7ef4453fee6b1d7cdd" CHECK ("rowCount" > 0 AND "rowCount" <= 2000), CONSTRAINT "CHK_e597aebfdc7e454d67c19aa35e" CHECK ("profileRevision" > 0), CONSTRAINT "CHK_807813e5c57ae298c23f0ae7e5" CHECK (basis IN (\'CASH\',\'RECOGNITION\')), CONSTRAINT "PK_30e5bfdba911aa8457b2443ac48" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_2878d8adf3e3b1f5b4d7f7d10b" ON "core"."deliveryFinanceExportBatch" ("workspaceId", "basis", "currency", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_d9d9cd60a72abfd078aa4fc23e" ON "core"."deliveryFinanceExportBatch" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportProfile" ADD CONSTRAINT "FK_f982b17f0b80feca4aaad9a9d52" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportBatch" ADD CONSTRAINT "FK_20704a48180edac8b8f3cd8865c" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportBatch" ADD CONSTRAINT "FK_25847344dee3f97c5a230025929" FOREIGN KEY ("workspaceId", "profileId") REFERENCES "core"."deliveryFinanceExportProfile"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryFinanceExportProfile")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceExportBatch")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceEvent" WHERE "sourceType" IN ('EXPORT_PROFILE', 'EXPORT_BATCH')) THEN
        RAISE EXCEPTION 'Cannot remove accounting exports with recorded profiles, batches or history';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportBatch" DROP CONSTRAINT "FK_25847344dee3f97c5a230025929"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportBatch" DROP CONSTRAINT "FK_20704a48180edac8b8f3cd8865c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceExportProfile" DROP CONSTRAINT "FK_f982b17f0b80feca4aaad9a9d52"');
    await queryRunner.query('DROP INDEX "core"."IDX_d9d9cd60a72abfd078aa4fc23e"');
    await queryRunner.query('DROP INDEX "core"."IDX_2878d8adf3e3b1f5b4d7f7d10b"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceExportBatch"');
    await queryRunner.query('DROP INDEX "core"."IDX_2dd46cbc3ebdba2ab167aee976"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceExportProfile"');
  }
}
