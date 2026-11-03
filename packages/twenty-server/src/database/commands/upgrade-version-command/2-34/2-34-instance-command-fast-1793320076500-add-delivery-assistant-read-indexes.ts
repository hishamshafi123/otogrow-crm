import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793320076500)
export class AddDeliveryAssistantReadIndexesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_f0787e6a65d3c0fc15954c7b41" ON "core"."deliveryAgentRun" ("workspaceId", "initiatorId", "createdAt", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_045b474658efd422cffbe80cb8" ON "core"."deliveryAgentRun" ("workspaceId", "taskId", "createdAt", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_97ecbe33294c2207ef35034b00" ON "core"."deliveryAgentRun" ("workspaceId", "createdAt", "id") ');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "core"."IDX_97ecbe33294c2207ef35034b00"');
    await queryRunner.query('DROP INDEX "core"."IDX_045b474658efd422cffbe80cb8"');
    await queryRunner.query('DROP INDEX "core"."IDX_f0787e6a65d3c0fc15954c7b41"');
  }
}
