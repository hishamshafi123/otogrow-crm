import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793810789786)
export class AddContentPostingWorkflowFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryContentAccount" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "revision" integer NOT NULL, "platform" text NOT NULL, "name" text NOT NULL, "handle" text NOT NULL, "profileUrl" text NOT NULL, "archived" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_1112aa1206adc1c6624f4b876a" CHECK (length(btrim(name)) BETWEEN 1 AND 200 AND length(btrim(handle)) BETWEEN 1 AND 200), CONSTRAINT "CHK_52ffde5c891ac424d2289997e9" CHECK (platform IN (\'X\',\'INSTAGRAM\',\'FACEBOOK\',\'TIKTOK\')), CONSTRAINT "CHK_ccdc8bfeb090aa4dc006e9e6e4" CHECK (revision>0), CONSTRAINT "PK_ab16a8561f7cf93993754ddbd49" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_312fc0d8de1475bd7124af736f" ON "core"."deliveryContentAccount" ("workspaceId", "projectId", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_dff3954ad0696524a69c4fd41f" ON "core"."deliveryContentAccount" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryContentPlan" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "revision" integer NOT NULL, "title" text NOT NULL, "purpose" text NOT NULL, "engagementId" uuid, "service" text, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_18eb9a435462acfe72dbeb39ae" CHECK (("engagementId" IS NULL)=(service IS NULL)), CONSTRAINT "CHK_2d5f2f3213e69c1d6d8575a471" CHECK (revision>0 AND length(btrim(title)) BETWEEN 1 AND 200), CONSTRAINT "PK_4596cbf135cfaaeb83074e6e2a2" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_d30701d1a72a675710f5666bbf" ON "core"."deliveryContentPlan" ("workspaceId", "projectId", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_23a3ce020ae6ff0e0e577e01b7" ON "core"."deliveryContentPlan" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryContentVariant" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "planId" uuid NOT NULL, "accountId" uuid NOT NULL, "assetTaskId" uuid, "ownerId" uuid NOT NULL, "reviewerId" uuid NOT NULL, "createdBy" uuid NOT NULL, "submittedBy" uuid, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "status" text NOT NULL, "plannedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "approvedVersion" integer, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_78c1dc29dad45ffb6aac02d8c5" CHECK ("ownerId"<>"reviewerId"), CONSTRAINT "CHK_b129a9d4e1e75aab7b338c3cd5" CHECK ((status IN (\'APPROVED\',\'PUBLISHED\') AND "approvedVersion"="currentVersion" AND "approvedVersion" IS NOT NULL AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR (status NOT IN (\'APPROVED\',\'PUBLISHED\') AND "approvedVersion" IS NULL)), CONSTRAINT "CHK_750544c5b9a9aa9ec8562f2799" CHECK (status IN (\'DRAFT\',\'REVIEW\',\'APPROVED\',\'CHANGES_REQUESTED\',\'PUBLISHED\',\'CANCELLED\')), CONSTRAINT "CHK_ed3e2862a5eef55ef2a3bf8511" CHECK (revision>0 AND "currentVersion">0), CONSTRAINT "PK_593ba2f592c509a4d0404c5ac7a" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_9f49e787e241027ca88417efb2" ON "core"."deliveryContentVariant" ("workspaceId", "projectId", "plannedAt", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_f1f884edf3108b4f2796cfc687" ON "core"."deliveryContentVariant" ("workspaceId", "projectId", "planId", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_76bcbae3d10ea9bf9ee3e2a5f5" ON "core"."deliveryContentVariant" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      "CREATE TABLE \"core\".\"deliveryContentVersion\" (\"workspaceId\" uuid NOT NULL, \"id\" uuid NOT NULL, \"variantId\" uuid NOT NULL, \"version\" integer NOT NULL, \"body\" jsonb NOT NULL, \"createdBy\" uuid NOT NULL, \"createdAt\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT \"CHK_c722e2d1c650f729b45f37b69f\" CHECK (CASE WHEN jsonb_typeof(body->'contributorIds')='array' THEN jsonb_array_length(body->'contributorIds') BETWEEN 1 AND 50 ELSE false END), CONSTRAINT \"CHK_677d34024cb473a93f85cc5e83\" CHECK (COALESCE(jsonb_typeof(body->'account')='object' AND jsonb_typeof(body->'accountId')='string' AND body->>'accountId'=body->'account'->>'id' AND jsonb_typeof(body->'ownerId')='string' AND jsonb_typeof(body->'reviewerId')='string' AND jsonb_typeof(body->'caption')='string' AND jsonb_typeof(body->'plannedAt')='string' AND jsonb_typeof(body->'plannedLocal')='string' AND jsonb_typeof(body->'timezone')='string' AND body->>'format' IN ('TEXT','IMAGE','VIDEO') AND (body->'asset'='null'::jsonb OR jsonb_typeof(body->'asset')='object'),false)), CONSTRAINT \"CHK_17f1a2a6e6ad3b3c38d0eb4775\" CHECK (COALESCE(body->>'sourceFingerprint' ~ '^[a-f0-9]{64}$', false)), CONSTRAINT \"CHK_e1d66244b73578cce48af9e9e0\" CHECK (jsonb_typeof(body)='object' AND octet_length(body::text)<=100000), CONSTRAINT \"CHK_00168330300696a1afc45cfd44\" CHECK (version>0), CONSTRAINT \"PK_4f82a9e47fdd4d33d1d9bf0bff5\" PRIMARY KEY (\"id\"))",
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_e7f1002076dded0cd49005fe52" ON "core"."deliveryContentVersion" ("workspaceId", "variantId", "version") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryContentEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "requestId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "actorName" text NOT NULL, "inputHash" text NOT NULL, "targetKind" text NOT NULL, "targetId" uuid NOT NULL, "accountId" uuid, "planId" uuid, "variantId" uuid, "version" integer, "revision" integer NOT NULL, "action" text NOT NULL, "status" text NOT NULL, "note" text NOT NULL, "evidenceUrl" text NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "correctsEventId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_ea1947f4f4931e8be0a67c6e74" CHECK (action IN (\'SAVE_ACCOUNT\',\'SAVE_PLAN\',\'SAVE\',\'SUBMIT\',\'APPROVE\',\'REQUEST_CHANGES\',\'RECORD_PUBLICATION\',\'RECORD_FAILED\',\'RECORD_UNCERTAIN\',\'CORRECT_PUBLICATION\',\'CANCEL\')), CONSTRAINT "CHK_b3f6a88529cf12628bfcd06bed" CHECK ((action IN (\'RECORD_PUBLICATION\',\'CORRECT_PUBLICATION\'))=("publishedAt" IS NOT NULL AND length("evidenceUrl")>0)), CONSTRAINT "CHK_7c4169469947ef8589c8eb519e" CHECK ((action=\'CORRECT_PUBLICATION\')=("correctsEventId" IS NOT NULL)), CONSTRAINT "CHK_e6db75ca08d96a965242c95f6d" CHECK (("targetKind"=\'ACCOUNT\' AND "accountId"="targetId" AND "accountId" IS NOT NULL AND "planId" IS NULL AND "variantId" IS NULL AND version IS NULL) OR ("targetKind"=\'PLAN\' AND "planId"="targetId" AND "planId" IS NOT NULL AND "accountId" IS NULL AND "variantId" IS NULL AND version IS NULL) OR ("targetKind"=\'VARIANT\' AND "variantId"="targetId" AND "variantId" IS NOT NULL AND "planId" IS NOT NULL AND "accountId" IS NULL AND version IS NOT NULL AND version>0)), CONSTRAINT "CHK_0ccd39a5f83b5d5d1078138578" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_460e0e1d948903ee9d42be99fb" CHECK (revision>0), CONSTRAINT "PK_4febe87ec78c52953fc4cb13795" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_ac63128759e322510e71c07e7a" ON "core"."deliveryContentEvent" ("workspaceId", "targetKind", "targetId", "revision") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_30eee65bfc1d97d8a2650f07c5" ON "core"."deliveryContentEvent" ("workspaceId", "variantId", "version", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_dfe6afc13ac6c4f69d57b61fa7" ON "core"."deliveryContentEvent" ("workspaceId", "requestId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentAccount" ADD CONSTRAINT "FK_d750faf430178032e13227ebf2e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentAccount" ADD CONSTRAINT "FK_458916e46f101dc24500822ecb9" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentPlan" ADD CONSTRAINT "FK_18944eacb9822ccd0bf23f56696" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentPlan" ADD CONSTRAINT "FK_84c509c9983a79251b344728eec" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" ADD CONSTRAINT "FK_fec93788fb8b0844de3512c59c1" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" ADD CONSTRAINT "FK_6eb5a1dd59697eacc1c2fb2fe3d" FOREIGN KEY ("workspaceId", "projectId", "planId") REFERENCES "core"."deliveryContentPlan"("workspaceId","projectId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" ADD CONSTRAINT "FK_eccaf0dfe76a5a3b598b8078de4" FOREIGN KEY ("workspaceId", "projectId", "accountId") REFERENCES "core"."deliveryContentAccount"("workspaceId","projectId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVersion" ADD CONSTRAINT "FK_ce43f130f15189b0aa923655d1b" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVersion" ADD CONSTRAINT "FK_35e2ae41aa0ece1205e31a48274" FOREIGN KEY ("workspaceId", "variantId") REFERENCES "core"."deliveryContentVariant"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" ADD CONSTRAINT "FK_73f1dcc50b6206515817ecc5a2a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" ADD CONSTRAINT "FK_744672e950aa155cadbde4274e5" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "core"."deliveryContentAccount"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" ADD CONSTRAINT "FK_9d9b1fe996f9fc02b06f58992d1" FOREIGN KEY ("workspaceId", "planId") REFERENCES "core"."deliveryContentPlan"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" ADD CONSTRAINT "FK_7e5446eca7eb6cee579915e9cc7" FOREIGN KEY ("workspaceId", "variantId", "version") REFERENCES "core"."deliveryContentVersion"("workspaceId","variantId","version") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" ADD CONSTRAINT "FK_af21f668a431f65a646a35d46ce" FOREIGN KEY ("workspaceId", "variantId", "version", "correctsEventId") REFERENCES "core"."deliveryContentEvent"("workspaceId","variantId","version","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [history]: { retained: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM core."deliveryContentAccount")
        OR EXISTS (SELECT 1 FROM core."deliveryContentPlan")
        OR EXISTS (SELECT 1 FROM core."deliveryContentVariant")
        OR EXISTS (SELECT 1 FROM core."deliveryContentVersion")
        OR EXISTS (SELECT 1 FROM core."deliveryContentEvent")
        OR EXISTS (
          SELECT 1 FROM core."otogrowActivityEvent"
          WHERE "sourceType" IN ('content-account', 'content-plan', 'content-post')
             OR left(action, 16) = 'CONTENT_ACCOUNT_'
             OR left(action, 13) = 'CONTENT_PLAN_'
             OR left(action, 13) = 'CONTENT_POST_'
        ) AS retained
    `);

    if (history.retained) {
      throw new Error('Cannot remove retained content posting history.');
    }

    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" DROP CONSTRAINT "FK_af21f668a431f65a646a35d46ce"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" DROP CONSTRAINT "FK_7e5446eca7eb6cee579915e9cc7"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" DROP CONSTRAINT "FK_9d9b1fe996f9fc02b06f58992d1"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" DROP CONSTRAINT "FK_744672e950aa155cadbde4274e5"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentEvent" DROP CONSTRAINT "FK_73f1dcc50b6206515817ecc5a2a"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVersion" DROP CONSTRAINT "FK_35e2ae41aa0ece1205e31a48274"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVersion" DROP CONSTRAINT "FK_ce43f130f15189b0aa923655d1b"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" DROP CONSTRAINT "FK_eccaf0dfe76a5a3b598b8078de4"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" DROP CONSTRAINT "FK_6eb5a1dd59697eacc1c2fb2fe3d"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentVariant" DROP CONSTRAINT "FK_fec93788fb8b0844de3512c59c1"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentPlan" DROP CONSTRAINT "FK_84c509c9983a79251b344728eec"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentPlan" DROP CONSTRAINT "FK_18944eacb9822ccd0bf23f56696"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentAccount" DROP CONSTRAINT "FK_458916e46f101dc24500822ecb9"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryContentAccount" DROP CONSTRAINT "FK_d750faf430178032e13227ebf2e"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_dfe6afc13ac6c4f69d57b61fa7"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_30eee65bfc1d97d8a2650f07c5"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_ac63128759e322510e71c07e7a"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryContentEvent"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_e7f1002076dded0cd49005fe52"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryContentVersion"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_76bcbae3d10ea9bf9ee3e2a5f5"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_f1f884edf3108b4f2796cfc687"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_9f49e787e241027ca88417efb2"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryContentVariant"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_23a3ce020ae6ff0e0e577e01b7"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d30701d1a72a675710f5666bbf"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryContentPlan"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_dff3954ad0696524a69c4fd41f"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_312fc0d8de1475bd7124af736f"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryContentAccount"');
  }
}
