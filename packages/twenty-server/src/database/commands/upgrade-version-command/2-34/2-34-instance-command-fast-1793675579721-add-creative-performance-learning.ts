import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793675579721)
export class AddCreativePerformanceLearningFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeAdLink" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "sourceProjectId" uuid NOT NULL, "companyId" uuid, "sourceId" uuid NOT NULL, "adId" text NOT NULL, "taskId" uuid NOT NULL, "assetId" uuid NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "state" text NOT NULL, "reviewedVersion" integer, "reviewedBy" uuid, "reviewedByName" text, "reviewedAt" TIMESTAMP WITH TIME ZONE, "correctsId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_93b02b8f09aa9e316455ac5312" CHECK ((state IN (\'REVIEWED\',\'RETRACTED\') AND "reviewedVersion" IS NOT NULL AND "reviewedVersion"="currentVersion" AND "reviewedBy" IS NOT NULL AND "reviewedBy"<>"createdBy" AND "reviewedAt" IS NOT NULL) OR (state NOT IN (\'REVIEWED\',\'RETRACTED\') AND "reviewedVersion" IS NULL AND "correctsId" IS NULL)), CONSTRAINT "CHK_e2a5fda735b68a8843b53ca652" CHECK ("correctsId" IS NULL OR "correctsId"<>id), CONSTRAINT "CHK_931584ef84ba3fac04f9f9890a" CHECK (state IN (\'DRAFT\',\'SUBMITTED\',\'CHANGES_REQUESTED\',\'REVIEWED\',\'RETRACTED\') AND revision>0 AND "currentVersion">0), CONSTRAINT "PK_c1abaa8b607722bf1cfb60d00a3" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_399b0b58b28e912c1259bcc79a" ON "core"."deliveryCreativeAdLink" ("workspaceId", "correctsId") ');
    await queryRunner.query('CREATE INDEX "IDX_ffaf78cf132f6d7b14f2680d63" ON "core"."deliveryCreativeAdLink" ("workspaceId", "sourceId", "adId", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_357a588d621cb4de3e1d80f241" ON "core"."deliveryCreativeAdLink" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_02eee1d1fb69bb0b54dda60ba2" ON "core"."deliveryCreativeAdLink" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeAdVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "linkId" uuid NOT NULL, "version" integer NOT NULL, "body" jsonb NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_247f37ad77c603b8a6e7b58709" CHECK (version>0 AND jsonb_typeof(body)=\'object\'), CONSTRAINT "PK_ecb20385c9a814ee16c192e41e1" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_a5621f357c8744b5cb551d08f4" ON "core"."deliveryCreativeAdVersion" ("workspaceId", "linkId", "version") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeLearningEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "linkId" uuid NOT NULL, "requestId" uuid NOT NULL, "inputHash" text NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "actorName" text NOT NULL, "action" text NOT NULL, "revision" integer NOT NULL, "version" integer NOT NULL, "state" text NOT NULL, "note" text NOT NULL, "lessonId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_5c6ce65233f65ae9479051859f" CHECK (state IN (\'DRAFT\',\'SUBMITTED\',\'CHANGES_REQUESTED\',\'REVIEWED\',\'RETRACTED\')), CONSTRAINT "CHK_ddfa99d5aee1ec8aa91aa192fe" CHECK (action IN (\'SAVE\',\'SUBMIT\',\'REVIEW\',\'REQUEST_CHANGES\',\'RETRACT\',\'LESSON\')), CONSTRAINT "CHK_24c1af785e6a2ec30b5662cdb1" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\' AND revision>0 AND version>0), CONSTRAINT "PK_97849c748fa21391b0c58e7b31e" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_e0e662b0f2137edd92eb2627f3" ON "core"."deliveryCreativeLearningEvent" ("workspaceId", "linkId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_90a0bc24e1f5a509669d43776b" ON "core"."deliveryCreativeLearningEvent" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCreativeLesson" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "anchorLinkId" uuid NOT NULL, "linkIds" uuid array NOT NULL, "body" jsonb NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "correctsId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_12e9d2a714d198b26eb4c1bfdc" CHECK ("correctsId" IS NULL OR "correctsId"<>id), CONSTRAINT "CHK_b6eaf6e54a0440c85f88306c33" CHECK (jsonb_typeof(body)=\'object\' AND cardinality("linkIds") BETWEEN 1 AND 5 AND "linkIds"[1]="anchorLinkId"), CONSTRAINT "PK_1a2cf921500b04f230e9a1e5499" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_14b8e657469fa7d17973d3a31e" ON "core"."deliveryCreativeLesson" ("workspaceId", "correctsId") ');
    await queryRunner.query('CREATE INDEX "IDX_f4a7fdc110c0597204fe807b6f" ON "core"."deliveryCreativeLesson" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_499fdcd0bfe80117508707b68f" ON "core"."deliveryCreativeLesson" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" ADD CONSTRAINT "FK_39a6d9e3d692af3e03107b96fbb" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" ADD CONSTRAINT "FK_36b8c5caf588dbb7c77b671380c" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" ADD CONSTRAINT "FK_5336fa72822ac9624b8230d6bdb" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" ADD CONSTRAINT "FK_19f564d18954c5d77f9d867d77b" FOREIGN KEY ("workspaceId", "sourceProjectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" ADD CONSTRAINT "FK_399b0b58b28e912c1259bcc79a4" FOREIGN KEY ("workspaceId", "correctsId") REFERENCES "core"."deliveryCreativeAdLink"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdVersion" ADD CONSTRAINT "FK_d67e5b0490473346034976dfa15" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdVersion" ADD CONSTRAINT "FK_1e710a7ce035234475b47f38e9b" FOREIGN KEY ("workspaceId", "linkId") REFERENCES "core"."deliveryCreativeAdLink"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLearningEvent" ADD CONSTRAINT "FK_463ef2188dd41b866ae91d62986" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLearningEvent" ADD CONSTRAINT "FK_06b46bd509c597af58cb22acbb4" FOREIGN KEY ("workspaceId", "linkId") REFERENCES "core"."deliveryCreativeAdLink"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" ADD CONSTRAINT "FK_3ceda95a323e5fd4e3b02f39ee4" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" ADD CONSTRAINT "FK_f7cb327c155724b98e18104ef26" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" ADD CONSTRAINT "FK_3b9ce5836f4da2516ca4ff384a0" FOREIGN KEY ("workspaceId", "anchorLinkId") REFERENCES "core"."deliveryCreativeAdLink"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" ADD CONSTRAINT "FK_14b8e657469fa7d17973d3a31e3" FOREIGN KEY ("workspaceId", "correctsId") REFERENCES "core"."deliveryCreativeLesson"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryCreativeAdLink")
        OR EXISTS (SELECT 1 FROM core."deliveryCreativeAdVersion")
        OR EXISTS (SELECT 1 FROM core."deliveryCreativeLearningEvent")
        OR EXISTS (SELECT 1 FROM core."deliveryCreativeLesson")
        OR EXISTS (SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='creative-learning')
        OR EXISTS (SELECT 1 FROM core."deliveryTask" task CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(task.details->'submissions')='array' THEN task.details->'submissions' ELSE '[]'::jsonb END) submission WHERE submission->'creativeLearning' IS NOT NULL AND submission->'creativeLearning'<>'null'::jsonb)
      THEN RAISE EXCEPTION 'Cannot remove retained creative learning history';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" DROP CONSTRAINT "FK_14b8e657469fa7d17973d3a31e3"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" DROP CONSTRAINT "FK_3b9ce5836f4da2516ca4ff384a0"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" DROP CONSTRAINT "FK_f7cb327c155724b98e18104ef26"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLesson" DROP CONSTRAINT "FK_3ceda95a323e5fd4e3b02f39ee4"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLearningEvent" DROP CONSTRAINT "FK_06b46bd509c597af58cb22acbb4"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeLearningEvent" DROP CONSTRAINT "FK_463ef2188dd41b866ae91d62986"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdVersion" DROP CONSTRAINT "FK_1e710a7ce035234475b47f38e9b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdVersion" DROP CONSTRAINT "FK_d67e5b0490473346034976dfa15"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" DROP CONSTRAINT "FK_399b0b58b28e912c1259bcc79a4"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" DROP CONSTRAINT "FK_19f564d18954c5d77f9d867d77b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" DROP CONSTRAINT "FK_5336fa72822ac9624b8230d6bdb"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" DROP CONSTRAINT "FK_36b8c5caf588dbb7c77b671380c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCreativeAdLink" DROP CONSTRAINT "FK_39a6d9e3d692af3e03107b96fbb"');
    await queryRunner.query('DROP INDEX "core"."IDX_499fdcd0bfe80117508707b68f"');
    await queryRunner.query('DROP INDEX "core"."IDX_f4a7fdc110c0597204fe807b6f"');
    await queryRunner.query('DROP INDEX "core"."IDX_14b8e657469fa7d17973d3a31e"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeLesson"');
    await queryRunner.query('DROP INDEX "core"."IDX_90a0bc24e1f5a509669d43776b"');
    await queryRunner.query('DROP INDEX "core"."IDX_e0e662b0f2137edd92eb2627f3"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeLearningEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_a5621f357c8744b5cb551d08f4"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeAdVersion"');
    await queryRunner.query('DROP INDEX "core"."IDX_02eee1d1fb69bb0b54dda60ba2"');
    await queryRunner.query('DROP INDEX "core"."IDX_357a588d621cb4de3e1d80f241"');
    await queryRunner.query('DROP INDEX "core"."IDX_ffaf78cf132f6d7b14f2680d63"');
    await queryRunner.query('DROP INDEX "core"."IDX_399b0b58b28e912c1259bcc79a"');
    await queryRunner.query('DROP TABLE "core"."deliveryCreativeAdLink"');
  }
}
