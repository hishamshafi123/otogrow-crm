import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793663177944)
export class AddSeoOutcomeReportsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliverySeoReport" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "createdBy" uuid NOT NULL, "ownerId" uuid NOT NULL, "ownerName" text NOT NULL, "createdByName" text NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "status" text NOT NULL, "title" text NOT NULL, "periodStart" date NOT NULL, "periodEnd" date NOT NULL, "approvedVersion" integer, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_235b2daf3df1cfa68db7f1d359" CHECK ((status=\'APPROVED\' AND "approvedVersion" IS NOT NULL AND "approvedVersion"="currentVersion" AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR (status<>\'APPROVED\' AND "approvedVersion" IS NULL)), CONSTRAINT "CHK_9ba6f5dbbb83d9258166cfdd36" CHECK ("periodStart"<="periodEnd" AND length(btrim(title)) BETWEEN 1 AND 200), CONSTRAINT "CHK_5a9daac64ec86e17139c24d28b" CHECK (status IN (\'DRAFT\',\'SUBMITTED\',\'APPROVED\',\'CHANGES_REQUESTED\')), CONSTRAINT "CHK_a00c78a1957045e3db3b2338d8" CHECK (revision>0 AND "currentVersion">0), CONSTRAINT "PK_4d206245a372d19a80ed4d3b4e1" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_4ed669f986be75208a87ca6573" ON "core"."deliverySeoReport" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_9d8fca370d9f1c5077de8b4dfe" ON "core"."deliverySeoReport" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliverySeoVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reportId" uuid NOT NULL, "version" integer NOT NULL, "body" jsonb NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_5ef7bd53c24937ee5aaf0f3b91" CHECK (jsonb_typeof(body)=\'object\'), CONSTRAINT "CHK_65262ff04c28de763a5b0cc0c4" CHECK (version>0), CONSTRAINT "PK_5134c0e45eeed24e5b380faa85e" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_7fa5396fdb6bc833a205e228db" ON "core"."deliverySeoVersion" ("workspaceId", "reportId", "version") ');
    await queryRunner.query('CREATE TABLE "core"."deliverySeoEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reportId" uuid NOT NULL, "requestId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "actorName" text NOT NULL, "inputHash" text NOT NULL, "action" text NOT NULL, "note" text NOT NULL, "revision" integer NOT NULL, "version" integer NOT NULL, "status" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_f5d8cbb4d3ec5fc4efa77512dc" CHECK (status IN (\'DRAFT\',\'SUBMITTED\',\'APPROVED\',\'CHANGES_REQUESTED\')), CONSTRAINT "CHK_2621e34b9f44ef5287f86a3e6b" CHECK (action IN (\'SAVE\',\'SUBMIT\',\'APPROVE\',\'REQUEST_CHANGES\')), CONSTRAINT "CHK_714b81e5db4d1584b3fe140df1" CHECK (revision>0 AND version>0), CONSTRAINT "PK_b2708bac256751a3a4e72f810f9" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_6d3dc7a218de519632857cd5c5" ON "core"."deliverySeoEvent" ("workspaceId", "reportId", "revision") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_0c3dab3d01495771bb0b4fce0e" ON "core"."deliverySeoEvent" ("workspaceId", "requestId") ');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoReport" ADD CONSTRAINT "FK_7cd4dbc58d4a2b98595c4ea8a20" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoReport" ADD CONSTRAINT "FK_b71e0622165bb29317ba7e5acad" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoVersion" ADD CONSTRAINT "FK_45ec2b9f75d74b40e3df6af6ffe" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoVersion" ADD CONSTRAINT "FK_c34af9e6980f61b9a64919d2a06" FOREIGN KEY ("workspaceId", "reportId") REFERENCES "core"."deliverySeoReport"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" ADD CONSTRAINT "FK_2f46c24d442f1bc1c8f3592b07f" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" ADD CONSTRAINT "FK_53b356fb1465175dd5e524d83af" FOREIGN KEY ("workspaceId", "reportId") REFERENCES "core"."deliverySeoReport"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" ADD CONSTRAINT "FK_6f42e3d3c44b8975676cd658445" FOREIGN KEY ("workspaceId", "reportId", "version") REFERENCES "core"."deliverySeoVersion"("workspaceId","reportId","version") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliverySeoReport")
        OR EXISTS (SELECT 1 FROM core."deliverySeoVersion")
        OR EXISTS (SELECT 1 FROM core."deliverySeoEvent")
        OR EXISTS (SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='seo-report')
      THEN RAISE EXCEPTION 'Cannot remove retained SEO report history'; END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" DROP CONSTRAINT "FK_6f42e3d3c44b8975676cd658445"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" DROP CONSTRAINT "FK_53b356fb1465175dd5e524d83af"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoEvent" DROP CONSTRAINT "FK_2f46c24d442f1bc1c8f3592b07f"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoVersion" DROP CONSTRAINT "FK_c34af9e6980f61b9a64919d2a06"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoVersion" DROP CONSTRAINT "FK_45ec2b9f75d74b40e3df6af6ffe"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoReport" DROP CONSTRAINT "FK_b71e0622165bb29317ba7e5acad"');
    await queryRunner.query('ALTER TABLE "core"."deliverySeoReport" DROP CONSTRAINT "FK_7cd4dbc58d4a2b98595c4ea8a20"');
    await queryRunner.query('DROP INDEX "core"."IDX_0c3dab3d01495771bb0b4fce0e"');
    await queryRunner.query('DROP INDEX "core"."IDX_6d3dc7a218de519632857cd5c5"');
    await queryRunner.query('DROP TABLE "core"."deliverySeoEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_7fa5396fdb6bc833a205e228db"');
    await queryRunner.query('DROP TABLE "core"."deliverySeoVersion"');
    await queryRunner.query('DROP INDEX "core"."IDX_9d8fca370d9f1c5077de8b4dfe"');
    await queryRunner.query('DROP INDEX "core"."IDX_4ed669f986be75208a87ca6573"');
    await queryRunner.query('DROP TABLE "core"."deliverySeoReport"');
  }
}
