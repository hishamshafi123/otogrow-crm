import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792937196864)
export class AddDeliveryBatchesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryBatch" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "periodId" uuid, "label" text NOT NULL, "startDate" date, "endDate" date, "timezone" text NOT NULL, "closed" boolean NOT NULL DEFAULT false, "revision" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_65c7d18ae5202ae7a82a3b4c903" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_1f873a0c8b5b9da91892f96892" ON "core"."deliveryBatch" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryBatchItem" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "taskId" uuid NOT NULL, "taskName" text NOT NULL, "concept" text NOT NULL DEFAULT \'\', "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9723fbb27fddca9e13228bc65f1" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_86e5c927054651315820ef08d5" ON "core"."deliveryBatchItem" ("workspaceId", "batchId", "active", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_dd43aa9dd76123344e6c453927" ON "core"."deliveryBatchItem" ("workspaceId", "batchId", "taskId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryBatchEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "actorId" uuid NOT NULL, "actorName" text NOT NULL, "action" text NOT NULL, "taskId" uuid, "taskName" text, "reason" text NOT NULL, "changes" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_879045e4c6fccdfff58bb8ee9af" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_affc6eba28a3d30c12d8f91cf0" ON "core"."deliveryBatchEvent" ("workspaceId", "batchId", "createdAt", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryBatch" ADD CONSTRAINT "FK_e6b571cf4afbab9c9352b963d35" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryBatchItem" ADD CONSTRAINT "FK_29c405657eb40bf2c61cc85f282" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryBatchEvent" ADD CONSTRAINT "FK_d0334a8f178674f68fc2949b9c9" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryBatchEvent" DROP CONSTRAINT "FK_d0334a8f178674f68fc2949b9c9"');
    await queryRunner.query('ALTER TABLE "core"."deliveryBatchItem" DROP CONSTRAINT "FK_29c405657eb40bf2c61cc85f282"');
    await queryRunner.query('ALTER TABLE "core"."deliveryBatch" DROP CONSTRAINT "FK_e6b571cf4afbab9c9352b963d35"');
    await queryRunner.query('DROP INDEX "core"."IDX_affc6eba28a3d30c12d8f91cf0"');
    await queryRunner.query('DROP TABLE "core"."deliveryBatchEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_dd43aa9dd76123344e6c453927"');
    await queryRunner.query('DROP INDEX "core"."IDX_86e5c927054651315820ef08d5"');
    await queryRunner.query('DROP TABLE "core"."deliveryBatchItem"');
    await queryRunner.query('DROP INDEX "core"."IDX_1f873a0c8b5b9da91892f96892"');
    await queryRunner.query('DROP TABLE "core"."deliveryBatch"');
  }
}
