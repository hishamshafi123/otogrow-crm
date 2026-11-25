import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508600000)
export class UpgradeDeliveryTeamChatFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "projectId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "projectName" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "replyToMessageId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT \'[]\'::jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "reactions" jsonb NOT NULL DEFAULT \'[]\'::jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" ADD COLUMN IF NOT EXISTS "pinnedById" uuid',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_deliveryChatMessage_project'
        ) THEN
          ALTER TABLE "core"."deliveryChatMessage"
            ADD CONSTRAINT "FK_deliveryChatMessage_project"
            FOREIGN KEY ("projectId") REFERENCES "core"."deliveryProject"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_deliveryChatMessage_replyTo'
        ) THEN
          ALTER TABLE "core"."deliveryChatMessage"
            ADD CONSTRAINT "FK_deliveryChatMessage_replyTo"
            FOREIGN KEY ("replyToMessageId") REFERENCES "core"."deliveryChatMessage"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryChatMessage_project_history" ON "core"."deliveryChatMessage" ("workspaceId", "projectId", "position")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryChatMessage_pinned" ON "core"."deliveryChatMessage" ("workspaceId", "pinnedAt") WHERE "pinnedAt" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."deliveryChatAttachment" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "uploaderId" uuid NOT NULL,
        "recipientId" uuid NOT NULL,
        "messageId" uuid,
        "kind" text NOT NULL,
        "name" text NOT NULL,
        "mimeType" text NOT NULL,
        "size" integer NOT NULL,
        "storagePath" text NOT NULL,
        "durationMs" integer,
        "waveform" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryChatAttachment" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryChatAttachment_kind" CHECK ("kind" IN ('IMAGE', 'VOICE', 'FILE')),
        CONSTRAINT "CHK_deliveryChatAttachment_size" CHECK ("size" > 0),
        CONSTRAINT "FK_deliveryChatAttachment_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_deliveryChatAttachment_message" FOREIGN KEY ("messageId") REFERENCES "core"."deliveryChatMessage"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryChatAttachment_workspace_message" ON "core"."deliveryChatAttachment" ("workspaceId", "messageId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryChatAttachment_workspace_uploader" ON "core"."deliveryChatAttachment" ("workspaceId", "uploaderId", "createdAt")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }]: { exists: boolean }[] = await queryRunner.query(
      'SELECT (to_regclass(\'core."deliveryChatAttachment"\') IS NOT NULL AND EXISTS (SELECT 1 FROM "core"."deliveryChatAttachment")) AS exists',
    );
    if (exists) {
      throw new Error(
        'Restore team chat attachments before reverting the team chat upgrade.',
      );
    }
    await queryRunner.query(
      'DROP TABLE IF EXISTS "core"."deliveryChatAttachment"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_deliveryChatMessage_pinned"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_deliveryChatMessage_project_history"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP CONSTRAINT IF EXISTS "FK_deliveryChatMessage_replyTo"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP CONSTRAINT IF EXISTS "FK_deliveryChatMessage_project"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "pinnedById"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "pinnedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "deletedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "editedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "reactions"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "attachments"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "replyToMessageId"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "projectName"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryChatMessage" DROP COLUMN IF EXISTS "projectId"',
    );
  }
}
