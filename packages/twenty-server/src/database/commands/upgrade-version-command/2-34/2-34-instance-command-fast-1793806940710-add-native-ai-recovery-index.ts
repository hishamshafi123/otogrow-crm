import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793806940710)
export class AddNativeAiRecoveryIndexFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_otogrow_native_ai_recovery" ON "core"."otogrowAiSpend" ("state", "createdAt", "id") WHERE "sourceKind" = \'NATIVE_CRM\' AND state IN (\'RESERVED\',\'DISPATCHED\')');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "core"."IDX_otogrow_native_ai_recovery"');
  }
}
