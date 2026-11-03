import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793290192171)
export class AddDeliveryAtlasMediaFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryAtlasCredential" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "apiKey" text NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_294fa0b8dbb3c8a6b58d24b9e4" CHECK ("apiKey" LIKE \'enc:v2:%\'), CONSTRAINT "PK_7ca71199e28eaed793db95a32c6" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_6c55e883ca209c62823f6a66e1" ON "core"."deliveryAtlasCredential" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryAtlasConnection" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "revision" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "credentialId" uuid, "enabledProfileIds" text array NOT NULL DEFAULT \'{}\', "defaultImageFamilyId" text, "defaultClipProfileId" text, "reservationLimits" jsonb NOT NULL DEFAULT \'[]\', "verifiedAt" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_22fdde5eb4928f97a8955a79fc" CHECK (revision>0), CONSTRAINT "PK_e117134431e2b0d0cc9bacf08a9" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_b8b41d8b635fd443a55ab4cea3" ON "core"."deliveryAtlasConnection" ("workspaceId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryAtlasJob" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestId" uuid NOT NULL, "taskId" uuid NOT NULL, "projectId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "credentialId" uuid NOT NULL, "configurationRevision" integer NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "requestHash" text NOT NULL, "quoteToken" text NOT NULL, "status" text NOT NULL, "request" jsonb NOT NULL, "referenceUrls" text array NOT NULL DEFAULT \'{}\', "reservationLimit" jsonb NOT NULL, "quotedCostUsd" text NOT NULL, "quoteEstimated" boolean NOT NULL, "quotedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "providerPredictionId" text, "providerStatus" text, "outputUrl" text, "publicationCancelled" boolean NOT NULL DEFAULT false, "assetId" uuid, "costState" text NOT NULL DEFAULT \'UNRESERVED\', "error" text, "leaseToken" uuid, "leaseUntil" TIMESTAMP WITH TIME ZONE, "nextAttemptAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT \'0\', "submittedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_536a6fdd29ce1f7702b41240d6" CHECK (length("requestHash")=64 AND length("quoteToken")=64), CONSTRAINT "CHK_0c2e468595deab5c1889bab0c9" CHECK (status IN (\'QUOTED\',\'QUEUED\',\'SUBMITTING\',\'POLLING\',\'DOWNLOADING\',\'SUCCEEDED\',\'FAILED\',\'UNCERTAIN\',\'CANCELLED\')), CONSTRAINT "CHK_9f54890763d3b9c047d29fb6f5" CHECK (revision>0 AND attempts>=0 AND "configurationRevision">0), CONSTRAINT "PK_b8a508ec3e95c3226fc9cf5d920" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_4081c0915e4368b07c7b5c24b1" ON "core"."deliveryAtlasJob" ("status", "nextAttemptAt") ');
    await queryRunner.query('CREATE INDEX "IDX_d854a32e577a260909b3d72611" ON "core"."deliveryAtlasJob" ("workspaceId", "taskId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_706b987db99ecef1b9cca0d35e" ON "core"."deliveryAtlasJob" ("workspaceId", "requestId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasCredential" ADD CONSTRAINT "FK_bf0692d3c95c90a17d10bb07a08" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasConnection" ADD CONSTRAINT "FK_b8b41d8b635fd443a55ab4cea3f" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasConnection" ADD CONSTRAINT "FK_0b8ae9b7399b6ffc61e341fc28c" FOREIGN KEY ("workspaceId", "credentialId") REFERENCES "core"."deliveryAtlasCredential"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" ADD CONSTRAINT "FK_f2af9af0197c2602ca9ae7efa69" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" ADD CONSTRAINT "FK_c5353baf7dcf109a70e33e348e4" FOREIGN KEY ("workspaceId", "credentialId") REFERENCES "core"."deliveryAtlasCredential"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" ADD CONSTRAINT "FK_9f87aea0e24bd2d664a2279cf1d" FOREIGN KEY ("workspaceId", "taskId") REFERENCES "core"."deliveryTask"("workspaceId","taskId") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `LOCK TABLE core."deliveryAtlasCredential",core."deliveryAtlasConnection",core."deliveryAtlasJob",core."otogrowAiSpend",core."otogrowActivityEvent" IN SHARE ROW EXCLUSIVE MODE`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM core."deliveryAtlasCredential")
        OR EXISTS(SELECT 1 FROM core."deliveryAtlasConnection")
        OR EXISTS(SELECT 1 FROM core."deliveryAtlasJob")
        OR EXISTS(SELECT 1 FROM core."otogrowAiSpend" WHERE price->>'billingType'='ATLAS_MEDIA')
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action,6)='ATLAS_')
      THEN RAISE EXCEPTION 'Atlas connection, generation or financial history exists; retain the additive schema.';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" DROP CONSTRAINT "FK_9f87aea0e24bd2d664a2279cf1d"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" DROP CONSTRAINT "FK_c5353baf7dcf109a70e33e348e4"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasJob" DROP CONSTRAINT "FK_f2af9af0197c2602ca9ae7efa69"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasConnection" DROP CONSTRAINT "FK_0b8ae9b7399b6ffc61e341fc28c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasConnection" DROP CONSTRAINT "FK_b8b41d8b635fd443a55ab4cea3f"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAtlasCredential" DROP CONSTRAINT "FK_bf0692d3c95c90a17d10bb07a08"');
    await queryRunner.query('DROP TABLE "core"."deliveryAtlasJob"');
    await queryRunner.query('DROP TABLE "core"."deliveryAtlasConnection"');
    await queryRunner.query('DROP TABLE "core"."deliveryAtlasCredential"');
  }
}
