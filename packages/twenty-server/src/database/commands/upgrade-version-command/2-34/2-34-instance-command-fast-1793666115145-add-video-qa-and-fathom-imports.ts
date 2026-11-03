import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793666115145)
export class AddVideoQaAndFathomImportsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryVideoQaReport" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "taskId" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "initiatorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "requestId" uuid NOT NULL, "cancelRequestId" uuid, "inputHash" text NOT NULL, "pricingRevision" integer NOT NULL, "artifactsReady" boolean NOT NULL DEFAULT false, "input" jsonb NOT NULL, "result" jsonb, "cancellation" jsonb, "completedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_c53fa1af481224f725496d2522" CHECK ((result IS NULL AND "completedAt" IS NULL) OR (result IS NOT NULL AND "completedAt" IS NOT NULL)), CONSTRAINT "CHK_cd523164f8cd2decbf0bb1e16d" CHECK (jsonb_typeof(input)=\'object\' AND (result IS NULL OR jsonb_typeof(result)=\'object\')), CONSTRAINT "CHK_1e0dd41fb3af6ebeb933350de3" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\' AND "pricingRevision">0), CONSTRAINT "PK_e1e92221e4ca9f7cf3deba8f2e3" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_e4d752053c1bef642e84476ab1" ON "core"."deliveryVideoQaReport" ("workspaceId", "taskId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_b7fc4e5f8364faa90520544fad" ON "core"."deliveryVideoQaReport" ("workspaceId", "cancelRequestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_f00a341f28153e1eef47661152" ON "core"."deliveryVideoQaReport" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_95ec739bf798090aae9ab575b3" ON "core"."deliveryVideoQaReport" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFathomConnection" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "revision" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "apiKey" text, "updatedBy" uuid NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_536a5d96b595389651efb66583" CHECK (NOT enabled OR "apiKey" IS NOT NULL), CONSTRAINT "CHK_639ba426dec314726248346fe5" CHECK (revision > 0), CONSTRAINT "PK_45c126ed589d2e580bf6c4b8144" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_f68a5e2a23fac909ac6b628438" ON "core"."deliveryFathomConnection" ("workspaceId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" ADD "fathomRecordingId" text');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeVersion" ADD "fathomProvenance" jsonb');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_1a9293664d2b3f97fcc7fa2937" ON "core"."deliveryKnowledgeSource" ("workspaceId", "projectId", "fathomRecordingId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" ADD CONSTRAINT "CHK_fd491fe51d33f292c0d0f45bbc" CHECK ("fathomRecordingId" IS NULL OR "fathomRecordingId" ~ \'^[1-9][0-9]{0,14}$\')');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" ADD CONSTRAINT "FK_7570b430ee7d4a5657a3bc7b689" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" ADD CONSTRAINT "FK_fa79d4039be3ace6e253a1389c2" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" ADD CONSTRAINT "FK_bce81e5173277fc3b58bff20944" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFathomConnection" ADD CONSTRAINT "FK_f68a5e2a23fac909ac6b628438c" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryVideoQaReport")
        OR EXISTS (SELECT 1 FROM core."deliveryFathomConnection")
        OR EXISTS (SELECT 1 FROM core."deliveryKnowledgeSource" WHERE "fathomRecordingId" IS NOT NULL)
        OR EXISTS (SELECT 1 FROM core."deliveryKnowledgeVersion" WHERE "fathomProvenance" IS NOT NULL)
        OR EXISTS (SELECT 1 FROM core."otogrowAiPrice" WHERE kind='VIDEO_QA')
        OR EXISTS (SELECT 1 FROM core."otogrowAiSpend" WHERE price->>'kind'='VIDEO_QA')
      THEN RAISE EXCEPTION 'Cannot remove retained video QA or Fathom import history';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFathomConnection" DROP CONSTRAINT "FK_f68a5e2a23fac909ac6b628438c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" DROP CONSTRAINT "FK_bce81e5173277fc3b58bff20944"');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" DROP CONSTRAINT "FK_fa79d4039be3ace6e253a1389c2"');
    await queryRunner.query('ALTER TABLE "core"."deliveryVideoQaReport" DROP CONSTRAINT "FK_7570b430ee7d4a5657a3bc7b689"');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" DROP CONSTRAINT "CHK_fd491fe51d33f292c0d0f45bbc"');
    await queryRunner.query('DROP INDEX "core"."IDX_1a9293664d2b3f97fcc7fa2937"');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeVersion" DROP COLUMN "fathomProvenance"');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" DROP COLUMN "fathomRecordingId"');
    await queryRunner.query('DROP INDEX "core"."IDX_f68a5e2a23fac909ac6b628438"');
    await queryRunner.query('DROP TABLE "core"."deliveryFathomConnection"');
    await queryRunner.query('DROP INDEX "core"."IDX_95ec739bf798090aae9ab575b3"');
    await queryRunner.query('DROP INDEX "core"."IDX_f00a341f28153e1eef47661152"');
    await queryRunner.query('DROP INDEX "core"."IDX_b7fc4e5f8364faa90520544fad"');
    await queryRunner.query('DROP INDEX "core"."IDX_e4d752053c1bef642e84476ab1"');
    await queryRunner.query('DROP TABLE "core"."deliveryVideoQaReport"');
  }
}
