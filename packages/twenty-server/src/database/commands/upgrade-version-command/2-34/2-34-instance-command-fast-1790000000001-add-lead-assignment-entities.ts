import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1790000000001)
export class AddLeadAssignmentEntitiesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."setterProfile" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceMemberId" uuid NOT NULL, "isSetter" boolean NOT NULL DEFAULT false, "activeDays" text NOT NULL DEFAULT \'1,2,3,4,5\', "activeStartHour" integer NOT NULL DEFAULT 9, "activeEndHour" integer NOT NULL DEFAULT 18, "dailyLeadCap" integer, "telegramChatId" text, "lastAssignedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_setterProfile_id" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_SETTER_PROFILE_WORKSPACE_MEMBER" ON "core"."setterProfile" ("workspaceId", "workspaceMemberId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."setterProfile" ADD CONSTRAINT "FK_setterProfile_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."telegramConfig" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "botToken" text NOT NULL, "botUsername" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_telegramConfig_botToken_encrypted" CHECK ("botToken" LIKE \'enc:v2:%\'), CONSTRAINT "PK_telegramConfig_id" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_TELEGRAM_CONFIG_WORKSPACE_ID" ON "core"."telegramConfig" ("workspaceId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."telegramConfig" ADD CONSTRAINT "FK_telegramConfig_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."setterAssignment" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "setterProfileId" uuid NOT NULL, "workspaceMemberId" uuid NOT NULL, "personId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_setterAssignment_id" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_SETTER_ASSIGNMENT_PERSON" ON "core"."setterAssignment" ("workspaceId", "personId") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_SETTER_ASSIGNMENT_PROFILE_CREATED" ON "core"."setterAssignment" ("setterProfileId", "createdAt") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."setterAssignment" ADD CONSTRAINT "FK_setterAssignment_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."setterAssignment" DROP CONSTRAINT "FK_setterAssignment_workspace"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_SETTER_ASSIGNMENT_PROFILE_CREATED"',
    );
    await queryRunner.query('DROP INDEX "core"."IDX_SETTER_ASSIGNMENT_PERSON"');
    await queryRunner.query('DROP TABLE "core"."setterAssignment"');
    await queryRunner.query(
      'ALTER TABLE "core"."telegramConfig" DROP CONSTRAINT "FK_telegramConfig_workspace"',
    );
    await queryRunner.query('DROP INDEX "core"."IDX_TELEGRAM_CONFIG_WORKSPACE_ID"');
    await queryRunner.query('DROP TABLE "core"."telegramConfig"');
    await queryRunner.query(
      'ALTER TABLE "core"."setterProfile" DROP CONSTRAINT "FK_setterProfile_workspace"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_SETTER_PROFILE_WORKSPACE_MEMBER"',
    );
    await queryRunner.query('DROP TABLE "core"."setterProfile"');
  }
}
