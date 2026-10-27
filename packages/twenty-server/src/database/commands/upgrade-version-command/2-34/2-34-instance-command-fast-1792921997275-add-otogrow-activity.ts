import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792921997275)
export class AddOtogrowActivityFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."otogrowActivityEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL, "recordedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actorId" uuid, "actorName" text NOT NULL, "actorType" text NOT NULL, "subjectMemberId" uuid, "subjectName" text, "category" text NOT NULL, "action" text NOT NULL, "outcome" text NOT NULL, "summary" text NOT NULL, "projectId" uuid, "projectName" text, "clientId" uuid, "clientName" text, "taskId" uuid, "sourceType" text NOT NULL, "sourceId" uuid NOT NULL, "changes" jsonb NOT NULL DEFAULT \'[]\', CONSTRAINT "PK_ebdf74d13a8c3c03d2b0e893f73" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_66a4843018e0159c0c78b5460f" ON "core"."otogrowActivityEvent" ("workspaceId", "projectId", "occurredAt") ');
    await queryRunner.query('CREATE INDEX "IDX_340800f2226ed519c4c69d1268" ON "core"."otogrowActivityEvent" ("workspaceId", "clientId", "occurredAt") ');
    await queryRunner.query('CREATE INDEX "IDX_b13fb933d34da7927cd9ddaf9c" ON "core"."otogrowActivityEvent" ("workspaceId", "subjectMemberId", "occurredAt") ');
    await queryRunner.query('CREATE INDEX "IDX_97a19891bb7c4989daa8075239" ON "core"."otogrowActivityEvent" ("workspaceId", "actorId", "occurredAt") ');
    await queryRunner.query('CREATE INDEX "IDX_e0f634f5100781cf2ac85d67c2" ON "core"."otogrowActivityEvent" ("workspaceId", "occurredAt", "id") ');
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" ADD CONSTRAINT "FK_0f27286287eab5e72b356788f87" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."otogrowActivityEvent" DROP CONSTRAINT "FK_0f27286287eab5e72b356788f87"');
    await queryRunner.query('DROP INDEX "core"."IDX_e0f634f5100781cf2ac85d67c2"');
    await queryRunner.query('DROP INDEX "core"."IDX_97a19891bb7c4989daa8075239"');
    await queryRunner.query('DROP INDEX "core"."IDX_b13fb933d34da7927cd9ddaf9c"');
    await queryRunner.query('DROP INDEX "core"."IDX_340800f2226ed519c4c69d1268"');
    await queryRunner.query('DROP INDEX "core"."IDX_66a4843018e0159c0c78b5460f"');
    await queryRunner.query('DROP TABLE "core"."otogrowActivityEvent"');
  }
}
