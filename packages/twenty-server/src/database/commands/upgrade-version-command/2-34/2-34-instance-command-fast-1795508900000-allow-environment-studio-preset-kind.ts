import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508900000)
export class AllowEnvironmentStudioPresetKindFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryStudioPreset"
      DROP CONSTRAINT IF EXISTS "CHK_deliveryStudioPreset_kind"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryStudioPreset"
      ADD CONSTRAINT "CHK_deliveryStudioPreset_kind"
      CHECK ("kind" IN ('CHARACTER_SHEET','VIDEO_GENERATION','TEXT_HOOK','CASTING_PERSONA','ENVIRONMENT'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryStudioPreset"
      DROP CONSTRAINT IF EXISTS "CHK_deliveryStudioPreset_kind"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."deliveryStudioPreset"
      ADD CONSTRAINT "CHK_deliveryStudioPreset_kind"
      CHECK ("kind" IN ('CHARACTER_SHEET','VIDEO_GENERATION','TEXT_HOOK','CASTING_PERSONA'))
    `);
  }
}
