import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792916611500)
export class AddOtogrowRoleAccessFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."otogrowAccessEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorMemberId" uuid NOT NULL, "subjectMemberId" uuid, "roleId" uuid, "action" text NOT NULL, "before" jsonb, "after" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0e810a9f22a85b30201c032c66b" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_e439e553fe6d91e2f70b326c33" ON "core"."otogrowAccessEvent" ("workspaceId", "subjectMemberId", "createdAt") ');
    await queryRunner.query('CREATE INDEX "IDX_236ebb5496b337531d3aad4e1b" ON "core"."otogrowAccessEvent" ("workspaceId", "createdAt") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowMemberAccess" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceMemberId" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'0\', CONSTRAINT "PK_b11e053ce42baa1fea3106c5b1e" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_e0da79d2ed32690e70a6a0a6d6" ON "core"."otogrowMemberAccess" ("workspaceId", "workspaceMemberId") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowRole" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "description" text NOT NULL DEFAULT \'\', "capabilities" text array NOT NULL DEFAULT \'{}\', "revision" integer NOT NULL DEFAULT \'0\', CONSTRAINT "PK_676eb3883e14fc5e4a943eecf58" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_6561f470d038682defc336799c" ON "core"."otogrowRole" ("workspaceId", "name") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowRoleAssignment" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceMemberId" uuid NOT NULL, "roleId" uuid NOT NULL, CONSTRAINT "PK_3e32ca556e509a2ce8b1e34765b" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_81fe00f60e4ab7195d234dc71e" ON "core"."otogrowRoleAssignment" ("workspaceId", "workspaceMemberId", "roleId") ');
    await queryRunner.query('ALTER TABLE "core"."otogrowAccessEvent" ADD CONSTRAINT "FK_611e9129a5fc45f8d0911868fbb" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowMemberAccess" ADD CONSTRAINT "FK_3e538cbd07d04f24ee6411d48a7" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowRole" ADD CONSTRAINT "FK_11ba609f3a4936e80b6c20035b0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowRoleAssignment" ADD CONSTRAINT "FK_76f95ce46bb6ddca2f06c659bf7" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowRoleAssignment" ADD CONSTRAINT "FK_b2bcb3f6367257838b1d99fc22a" FOREIGN KEY ("roleId") REFERENCES "core"."otogrowRole"("id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."otogrowRoleAssignment" DROP CONSTRAINT "FK_b2bcb3f6367257838b1d99fc22a"');
    await queryRunner.query('ALTER TABLE "core"."otogrowRoleAssignment" DROP CONSTRAINT "FK_76f95ce46bb6ddca2f06c659bf7"');
    await queryRunner.query('ALTER TABLE "core"."otogrowRole" DROP CONSTRAINT "FK_11ba609f3a4936e80b6c20035b0"');
    await queryRunner.query('ALTER TABLE "core"."otogrowMemberAccess" DROP CONSTRAINT "FK_3e538cbd07d04f24ee6411d48a7"');
    await queryRunner.query('ALTER TABLE "core"."otogrowAccessEvent" DROP CONSTRAINT "FK_611e9129a5fc45f8d0911868fbb"');
    await queryRunner.query('DROP INDEX "core"."IDX_81fe00f60e4ab7195d234dc71e"');
    await queryRunner.query('DROP TABLE "core"."otogrowRoleAssignment"');
    await queryRunner.query('DROP INDEX "core"."IDX_6561f470d038682defc336799c"');
    await queryRunner.query('DROP TABLE "core"."otogrowRole"');
    await queryRunner.query('DROP INDEX "core"."IDX_e0da79d2ed32690e70a6a0a6d6"');
    await queryRunner.query('DROP TABLE "core"."otogrowMemberAccess"');
    await queryRunner.query('DROP INDEX "core"."IDX_236ebb5496b337531d3aad4e1b"');
    await queryRunner.query('DROP INDEX "core"."IDX_e439e553fe6d91e2f70b326c33"');
    await queryRunner.query('DROP TABLE "core"."otogrowAccessEvent"');
  }
}
