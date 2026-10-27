import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792930786458)
export class AddDeliveryWorkflowsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryWorkflowArchive" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "taskId" uuid NOT NULL, "snapshot" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_726914db53ddd5f469d95d777d5" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_1b60444417b07d8cb3c9c674fc" ON "core"."deliveryWorkflowArchive" ("workspaceId", "taskId", "createdAt", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryWorkflowVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "templateId" uuid NOT NULL, "version" integer NOT NULL, "definition" jsonb NOT NULL, "publishedBy" uuid NOT NULL, "publishedByName" text NOT NULL, "reason" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1b9055dcd0058ddaaebc86e47c0" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_1200998e4f63eaa880acf01b19" ON "core"."deliveryWorkflowVersion" ("workspaceId", "templateId", "version") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryWorkflowTemplate" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "archived" boolean NOT NULL DEFAULT false, "stateReason" text NOT NULL DEFAULT \'\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1b31c2e55989c49a37b7f4fc7cc" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_623b5448ecbc9c6bfcc363ca77" ON "core"."deliveryWorkflowTemplate" ("workspaceId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowArchive" ADD CONSTRAINT "FK_00bd7b8a057ab8e4ae2dcf3472e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowVersion" ADD CONSTRAINT "FK_77d3296e7ad98fb35e308f01e7b" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowTemplate" ADD CONSTRAINT "FK_623b5448ecbc9c6bfcc363ca772" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowTemplate" DROP CONSTRAINT "FK_623b5448ecbc9c6bfcc363ca772"');
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowVersion" DROP CONSTRAINT "FK_77d3296e7ad98fb35e308f01e7b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryWorkflowArchive" DROP CONSTRAINT "FK_00bd7b8a057ab8e4ae2dcf3472e"');
    await queryRunner.query('DROP INDEX "core"."IDX_623b5448ecbc9c6bfcc363ca77"');
    await queryRunner.query('DROP TABLE "core"."deliveryWorkflowTemplate"');
    await queryRunner.query('DROP INDEX "core"."IDX_1200998e4f63eaa880acf01b19"');
    await queryRunner.query('DROP TABLE "core"."deliveryWorkflowVersion"');
    await queryRunner.query('DROP INDEX "core"."IDX_1b60444417b07d8cb3c9c674fc"');
    await queryRunner.query('DROP TABLE "core"."deliveryWorkflowArchive"');
  }
}
