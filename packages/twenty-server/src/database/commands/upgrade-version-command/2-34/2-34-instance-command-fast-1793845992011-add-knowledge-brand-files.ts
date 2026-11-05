import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793845992011)
export class AddKnowledgeBrandFilesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryKnowledgeAsset" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "sourceId" uuid NOT NULL, "sourceRevision" integer NOT NULL, "uploadedBy" uuid NOT NULL, "uploaderUserWorkspaceId" uuid NOT NULL, "inputHash" text NOT NULL, "name" text NOT NULL, "mimeType" text NOT NULL, "size" integer NOT NULL, "sha256" text NOT NULL, "state" text NOT NULL DEFAULT \'PENDING\', "failureReason" text, "readyAt" TIMESTAMP WITH TIME ZONE, "cleanedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_4d28a9fbaee3a45fba41c1b5b4" CHECK ((state=\'READY\' AND "readyAt" IS NOT NULL AND "failureReason" IS NULL) OR (state=\'PENDING\' AND "readyAt" IS NULL AND "failureReason" IS NULL) OR (state=\'FAILED\' AND "readyAt" IS NULL AND "failureReason" IS NOT NULL)), CONSTRAINT "CHK_15914a67ea7a154e50f896a75f" CHECK (length(btrim(name)) BETWEEN 1 AND 200), CONSTRAINT "CHK_a7c9125321f82f813ad81adfd5" CHECK ("mimeType" IN (\'image/png\',\'image/jpeg\',\'image/webp\',\'application/pdf\')), CONSTRAINT "CHK_698493cfd17015a50662f71520" CHECK (sha256 ~ \'^[a-f0-9]{64}$\' AND "inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_612bc86f4db3284dcf18f6ad4d" CHECK (size>0 AND size<=20971520 AND "sourceRevision">=0), CONSTRAINT "CHK_1f4867637feafa3437d151c255" CHECK (state IN (\'PENDING\',\'READY\',\'FAILED\')), CONSTRAINT "PK_b37dc8c361292f15f66ee22155f" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_70e5ec16560faa241c3d6c10bd" ON "core"."deliveryKnowledgeAsset" ("workspaceId", "uploadedBy", "state") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_fbe24d9f36d3bee6e4b670b743" ON "core"."deliveryKnowledgeAsset" ("workspaceId", "sourceId", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_1a1dbe26d0b748f84b86c126d7" ON "core"."deliveryKnowledgeAsset" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeVersion" ADD "attachments" jsonb NOT NULL DEFAULT \'[]\'::jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeVersion" ADD CONSTRAINT "CHK_e17ac76a1600db118be8e414d3" CHECK (jsonb_typeof(attachments)=\'array\' AND jsonb_array_length(attachments)<=10)',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeAsset" ADD CONSTRAINT "FK_8c56e9a951faf9010eec298c0ba" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeAsset" ADD CONSTRAINT "FK_74945084ce2d80f91913bcba958" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [history]: { retained: boolean }[] = await queryRunner.query(`
      SELECT EXISTS(SELECT 1 FROM core."deliveryKnowledgeAsset")
        OR EXISTS(SELECT 1 FROM core."deliveryKnowledgeVersion" WHERE attachments<>'[]'::jsonb)
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='knowledge-upload' OR left(action, 15)='KNOWLEDGE_FILE_') AS retained
    `);
    // Published bindings and upload receipts must outlive an application rollback.
    if (history.retained)
      throw new Error('Cannot remove retained knowledge files.');
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeAsset" DROP CONSTRAINT "FK_74945084ce2d80f91913bcba958"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeAsset" DROP CONSTRAINT "FK_8c56e9a951faf9010eec298c0ba"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeVersion" DROP CONSTRAINT "CHK_e17ac76a1600db118be8e414d3"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryKnowledgeVersion" DROP COLUMN "attachments"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_1a1dbe26d0b748f84b86c126d7"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_fbe24d9f36d3bee6e4b670b743"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_70e5ec16560faa241c3d6c10bd"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryKnowledgeAsset"');
  }
}
