import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793065339880)
export class AddDeliveryRevisionsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryRevision" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "projectId" uuid NOT NULL, "round" integer NOT NULL, "taskRevision" integer NOT NULL, "submissionVersion" integer, "source" text NOT NULL, "reason" text NOT NULL, "cause" text NOT NULL DEFAULT \'UNCLASSIFIED\', "effortMinutes" integer, "internalCost" bigint, "proposedCharge" bigint NOT NULL DEFAULT \'0\', "currency" text, "revision" integer NOT NULL DEFAULT \'1\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e1aade12f9a3607682226554559" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_31c12d33f7c27fa898ffbc5eb2" ON "core"."deliveryRevision" ("workspaceId", "createdAt") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_cc437f738d6f997c271e71e6c1" ON "core"."deliveryRevision" ("workspaceId", "taskId", "taskRevision") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_6a549c6653593bd9cea72cbaa3" ON "core"."deliveryRevision" ("workspaceId", "taskId", "round") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryRevision" ADD CONSTRAINT "FK_9f604958ffe3900f20453cf281a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryRevision" DROP CONSTRAINT "FK_9f604958ffe3900f20453cf281a"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_6a549c6653593bd9cea72cbaa3"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_cc437f738d6f997c271e71e6c1"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_31c12d33f7c27fa898ffbc5eb2"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryRevision"');
  }
}
