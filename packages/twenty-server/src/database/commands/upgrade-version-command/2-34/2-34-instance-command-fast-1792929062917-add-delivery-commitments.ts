import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792929062917)
export class AddDeliveryCommitmentsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryCommitmentEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "periodId" uuid NOT NULL, "actorId" uuid, "actorType" text NOT NULL, "actorName" text NOT NULL, "action" text NOT NULL, "taskId" uuid, "taskName" text, "reason" text NOT NULL, "changes" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ce58d96113f2a51edb3d5958e1f" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_ac4ec852388de2e9c48249247e" ON "core"."deliveryCommitmentEvent" ("workspaceId", "periodId", "createdAt", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCommitmentAllocation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "periodId" uuid NOT NULL, "lineId" uuid NOT NULL, "taskId" uuid NOT NULL, "taskName" text NOT NULL, "parentTaskId" uuid, "state" text NOT NULL, "revision" integer NOT NULL, "creditedCycle" integer, "creditedSubmissionVersion" integer, "fulfilledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b1a6622d8f5cc2e8d5b7aef4e4" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_7ef641b9449395ef8961d4be75" ON "core"."deliveryCommitmentAllocation" ("workspaceId", "parentTaskId") ');
    await queryRunner.query('CREATE INDEX "IDX_0ebe08e07da52a6b9f1b517280" ON "core"."deliveryCommitmentAllocation" ("workspaceId", "periodId", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_40674904154952567bcade7603" ON "core"."deliveryCommitmentAllocation" ("workspaceId", "taskId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCommitmentLine" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "periodId" uuid NOT NULL, "label" text NOT NULL, "unit" text NOT NULL, "promisedQuantity" integer NOT NULL, "revision" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e9cc6b9c294957e1eaaca258753" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_5b30b96a966b6227b02c1b0b18" ON "core"."deliveryCommitmentLine" ("workspaceId", "periodId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryCommitmentPeriod" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "engagementId" uuid NOT NULL, "projectId" uuid NOT NULL, "clientId" uuid NOT NULL, "label" text NOT NULL, "billing" text NOT NULL, "startDate" date NOT NULL, "endDateExclusive" date, "timezone" text NOT NULL, "state" text NOT NULL, "revision" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9f3354a2c5e925bca33de050d8c" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_bf2bf9fd7b0f749c00a2ff829a" ON "core"."deliveryCommitmentPeriod" ("workspaceId", "engagementId", "startDate") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentEvent" ADD CONSTRAINT "FK_48a2df33318d4d5803bd8d2d0af" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentAllocation" ADD CONSTRAINT "FK_b99e2dfb5457b26db32f6167df5" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentLine" ADD CONSTRAINT "FK_4d17f33672a81931836b033dae3" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentPeriod" ADD CONSTRAINT "FK_f07574a978f66ca1b503448b247" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentPeriod" DROP CONSTRAINT "FK_f07574a978f66ca1b503448b247"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentLine" DROP CONSTRAINT "FK_4d17f33672a81931836b033dae3"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentAllocation" DROP CONSTRAINT "FK_b99e2dfb5457b26db32f6167df5"');
    await queryRunner.query('ALTER TABLE "core"."deliveryCommitmentEvent" DROP CONSTRAINT "FK_48a2df33318d4d5803bd8d2d0af"');
    await queryRunner.query('DROP INDEX "core"."IDX_bf2bf9fd7b0f749c00a2ff829a"');
    await queryRunner.query('DROP TABLE "core"."deliveryCommitmentPeriod"');
    await queryRunner.query('DROP INDEX "core"."IDX_5b30b96a966b6227b02c1b0b18"');
    await queryRunner.query('DROP TABLE "core"."deliveryCommitmentLine"');
    await queryRunner.query('DROP INDEX "core"."IDX_40674904154952567bcade7603"');
    await queryRunner.query('DROP INDEX "core"."IDX_0ebe08e07da52a6b9f1b517280"');
    await queryRunner.query('DROP INDEX "core"."IDX_7ef641b9449395ef8961d4be75"');
    await queryRunner.query('DROP TABLE "core"."deliveryCommitmentAllocation"');
    await queryRunner.query('DROP INDEX "core"."IDX_ac4ec852388de2e9c48249247e"');
    await queryRunner.query('DROP TABLE "core"."deliveryCommitmentEvent"');
  }
}
