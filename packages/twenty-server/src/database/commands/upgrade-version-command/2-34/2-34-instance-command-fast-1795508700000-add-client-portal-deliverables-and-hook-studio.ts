import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508700000)
export class AddClientPortalDeliverablesAndHookStudioFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryClientPortalAccess" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "slug" text NOT NULL,
        "codeHash" text NOT NULL,
        "encryptedCode" text NOT NULL,
        "codeSetBy" uuid,
        "codeSetAt" timestamptz NOT NULL DEFAULT now(),
        "expiresAt" timestamptz,
        "revokedAt" timestamptz,
        "lastAccessedAt" timestamptz,
        "brandLogoAssetId" text,
        "brandAccentColor" text,
        "welcomeNote" text NOT NULL DEFAULT '',
        "visibleServiceOverrides" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "showDriveLinks" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryClientPortalAccess" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryClientPortalAccess_encryptedCode" CHECK ("encryptedCode" LIKE 'enc:v2:%'),
        CONSTRAINT "FK_deliveryClientPortalAccess_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryClientPortalAccess_slug" ON "core"."deliveryClientPortalAccess" ("slug")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryClientPortalAccess_ws_company" ON "core"."deliveryClientPortalAccess" ("workspaceId", "companyId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryClientPortalAccess_codeHash" ON "core"."deliveryClientPortalAccess" ("codeHash") WHERE "revokedAt" IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryDriveConnection" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "googleEmail" text NOT NULL,
        "encryptedAccessToken" text NOT NULL,
        "encryptedRefreshToken" text NOT NULL,
        "tokenExpiresAt" timestamptz,
        "rootFolderId" text,
        "rootFolderName" text,
        "monthFolderPattern" text NOT NULL DEFAULT '{Month} {YYYY}',
        "folderMode" text NOT NULL DEFAULT 'FLAT',
        "includeOriginalInVariationFolder" boolean NOT NULL DEFAULT false,
        "autoPurgeVpsEnabled" boolean NOT NULL DEFAULT true,
        "autoPurgeVpsAfterHours" integer NOT NULL DEFAULT 24,
        "connectedBy" uuid NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryDriveConnection" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryDriveConnection_access" CHECK ("encryptedAccessToken" LIKE 'enc:v2:%'),
        CONSTRAINT "CHK_deliveryDriveConnection_refresh" CHECK ("encryptedRefreshToken" LIKE 'enc:v2:%'),
        CONSTRAINT "CHK_deliveryDriveConnection_folderMode" CHECK ("folderMode" IN ('FLAT','SERVICE_SPLIT')),
        CONSTRAINT "CHK_deliveryDriveConnection_purgeHours" CHECK ("autoPurgeVpsAfterHours" >= 1 AND "autoPurgeVpsAfterHours" <= 8760),
        CONSTRAINT "FK_deliveryDriveConnection_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryDriveConnection_ws" ON "core"."deliveryDriveConnection" ("workspaceId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryClientDriveMapping" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "rootFolderId" text NOT NULL,
        "rootFolderName" text NOT NULL,
        "rootFolderWebUrl" text,
        "monthFolderPatternOverride" text,
        "monthFolderCache" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryClientDriveMapping" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveryClientDriveMapping_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryClientDriveMapping_ws_company" ON "core"."deliveryClientDriveMapping" ("workspaceId", "companyId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryDeliverable" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "projectId" uuid,
        "engagementId" uuid,
        "serviceKey" text NOT NULL,
        "serviceScope" text NOT NULL DEFAULT 'ALL',
        "monthKey" text NOT NULL,
        "sequenceNumber" integer NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "assetKind" text NOT NULL,
        "originalFileName" text,
        "externalUrl" text,
        "storageKey" text,
        "thumbnailKey" text,
        "mimeType" text,
        "sizeBytes" bigint NOT NULL DEFAULT 0,
        "mediaMeta" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" text NOT NULL DEFAULT 'PENDING_REVIEW',
        "clientVisibility" text NOT NULL DEFAULT 'INTERNAL',
        "clientApprovalStatus" text NOT NULL DEFAULT 'PENDING',
        "hasVariations" boolean NOT NULL DEFAULT false,
        "driveFileId" text,
        "driveFolderId" text,
        "driveWebUrl" text,
        "driveSyncStatus" text NOT NULL DEFAULT 'NOT_SYNCED',
        "driveSyncedAt" timestamptz,
        "driveSyncError" text,
        "storageState" text NOT NULL DEFAULT 'LOCAL',
        "localFilePurgedAt" timestamptz,
        "linkedTaskId" uuid,
        "linkedContentVariantId" uuid,
        "submittedById" uuid NOT NULL,
        "approvedById" uuid,
        "publishedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryDeliverable" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryDeliverable_month" CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("monthKey", 4) <> '0000'),
        CONSTRAINT "CHK_deliveryDeliverable_seq" CHECK ("sequenceNumber" >= 1),
        CONSTRAINT "CHK_deliveryDeliverable_kind" CHECK ("assetKind" IN ('VIDEO','IMAGE','DOCUMENT','LINK')),
        CONSTRAINT "CHK_deliveryDeliverable_size" CHECK ("sizeBytes" >= 0),
        CONSTRAINT "CHK_deliveryDeliverable_status" CHECK ("status" IN ('DRAFT','PENDING_REVIEW','APPROVED','CHANGES_REQUESTED','ARCHIVED')),
        CONSTRAINT "CHK_deliveryDeliverable_visibility" CHECK ("clientVisibility" IN ('INTERNAL','PUBLISHED')),
        CONSTRAINT "CHK_deliveryDeliverable_clientApproval" CHECK ("clientApprovalStatus" IN ('PENDING','APPROVED','CHANGES_REQUESTED')),
        CONSTRAINT "CHK_deliveryDeliverable_driveSync" CHECK ("driveSyncStatus" IN ('NOT_SYNCED','QUEUED','SYNCING','SYNCED','FAILED')),
        CONSTRAINT "CHK_deliveryDeliverable_storageState" CHECK ("storageState" IN ('LOCAL','DRIVE_ONLY','EXTERNAL')),
        CONSTRAINT "FK_deliveryDeliverable_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryDeliverable_ws_id" ON "core"."deliveryDeliverable" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryDeliverable_active_seq" ON "core"."deliveryDeliverable" ("workspaceId", "companyId", "monthKey", "serviceScope", "sequenceNumber") WHERE "status" <> \'ARCHIVED\'',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryDeliverable_ws_company_month" ON "core"."deliveryDeliverable" ("workspaceId", "companyId", "monthKey", "sequenceNumber")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryDeliverable_vps_purge" ON "core"."deliveryDeliverable" ("workspaceId", "storageState", "driveSyncStatus", "driveSyncedAt") WHERE "storageState" = \'LOCAL\' AND "driveSyncStatus" = \'SYNCED\'',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryVideoHookProject" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "deliverableId" uuid NOT NULL,
        "websiteUrl" text,
        "websiteProfileSnapshot" jsonb,
        "knowledgeFingerprint" text,
        "videoAnalysis" jsonb,
        "creativeInput" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "aiSuggestions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "defaultStyleConfig" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" text NOT NULL DEFAULT 'DRAFT',
        "lastError" text,
        "createdById" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryVideoHookProject" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryVideoHookProject_status" CHECK ("status" IN ('DRAFT','ANALYZING','READY','RENDERING','COMPLETED','FAILED')),
        CONSTRAINT "FK_deliveryVideoHookProject_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryVideoHookProject_deliverable" FOREIGN KEY ("workspaceId", "deliverableId") REFERENCES "core"."deliveryDeliverable"("workspaceId", "id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryVideoHookProject_ws_id" ON "core"."deliveryVideoHookProject" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryVideoHookProject_ws_deliverable" ON "core"."deliveryVideoHookProject" ("workspaceId", "deliverableId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryVideoHookVariation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "hookProjectId" uuid NOT NULL,
        "deliverableId" uuid NOT NULL,
        "variationNumber" integer NOT NULL,
        "hookText" text NOT NULL,
        "angleTag" text NOT NULL DEFAULT '',
        "rationale" text NOT NULL DEFAULT '',
        "styleOverride" jsonb,
        "overlayPngStorageKey" text,
        "startSec" double precision NOT NULL DEFAULT 0,
        "endSec" double precision NOT NULL DEFAULT 3.5,
        "renderStatus" text NOT NULL DEFAULT 'PENDING',
        "renderProgress" integer NOT NULL DEFAULT 0,
        "renderError" text,
        "outputStorageKey" text,
        "thumbnailKey" text,
        "outputSizeBytes" bigint NOT NULL DEFAULT 0,
        "outputMediaMeta" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "driveFileId" text,
        "driveWebUrl" text,
        "driveSyncStatus" text NOT NULL DEFAULT 'NOT_SYNCED',
        "driveSyncedAt" timestamptz,
        "driveSyncError" text,
        "storageState" text NOT NULL DEFAULT 'LOCAL',
        "localFilePurgedAt" timestamptz,
        "clientVisibility" text NOT NULL DEFAULT 'INTERNAL',
        "clientApprovalStatus" text NOT NULL DEFAULT 'PENDING',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryVideoHookVariation" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryVideoHookVariation_num" CHECK ("variationNumber" >= 1),
        CONSTRAINT "CHK_deliveryVideoHookVariation_timing" CHECK ("startSec" >= 0 AND "endSec" > "startSec"),
        CONSTRAINT "CHK_deliveryVideoHookVariation_renderStatus" CHECK ("renderStatus" IN ('PENDING','QUEUED','RENDERING','READY','FAILED')),
        CONSTRAINT "CHK_deliveryVideoHookVariation_progress" CHECK ("renderProgress" >= 0 AND "renderProgress" <= 100),
        CONSTRAINT "CHK_deliveryVideoHookVariation_size" CHECK ("outputSizeBytes" >= 0),
        CONSTRAINT "CHK_deliveryVideoHookVariation_driveSync" CHECK ("driveSyncStatus" IN ('NOT_SYNCED','QUEUED','SYNCING','SYNCED','FAILED')),
        CONSTRAINT "CHK_deliveryVideoHookVariation_storageState" CHECK ("storageState" IN ('LOCAL','DRIVE_ONLY')),
        CONSTRAINT "CHK_deliveryVideoHookVariation_visibility" CHECK ("clientVisibility" IN ('INTERNAL','PUBLISHED')),
        CONSTRAINT "CHK_deliveryVideoHookVariation_approval" CHECK ("clientApprovalStatus" IN ('PENDING','APPROVED','CHANGES_REQUESTED')),
        CONSTRAINT "FK_deliveryVideoHookVariation_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryVideoHookVariation_project" FOREIGN KEY ("workspaceId", "hookProjectId") REFERENCES "core"."deliveryVideoHookProject"("workspaceId", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryVideoHookVariation_deliverable" FOREIGN KEY ("workspaceId", "deliverableId") REFERENCES "core"."deliveryDeliverable"("workspaceId", "id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryVideoHookVariation_ws_id" ON "core"."deliveryVideoHookVariation" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryVideoHookVariation_project_num" ON "core"."deliveryVideoHookVariation" ("workspaceId", "hookProjectId", "variationNumber")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryVideoHookVariation_ws_deliverable" ON "core"."deliveryVideoHookVariation" ("workspaceId", "deliverableId", "variationNumber")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryVideoHookVariation_vps_purge" ON "core"."deliveryVideoHookVariation" ("workspaceId", "storageState", "driveSyncStatus", "driveSyncedAt") WHERE "storageState" = \'LOCAL\' AND "driveSyncStatus" = \'SYNCED\'',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryDeliverableReview" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "deliverableId" uuid NOT NULL,
        "variationId" uuid,
        "authorType" text NOT NULL,
        "authorId" uuid,
        "authorName" text NOT NULL,
        "decision" text NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "timestampSec" double precision,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryDeliverableReview" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryDeliverableReview_authorType" CHECK ("authorType" IN ('CLIENT','STAFF')),
        CONSTRAINT "CHK_deliveryDeliverableReview_decision" CHECK ("decision" IN ('COMMENT','APPROVED','CHANGES_REQUESTED')),
        CONSTRAINT "CHK_deliveryDeliverableReview_ts" CHECK ("timestampSec" IS NULL OR "timestampSec" >= 0),
        CONSTRAINT "FK_deliveryDeliverableReview_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryDeliverableReview_deliverable" FOREIGN KEY ("workspaceId", "deliverableId") REFERENCES "core"."deliveryDeliverable"("workspaceId", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryDeliverableReview_variation" FOREIGN KEY ("workspaceId", "variationId") REFERENCES "core"."deliveryVideoHookVariation"("workspaceId", "id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryDeliverableReview_ws_deliv" ON "core"."deliveryDeliverableReview" ("workspaceId", "deliverableId", "createdAt")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryContentMetricSnapshot" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "projectId" uuid,
        "contentVariantId" uuid,
        "monthKey" text NOT NULL,
        "platform" text NOT NULL,
        "postTitle" text,
        "postUrl" text,
        "views" integer NOT NULL DEFAULT 0,
        "impressions" integer NOT NULL DEFAULT 0,
        "reach" integer NOT NULL DEFAULT 0,
        "likes" integer NOT NULL DEFAULT 0,
        "comments" integer NOT NULL DEFAULT 0,
        "shares" integer NOT NULL DEFAULT 0,
        "saves" integer NOT NULL DEFAULT 0,
        "clicks" integer NOT NULL DEFAULT 0,
        "followerDelta" integer NOT NULL DEFAULT 0,
        "source" text NOT NULL DEFAULT 'MANUAL',
        "recordedById" uuid,
        "observedAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryContentMetricSnapshot" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryContentMetricSnapshot_month" CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("monthKey", 4) <> '0000'),
        CONSTRAINT "CHK_deliveryContentMetricSnapshot_platform" CHECK ("platform" IN ('INSTAGRAM','TIKTOK','FACEBOOK','X','YOUTUBE','LINKEDIN','ALL')),
        CONSTRAINT "CHK_deliveryContentMetricSnapshot_source" CHECK ("source" IN ('MANUAL','CSV','API')),
        CONSTRAINT "CHK_deliveryContentMetricSnapshot_nonneg" CHECK ("views" >= 0 AND "impressions" >= 0 AND "reach" >= 0 AND "likes" >= 0 AND "comments" >= 0 AND "shares" >= 0 AND "saves" >= 0 AND "clicks" >= 0),
        CONSTRAINT "FK_deliveryContentMetricSnapshot_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryContentMetricSnapshot_ws_company_month" ON "core"."deliveryContentMetricSnapshot" ("workspaceId", "companyId", "monthKey", "platform")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryContentMetricSnapshot"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryDeliverableReview"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryVideoHookVariation"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryVideoHookProject"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryDeliverable"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryClientDriveMapping"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryDriveConnection"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryClientPortalAccess"',
    );
  }
}
