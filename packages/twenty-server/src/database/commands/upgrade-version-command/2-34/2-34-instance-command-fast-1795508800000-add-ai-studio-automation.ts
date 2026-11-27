import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508800000)
export class AddAiStudioAutomationFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioProviderConfig" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "encryptedWavespeedKey" text,
        "wavespeedKeyLast4" text,
        "wavespeedEnabled" boolean NOT NULL DEFAULT true,
        "wavespeedVerifiedAt" timestamptz,
        "wavespeedLastError" text,
        "encryptedKieKey" text,
        "kieKeyLast4" text,
        "kieEnabled" boolean NOT NULL DEFAULT true,
        "kieVerifiedAt" timestamptz,
        "kieLastError" text,
        "defaultRoutingMode" text NOT NULL DEFAULT 'AUTO_FAILOVER',
        "defaultImageModel" text NOT NULL DEFAULT 'nano-banana-2.1',
        "defaultVideoModel" text NOT NULL DEFAULT 'seedance-2.5',
        "maxConcurrentJobs" integer NOT NULL DEFAULT 4,
        "updatedById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioProviderConfig" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryStudioProviderConfig_wsKey" CHECK ("encryptedWavespeedKey" IS NULL OR "encryptedWavespeedKey" LIKE 'enc:v2:%'),
        CONSTRAINT "CHK_deliveryStudioProviderConfig_kieKey" CHECK ("encryptedKieKey" IS NULL OR "encryptedKieKey" LIKE 'enc:v2:%'),
        CONSTRAINT "CHK_deliveryStudioProviderConfig_routing" CHECK ("defaultRoutingMode" IN ('AUTO_FAILOVER','WAVESPEED_ONLY','KIE_ONLY')),
        CONSTRAINT "CHK_deliveryStudioProviderConfig_conc" CHECK ("maxConcurrentJobs" >= 1 AND "maxConcurrentJobs" <= 20),
        CONSTRAINT "FK_deliveryStudioProviderConfig_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioProviderConfig_ws" ON "core"."deliveryStudioProviderConfig" ("workspaceId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioPreset" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid,
        "projectId" uuid,
        "kind" text NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "masterPrompt" text NOT NULL DEFAULT '',
        "configJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "examplesJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "isDefault" boolean NOT NULL DEFAULT false,
        "archived" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioPreset" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryStudioPreset_kind" CHECK ("kind" IN ('CHARACTER_SHEET','VIDEO_GENERATION','TEXT_HOOK','CASTING_PERSONA')),
        CONSTRAINT "FK_deliveryStudioPreset_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioPreset_ws_id" ON "core"."deliveryStudioPreset" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioPreset_ws_kind" ON "core"."deliveryStudioPreset" ("workspaceId", "kind")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioPreset_ws_scope" ON "core"."deliveryStudioPreset" ("workspaceId", "companyId", "projectId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioReferenceVideo" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid,
        "projectId" uuid,
        "title" text NOT NULL,
        "notes" text NOT NULL DEFAULT '',
        "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "storageKey" text NOT NULL,
        "thumbnailKey" text,
        "originalFileName" text,
        "mimeType" text NOT NULL,
        "sizeBytes" bigint NOT NULL DEFAULT 0,
        "sha256" text NOT NULL,
        "mediaMeta" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stagedUrlsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "archived" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioReferenceVideo" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveryStudioReferenceVideo_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioReferenceVideo_ws_id" ON "core"."deliveryStudioReferenceVideo" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioReferenceVideo_ws_scope" ON "core"."deliveryStudioReferenceVideo" ("workspaceId", "companyId", "projectId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioProductKit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "projectId" uuid,
        "name" text NOT NULL,
        "sku" text NOT NULL DEFAULT '',
        "category" text NOT NULL DEFAULT '',
        "notes" text NOT NULL DEFAULT '',
        "assetsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "archived" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioProductKit" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveryStudioProductKit_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioProductKit_ws_id" ON "core"."deliveryStudioProductKit" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioProductKit_ws_scope" ON "core"."deliveryStudioProductKit" ("workspaceId", "companyId", "projectId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioAsset" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "projectId" uuid,
        "kind" text NOT NULL,
        "productKitId" uuid,
        "referenceVideoId" uuid,
        "characterAssetId" uuid,
        "presetId" uuid,
        "jobId" uuid,
        "title" text NOT NULL,
        "promptUsed" text NOT NULL DEFAULT '',
        "modelKey" text NOT NULL,
        "providerUsed" text NOT NULL,
        "storageKey" text NOT NULL,
        "thumbnailKey" text,
        "mimeType" text NOT NULL,
        "sizeBytes" bigint NOT NULL DEFAULT 0,
        "sha256" text NOT NULL,
        "mediaMeta" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stagedUrlsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "approved" boolean NOT NULL DEFAULT false,
        "deliverableId" uuid,
        "hookProjectId" uuid,
        "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "archived" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioAsset" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryStudioAsset_kind" CHECK ("kind" IN ('CHARACTER_SHEET','GENERATED_VIDEO')),
        CONSTRAINT "FK_deliveryStudioAsset_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioAsset_ws_id" ON "core"."deliveryStudioAsset" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioAsset_ws_scope_kind" ON "core"."deliveryStudioAsset" ("workspaceId", "companyId", "projectId", "kind")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioAsset_ws_job" ON "core"."deliveryStudioAsset" ("workspaceId", "jobId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryStudioJob" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "batchId" uuid,
        "companyId" uuid NOT NULL,
        "projectId" uuid,
        "jobKind" text NOT NULL,
        "title" text NOT NULL,
        "modelKey" text NOT NULL,
        "routingMode" text NOT NULL DEFAULT 'AUTO_FAILOVER',
        "providerUsed" text,
        "failoverTriggered" boolean NOT NULL DEFAULT false,
        "status" text NOT NULL DEFAULT 'QUEUED',
        "progress" integer NOT NULL DEFAULT 0,
        "estimatedCostUsd" text NOT NULL DEFAULT '0.0000',
        "actualCostUsd" text,
        "inputPayloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "attemptsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "outputAssetIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "externalTaskId" text,
        "errorMessage" text,
        "createdById" uuid,
        "startedAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryStudioJob" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryStudioJob_kind" CHECK ("jobKind" IN ('CHARACTER_SHEET','VIDEO_GENERATION')),
        CONSTRAINT "CHK_deliveryStudioJob_routing" CHECK ("routingMode" IN ('AUTO_FAILOVER','WAVESPEED_ONLY','KIE_ONLY')),
        CONSTRAINT "CHK_deliveryStudioJob_status" CHECK ("status" IN ('QUEUED','STAGING','PROCESSING','DOWNLOADING','COMPLETED','FAILED','CANCELLED')),
        CONSTRAINT "FK_deliveryStudioJob_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryStudioJob_ws_id" ON "core"."deliveryStudioJob" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioJob_ws_scope_created" ON "core"."deliveryStudioJob" ("workspaceId", "companyId", "projectId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioJob_ws_status" ON "core"."deliveryStudioJob" ("workspaceId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryStudioJob_ws_batch" ON "core"."deliveryStudioJob" ("workspaceId", "batchId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'DROP TABLE IF EXISTS "core"."deliveryStudioJob"',
      'DROP TABLE IF EXISTS "core"."deliveryStudioAsset"',
      'DROP TABLE IF EXISTS "core"."deliveryStudioProductKit"',
      'DROP TABLE IF EXISTS "core"."deliveryStudioReferenceVideo"',
      'DROP TABLE IF EXISTS "core"."deliveryStudioPreset"',
      'DROP TABLE IF EXISTS "core"."deliveryStudioProviderConfig"',
    ];
    for (const sql of tables) {
      await queryRunner.query(sql);
    }
  }
}
