import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792824583893)
export class AddDeliveryAgentsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryAgent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "configuration" jsonb NOT NULL, "version" integer NOT NULL DEFAULT \'1\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_87ba3f113f06c4b13aa17a4b630" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE TABLE "core"."deliveryAgentRun" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestId" uuid NOT NULL, "taskId" uuid NOT NULL, "agentId" uuid NOT NULL, "initiatorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "taskRevision" integer NOT NULL, "agentVersion" integer NOT NULL, "configuration" jsonb NOT NULL, "context" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT \'QUEUED\', "result" jsonb, "activity" jsonb NOT NULL DEFAULT \'[]\', "usage" jsonb, "error" character varying, "decision" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_350b64662ed4786388773e354e6" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_1157a21a18de5cb9b294ff1185" ON "core"."deliveryAgentRun" ("status", "createdAt") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_7feee3c7bdbb11e9150cb36ff3" ON "core"."deliveryAgentRun" ("workspaceId", "initiatorId", "requestId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryAgent" ADD CONSTRAINT "FK_a185d1017f1fb95bf180eef39ec" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryAgentRun" ADD CONSTRAINT "FK_839f8347aebf4c69e2fb94ba1b0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryAgentRun" DROP CONSTRAINT "FK_839f8347aebf4c69e2fb94ba1b0"');
    await queryRunner.query('ALTER TABLE "core"."deliveryAgent" DROP CONSTRAINT "FK_a185d1017f1fb95bf180eef39ec"');
    await queryRunner.query('DROP INDEX "core"."IDX_7feee3c7bdbb11e9150cb36ff3"');
    await queryRunner.query('DROP INDEX "core"."IDX_1157a21a18de5cb9b294ff1185"');
    await queryRunner.query('DROP TABLE "core"."deliveryAgentRun"');
    await queryRunner.query('DROP TABLE "core"."deliveryAgent"');
  }
}
