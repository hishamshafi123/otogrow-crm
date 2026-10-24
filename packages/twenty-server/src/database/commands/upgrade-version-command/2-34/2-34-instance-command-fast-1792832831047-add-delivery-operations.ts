import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792832831047)
export class AddDeliveryOperationsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryOperations" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "state" jsonb NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3393669b9eb40d5c82fa81dcbed" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_d0336c41e2a8ed1322db6e0fda" ON "core"."deliveryOperations" ("workspaceId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryOperations" ADD CONSTRAINT "FK_d0336c41e2a8ed1322db6e0fda8" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryOperations" DROP CONSTRAINT "FK_d0336c41e2a8ed1322db6e0fda8"');
    await queryRunner.query('DROP INDEX "core"."IDX_d0336c41e2a8ed1322db6e0fda"');
    await queryRunner.query('DROP TABLE "core"."deliveryOperations"');
  }
}
