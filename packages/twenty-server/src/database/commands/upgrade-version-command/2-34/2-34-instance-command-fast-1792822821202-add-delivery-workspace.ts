import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792822821202)
export class AddDeliveryWorkspaceFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryMember" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceMemberId" uuid NOT NULL, "access" text NOT NULL DEFAULT \'MEMBER\', "roleLabel" text NOT NULL DEFAULT \'\', CONSTRAINT "PK_869ac22012108469d2b5b741cd6" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_6e17247ec308784b04ade30e6d" ON "core"."deliveryMember" ("workspaceId", "workspaceMemberId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryProject" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "companyId" uuid, "memberIds" jsonb NOT NULL DEFAULT \'[]\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b06fdcfe67bdccf4b186773677a" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_399f43fffd055e79a759c4c646" ON "core"."deliveryProject" ("workspaceId") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryTask" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "projectId" uuid NOT NULL, "details" jsonb NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7a60aa75ad322e744c41cd52e7d" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_809c2ae124a5a0d720254cc217" ON "core"."deliveryTask" ("workspaceId", "taskId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryMember" ADD CONSTRAINT "FK_8d786948b07f493caa4d3e24027" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryProject" ADD CONSTRAINT "FK_399f43fffd055e79a759c4c6460" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryTask" ADD CONSTRAINT "FK_d93a827060ad5da4ea398fc91b9" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryTask" DROP CONSTRAINT "FK_d93a827060ad5da4ea398fc91b9"');
    await queryRunner.query('ALTER TABLE "core"."deliveryProject" DROP CONSTRAINT "FK_399f43fffd055e79a759c4c6460"');
    await queryRunner.query('ALTER TABLE "core"."deliveryMember" DROP CONSTRAINT "FK_8d786948b07f493caa4d3e24027"');
    await queryRunner.query('DROP INDEX "core"."IDX_809c2ae124a5a0d720254cc217"');
    await queryRunner.query('DROP TABLE "core"."deliveryTask"');
    await queryRunner.query('DROP INDEX "core"."IDX_399f43fffd055e79a759c4c646"');
    await queryRunner.query('DROP TABLE "core"."deliveryProject"');
    await queryRunner.query('DROP INDEX "core"."IDX_6e17247ec308784b04ade30e6d"');
    await queryRunner.query('DROP TABLE "core"."deliveryMember"');
  }
}
