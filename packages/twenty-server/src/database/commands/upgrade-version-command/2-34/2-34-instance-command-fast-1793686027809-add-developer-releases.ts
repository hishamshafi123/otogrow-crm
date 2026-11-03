import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793686027809)
export class AddDeveloperReleasesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryRelease" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "createdBy" uuid NOT NULL, "ownerId" uuid NOT NULL, "ownerName" text NOT NULL, "createdByName" text NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "status" text NOT NULL, "title" text NOT NULL, "targetDate" date NOT NULL, "approvedVersion" integer, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_44f26bc227ac906f97be2909d6" CHECK ((status IN (\'APPROVED\',\'DEPLOYED\',\'HANDED_OVER\',\'ACCEPTED\') AND "approvedVersion" IS NOT NULL AND "approvedVersion"="currentVersion" AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR (status NOT IN (\'APPROVED\',\'DEPLOYED\',\'HANDED_OVER\',\'ACCEPTED\') AND "approvedVersion" IS NULL)), CONSTRAINT "CHK_15a03332865070c2fe3fe1afb9" CHECK (length(btrim(title)) BETWEEN 1 AND 200), CONSTRAINT "CHK_43093ce1dc04f3064698b37766" CHECK (status IN (\'DRAFT\',\'SUBMITTED\',\'APPROVED\',\'CHANGES_REQUESTED\',\'DEPLOYED\',\'HANDED_OVER\',\'ACCEPTED\')), CONSTRAINT "CHK_efba57808f3d458335370621f8" CHECK (revision>0 AND "currentVersion">0), CONSTRAINT "PK_64896075835d5f3fc6691624d12" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_695508580c9b7c6582c01a4dea" ON "core"."deliveryRelease" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_c74cf1b73a30a0fd15f230db1a" ON "core"."deliveryRelease" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryReleaseVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "releaseId" uuid NOT NULL, "version" integer NOT NULL, "body" jsonb NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_14cfa93b018385755295c47601" CHECK (COALESCE(body->>\'sourceFingerprint\' ~ \'^[a-f0-9]{64}$\', false)), CONSTRAINT "CHK_5e62918583272d0c60f78b32ef" CHECK (CASE WHEN jsonb_typeof(body->\'work\')=\'array\' AND jsonb_typeof(body->\'tasks\')=\'array\' AND jsonb_typeof(body->\'checks\')=\'array\' THEN jsonb_array_length(body->\'work\')<=30 AND jsonb_array_length(body->\'tasks\')<=30 AND jsonb_array_length(body->\'checks\')<=30 ELSE false END), CONSTRAINT "CHK_1ad22b248d1be5341cb1d3b673" CHECK (jsonb_typeof(body)=\'object\'), CONSTRAINT "CHK_457b5080bc3dce227e96c821d8" CHECK (version>0), CONSTRAINT "PK_cd59c5713debca4a691d7921236" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_63e49fba9e0960374ade64e290" ON "core"."deliveryReleaseVersion" ("workspaceId", "releaseId", "version") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryReleaseEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "releaseId" uuid NOT NULL, "requestId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "actorName" text NOT NULL, "inputHash" text NOT NULL, "action" text NOT NULL, "note" text NOT NULL, "evidenceUrl" text NOT NULL, "commitSha" text NOT NULL, "environment" text NOT NULL, "revision" integer NOT NULL, "version" integer NOT NULL, "status" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_d7c9644ae33e9f9e515bcd27c8" CHECK (status IN (\'DRAFT\',\'SUBMITTED\',\'APPROVED\',\'CHANGES_REQUESTED\',\'DEPLOYED\',\'HANDED_OVER\',\'ACCEPTED\')), CONSTRAINT "CHK_9ed29ee3ee5d2c5ce1cba11b30" CHECK (action IN (\'SAVE\',\'SUBMIT\',\'APPROVE\',\'REQUEST_CHANGES\',\'RECORD_DEPLOYMENT\',\'RECORD_DEPLOYMENT_FAILED\',\'RECORD_HANDOVER\',\'RECORD_ACCEPTANCE\')), CONSTRAINT "CHK_528568dc73a523477d8570ad47" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_0cf2c969b659120f804200386d" CHECK (revision>0 AND version>0), CONSTRAINT "PK_2206e46a86e4c8163e34640ab16" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_f978eb4692a25660c4bec7608b" ON "core"."deliveryReleaseEvent" ("workspaceId", "releaseId", "revision") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_063872e81f25ed95868eb03a8c" ON "core"."deliveryReleaseEvent" ("workspaceId", "requestId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryRelease" ADD CONSTRAINT "FK_e2dee64fd496c31b12418ac164e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryRelease" ADD CONSTRAINT "FK_9e43910f7054510742a08972b7e" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseVersion" ADD CONSTRAINT "FK_64ffba946a61973ad3c46b6a93a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseVersion" ADD CONSTRAINT "FK_8d60f20b3603edd3bca7e16aa71" FOREIGN KEY ("workspaceId", "releaseId") REFERENCES "core"."deliveryRelease"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" ADD CONSTRAINT "FK_849495798515b576303b2c5e988" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" ADD CONSTRAINT "FK_91f56201d05c14c74efc2c541df" FOREIGN KEY ("workspaceId", "releaseId") REFERENCES "core"."deliveryRelease"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" ADD CONSTRAINT "FK_f46f8c9d46e11addf5156450b5d" FOREIGN KEY ("workspaceId", "releaseId", "version") REFERENCES "core"."deliveryReleaseVersion"("workspaceId","releaseId","version") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ retained }]: { retained: boolean }[] = await queryRunner.query(`
      SELECT EXISTS(SELECT 1 FROM core."deliveryRelease")
        OR EXISTS(SELECT 1 FROM core."deliveryReleaseVersion")
        OR EXISTS(SELECT 1 FROM core."deliveryReleaseEvent")
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='development-release' OR left(action,20)='DEVELOPMENT_RELEASE_') AS retained
    `);
    if (retained) throw new Error('Cannot remove retained developer release history.');

    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" DROP CONSTRAINT "FK_f46f8c9d46e11addf5156450b5d"');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" DROP CONSTRAINT "FK_91f56201d05c14c74efc2c541df"');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseEvent" DROP CONSTRAINT "FK_849495798515b576303b2c5e988"');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseVersion" DROP CONSTRAINT "FK_8d60f20b3603edd3bca7e16aa71"');
    await queryRunner.query('ALTER TABLE "core"."deliveryReleaseVersion" DROP CONSTRAINT "FK_64ffba946a61973ad3c46b6a93a"');
    await queryRunner.query('ALTER TABLE "core"."deliveryRelease" DROP CONSTRAINT "FK_9e43910f7054510742a08972b7e"');
    await queryRunner.query('ALTER TABLE "core"."deliveryRelease" DROP CONSTRAINT "FK_e2dee64fd496c31b12418ac164e"');
    await queryRunner.query('DROP INDEX "core"."IDX_063872e81f25ed95868eb03a8c"');
    await queryRunner.query('DROP INDEX "core"."IDX_f978eb4692a25660c4bec7608b"');
    await queryRunner.query('DROP TABLE "core"."deliveryReleaseEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_63e49fba9e0960374ade64e290"');
    await queryRunner.query('DROP TABLE "core"."deliveryReleaseVersion"');
    await queryRunner.query('DROP INDEX "core"."IDX_c74cf1b73a30a0fd15f230db1a"');
    await queryRunner.query('DROP INDEX "core"."IDX_695508580c9b7c6582c01a4dea"');
    await queryRunner.query('DROP TABLE "core"."deliveryRelease"');
  }
}
