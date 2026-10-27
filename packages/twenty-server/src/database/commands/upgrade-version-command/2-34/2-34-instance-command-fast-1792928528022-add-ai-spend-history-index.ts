import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792928528022)
export class AddAiSpendHistoryIndexFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_1a527d53799c9d81d8295ab1c4" ON "core"."otogrowAiSpendEvent" ("workspaceId", "spendId", "createdAt", "id") ');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "core"."IDX_1a527d53799c9d81d8295ab1c4"');
  }
}
