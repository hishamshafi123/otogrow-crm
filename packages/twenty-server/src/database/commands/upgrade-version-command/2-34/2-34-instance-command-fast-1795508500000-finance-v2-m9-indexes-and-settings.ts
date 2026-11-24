import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508500000)
export class AddDeliveryFinanceV2M9IndexesAndSettingsFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2Profile"
      ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'Asia/Dubai'
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2Profile"
      ADD COLUMN IF NOT EXISTS "lockedThroughDate" date
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2PayrollProfile"
      ADD COLUMN IF NOT EXISTS "payTiming" text
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_deliveryFinanceV2PayrollProfile_payTiming'
        ) THEN
          ALTER TABLE "core"."deliveryFinanceV2PayrollProfile"
          ADD CONSTRAINT "CHK_deliveryFinanceV2PayrollProfile_payTiming"
          CHECK ("payTiming" IS NULL OR "payTiming" IN ('SAME_MONTH', 'FOLLOWING_MONTH'));
        END IF;
      END $$;
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryFinanceV2Journal_ws_source_all" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "sourceRefType", "sourceRefId") WHERE "sourceRefType" IS NOT NULL AND "sourceRefId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryFinanceV2Journal_ws_status_date" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "status", "entryDate")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_deliveryFinanceV2PayrollProfile_ws_recurring" ON "core"."deliveryFinanceV2PayrollProfile" ("workspaceId", "recurringExpenseId") WHERE "recurringExpenseId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveryFinanceV2Journal_ws_reversal" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "reversalOfJournalId") WHERE "reversalOfJournalId" IS NOT NULL AND status = \'POSTED\'',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."UQ_deliveryFinanceV2Journal_ws_reversal"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_deliveryFinanceV2PayrollProfile_ws_recurring"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_deliveryFinanceV2Journal_ws_status_date"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_deliveryFinanceV2Journal_ws_source_all"',
    );
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2PayrollProfile"
      DROP CONSTRAINT IF EXISTS "CHK_deliveryFinanceV2PayrollProfile_payTiming"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2PayrollProfile"
      DROP COLUMN IF EXISTS "payTiming"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2Profile"
      DROP COLUMN IF EXISTS "lockedThroughDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryFinanceV2Profile"
      DROP COLUMN IF EXISTS "timezone"
    `);
  }
}
