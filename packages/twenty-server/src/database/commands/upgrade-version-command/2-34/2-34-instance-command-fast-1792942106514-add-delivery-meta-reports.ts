import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792942106514)
export class AddDeliveryMetaReportsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryMetaReport" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "position" BIGSERIAL NOT NULL, "accountId" text NOT NULL, "date" date NOT NULL, "projectId" uuid, "managerId" uuid, "marketerId" uuid, "status" text NOT NULL, "report" jsonb NOT NULL, "checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "archivedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_441b7b50bf57a8204de1389fbb1" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_564eacb47364e868f17147d597" ON "core"."deliveryMetaReport" ("workspaceId", "marketerId", "status", "position") ');
    await queryRunner.query('CREATE INDEX "IDX_78d202b4a5c5d3a1bb1450a066" ON "core"."deliveryMetaReport" ("workspaceId", "managerId", "status", "position") ');
    await queryRunner.query('CREATE INDEX "IDX_bf6a5b7f34ff5449f8585b87d9" ON "core"."deliveryMetaReport" ("workspaceId", "accountId", "date", "position") ');
    await queryRunner.query('CREATE INDEX "IDX_616538380817a3da55de1e72d5" ON "core"."deliveryMetaReport" ("workspaceId", "position") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryMetaReport" ADD CONSTRAINT "FK_6f3a1cd2a2c5ad26cbcdb7e0730" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }]: { exists: boolean }[] = await queryRunner.query('SELECT EXISTS (SELECT 1 FROM "core"."deliveryMetaReport") AS exists');
    // Retained evidence requires an explicit export/restore before removing its storage.
    if (exists) throw new Error('Restore retained Meta reports before removing their table.');
    await queryRunner.query('ALTER TABLE "core"."deliveryMetaReport" DROP CONSTRAINT "FK_6f3a1cd2a2c5ad26cbcdb7e0730"');
    await queryRunner.query('DROP INDEX "core"."IDX_616538380817a3da55de1e72d5"');
    await queryRunner.query('DROP INDEX "core"."IDX_bf6a5b7f34ff5449f8585b87d9"');
    await queryRunner.query('DROP INDEX "core"."IDX_78d202b4a5c5d3a1bb1450a066"');
    await queryRunner.query('DROP INDEX "core"."IDX_564eacb47364e868f17147d597"');
    await queryRunner.query('DROP TABLE "core"."deliveryMetaReport"');
  }
}
