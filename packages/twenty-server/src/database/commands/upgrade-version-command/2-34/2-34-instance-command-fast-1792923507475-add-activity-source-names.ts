import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792923507475)
export class AddActivitySourceNamesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" ADD "taskName" text');
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" ADD "agentName" text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" DROP COLUMN "agentName"');
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" DROP COLUMN "taskName"');
  }
}
