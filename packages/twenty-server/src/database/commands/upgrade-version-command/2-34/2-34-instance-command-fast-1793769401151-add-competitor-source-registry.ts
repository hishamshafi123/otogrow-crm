import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793769401151)
export class AddCompetitorSourceRegistryFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryCompetitorSource" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "createdBy" uuid NOT NULL, "label" text NOT NULL, "platform" text NOT NULL, "canonicalReference" text NOT NULL, "canonicalKey" text NOT NULL, "ownerId" uuid NOT NULL, "ownerName" text NOT NULL, "reviewerId" uuid NOT NULL, "reviewerName" text NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "status" text NOT NULL, "cadenceHours" integer NOT NULL, "lookbackDays" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_094cc71582fdd70dd67274ad1b" CHECK ("cadenceHours" BETWEEN 1 AND 720 AND "lookbackDays" BETWEEN 1 AND 90), CONSTRAINT "CHK_f7372a54ff71dbcd8fe0f4a123" CHECK ("ownerId"<>"reviewerId"), CONSTRAINT "CHK_904c094a7407f27066573a3d2c" CHECK (length("canonicalReference") BETWEEN 1 AND 2000), CONSTRAINT "CHK_2155f66b734b3f8d9dd9dd7ccc" CHECK (length(btrim(label)) BETWEEN 1 AND 160), CONSTRAINT "CHK_1fa9a3f841a3de47eacf69647b" CHECK ("canonicalKey" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_4a7cec4477fd28a6c912600270" CHECK (platform IN (\'X\',\'INSTAGRAM\',\'META_AD_LIBRARY\',\'MANUAL\')), CONSTRAINT "CHK_6ebdf743bd94d6dce0e0a9c7e3" CHECK (status IN (\'ACTIVE\',\'PAUSED\',\'ARCHIVED\')), CONSTRAINT "CHK_a973080c0e0aed759718700b94" CHECK (revision>0 AND "currentVersion">0), CONSTRAINT "PK_2d2d37dffc28ee248449da0a156" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_1baea5601966071ddec537a825" ON "core"."deliveryCompetitorSource" ("workspaceId", "projectId", "status", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_d489e281c5dd3d5ba8a6a2e185" ON "core"."deliveryCompetitorSource" ("workspaceId", "projectId", "platform", "canonicalKey") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_77eec5ad3bf6a170702fba1fe9" ON "core"."deliveryCompetitorSource" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryCompetitorSourceVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "version" integer NOT NULL, "companyId" uuid, "body" jsonb NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_55183cdcce519cf31bb355f456" CHECK (octet_length(body::text)<=40000), CONSTRAINT "CHK_105f3f280d4773a3bffd1f95a1" CHECK (COALESCE(body->>\'canonicalKey\' ~ \'^[a-f0-9]{64}$\', false)), CONSTRAINT "CHK_cce1b4833e1b115dfa89421361" CHECK (jsonb_typeof(body)=\'object\'), CONSTRAINT "CHK_3411e3bcf2d78b9917655736fc" CHECK (version>0), CONSTRAINT "PK_1332110a4430db1c7166ee4c3fc" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_dc34720c78f6f9b9ef0b32ca63" ON "core"."deliveryCompetitorSourceVersion" ("workspaceId", "sourceId", "version") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryCompetitorSourceEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "requestId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "actorName" text NOT NULL, "inputHash" text NOT NULL, "action" text NOT NULL, "note" text NOT NULL, "revision" integer NOT NULL, "version" integer NOT NULL, "status" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_cd44b2bd6152e463f9cc8760a8" CHECK (length(note)<=2000), CONSTRAINT "CHK_31c7991dc30a6558e5b9e4682f" CHECK (status IN (\'ACTIVE\',\'PAUSED\',\'ARCHIVED\')), CONSTRAINT "CHK_9f8320cef2f8a83c0d2f257f8c" CHECK (action IN (\'SAVE\',\'PAUSE\',\'RESTORE\',\'ARCHIVE\')), CONSTRAINT "CHK_b48bb75d200bd32ca9a639dc5a" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_9c2186a8348276d01f5cc001c2" CHECK (revision>0 AND version>0), CONSTRAINT "PK_11f34790fb28d41c196e6f26df0" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_454b0000d57441677a11eedc49" ON "core"."deliveryCompetitorSourceEvent" ("workspaceId", "sourceId", "revision") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_2f3f753c84ac13114cdd35251b" ON "core"."deliveryCompetitorSourceEvent" ("workspaceId", "requestId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSource" ADD CONSTRAINT "FK_f5c4e95bd1a3b4c26ec04e46ae4" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSource" ADD CONSTRAINT "FK_498c0dd18fb1b2fe8184ea817c6" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceVersion" ADD CONSTRAINT "FK_94b4ff8eb345e911d787d4cc58d" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceVersion" ADD CONSTRAINT "FK_93688ebe585d9761a9cecb2ad8a" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "core"."deliveryCompetitorSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" ADD CONSTRAINT "FK_d00cbac45faf41fc053fb99fe05" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" ADD CONSTRAINT "FK_081c72df4aa74e94f6495e977d8" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "core"."deliveryCompetitorSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" ADD CONSTRAINT "FK_55706dbb90ba9bd0ce85257053b" FOREIGN KEY ("workspaceId", "sourceId", "version") REFERENCES "core"."deliveryCompetitorSourceVersion"("workspaceId","sourceId","version") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [history]: { retained: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM core."deliveryCompetitorSource")
        OR EXISTS (SELECT 1 FROM core."deliveryCompetitorSourceVersion")
        OR EXISTS (SELECT 1 FROM core."deliveryCompetitorSourceEvent")
        OR EXISTS (
          SELECT 1 FROM core."otogrowActivityEvent"
          WHERE "sourceType" = 'competitor-source'
             OR left(action, 18) = 'COMPETITOR_SOURCE_'
        ) AS retained
    `);

    if (history.retained) {
      throw new Error('Cannot remove retained competitor source history.');
    }

    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" DROP CONSTRAINT "FK_55706dbb90ba9bd0ce85257053b"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" DROP CONSTRAINT "FK_081c72df4aa74e94f6495e977d8"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceEvent" DROP CONSTRAINT "FK_d00cbac45faf41fc053fb99fe05"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceVersion" DROP CONSTRAINT "FK_93688ebe585d9761a9cecb2ad8a"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSourceVersion" DROP CONSTRAINT "FK_94b4ff8eb345e911d787d4cc58d"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSource" DROP CONSTRAINT "FK_498c0dd18fb1b2fe8184ea817c6"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryCompetitorSource" DROP CONSTRAINT "FK_f5c4e95bd1a3b4c26ec04e46ae4"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_2f3f753c84ac13114cdd35251b"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_454b0000d57441677a11eedc49"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."deliveryCompetitorSourceEvent"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_dc34720c78f6f9b9ef0b32ca63"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."deliveryCompetitorSourceVersion"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_77eec5ad3bf6a170702fba1fe9"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d489e281c5dd3d5ba8a6a2e185"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_1baea5601966071ddec537a825"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryCompetitorSource"');
  }
}
