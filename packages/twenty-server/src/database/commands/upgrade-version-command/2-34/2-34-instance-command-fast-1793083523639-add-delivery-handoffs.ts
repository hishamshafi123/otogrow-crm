import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793083523639)
export class AddDeliveryHandoffsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryHandoff" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "opportunityId" uuid NOT NULL, "projectId" uuid NOT NULL, "engagementId" uuid NOT NULL, "managerId" uuid NOT NULL, "reviewerId" uuid NOT NULL, "createdBy" uuid NOT NULL, "source" jsonb NOT NULL, "setupTaskIds" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c55df67c821d7648e4df288c2ef" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_bf17e1d9f8fc8d8dffcfedb4d8" ON "core"."deliveryHandoff" ("workspaceId", "opportunityId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryHandoff" ADD CONSTRAINT "FK_1c28755243aede8497e575a4fd9" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryHandoff" DROP CONSTRAINT "FK_1c28755243aede8497e575a4fd9"');
    await queryRunner.query('DROP INDEX "core"."IDX_bf17e1d9f8fc8d8dffcfedb4d8"');
    await queryRunner.query('DROP TABLE "core"."deliveryHandoff"');
  }
}
