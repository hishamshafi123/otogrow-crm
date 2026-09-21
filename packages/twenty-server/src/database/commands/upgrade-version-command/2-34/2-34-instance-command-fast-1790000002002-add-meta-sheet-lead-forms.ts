import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1790000002002)
export class AddMetaSheetLeadFormsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."metaLeadForm" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "spreadsheetId" text NOT NULL, "sheetId" integer NOT NULL, "credentials" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "lastSyncedAt" TIMESTAMP WITH TIME ZONE, "lastError" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_metaLeadForm_credentials_encrypted" CHECK ("credentials" LIKE \'enc:v2:%\'), CONSTRAINT "PK_5138c10ec88ab85df52514ab6c2" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_META_LEAD_FORM_SHEET" ON "core"."metaLeadForm" ("workspaceId", "spreadsheetId", "sheetId") WHERE "deletedAt" IS NULL');
    await queryRunner.query('CREATE TABLE "core"."metaSheetLead" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "formId" uuid NOT NULL, "leadId" text NOT NULL, "personId" uuid, "answers" jsonb NOT NULL, "skipped" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_50c531072eae74f6a4c56a770c5" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_META_SHEET_LEAD_SOURCE" ON "core"."metaSheetLead" ("workspaceId", "formId", "leadId") ');
    await queryRunner.query('ALTER TABLE "core"."metaLeadForm" ADD CONSTRAINT "FK_058976214c48615967a6fea4357" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."metaSheetLead" ADD CONSTRAINT "FK_589e7a4af8c6472a5693150cdf3" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."metaSheetLead" DROP CONSTRAINT "FK_589e7a4af8c6472a5693150cdf3"');
    await queryRunner.query('ALTER TABLE "core"."metaLeadForm" DROP CONSTRAINT "FK_058976214c48615967a6fea4357"');
    await queryRunner.query('DROP INDEX "core"."IDX_META_SHEET_LEAD_SOURCE"');
    await queryRunner.query('DROP TABLE "core"."metaSheetLead"');
    await queryRunner.query('DROP INDEX "core"."IDX_META_LEAD_FORM_SHEET"');
    await queryRunner.query('DROP TABLE "core"."metaLeadForm"');
  }
}
