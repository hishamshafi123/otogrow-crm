import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792999216929)
export class AddDeliveryKnowledgeFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryKnowledgeSource" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "projectId" uuid NOT NULL, "createdBy" uuid NOT NULL, "revision" integer NOT NULL, "currentVersion" integer NOT NULL, "publishedVersion" integer, "publishedBy" uuid, "publishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b894ec1c0885052ed5682c5ec7b" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_edb0517d454bc9c2138e44757c" ON "core"."deliveryKnowledgeSource" ("workspaceId", "projectId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryKnowledgeVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "version" integer NOT NULL, "title" text NOT NULL, "meetingDate" date NOT NULL, "sourceUrl" text NOT NULL, "transcript" text NOT NULL, "knowledge" text NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5ba385d5b9cefb81aef11f33d8a" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_428dcf9e8f30d3a274b41831e8" ON "core"."deliveryKnowledgeVersion" ("workspaceId", "sourceId", "version") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" ADD CONSTRAINT "FK_36684eca4586b55923ffacc1ddf" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeVersion" ADD CONSTRAINT "FK_5b9b28ad90dc103ac08bd45bb45" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeVersion" DROP CONSTRAINT "FK_5b9b28ad90dc103ac08bd45bb45"');
    await queryRunner.query('ALTER TABLE "core"."deliveryKnowledgeSource" DROP CONSTRAINT "FK_36684eca4586b55923ffacc1ddf"');
    await queryRunner.query('DROP INDEX "core"."IDX_428dcf9e8f30d3a274b41831e8"');
    await queryRunner.query('DROP TABLE "core"."deliveryKnowledgeVersion"');
    await queryRunner.query('DROP INDEX "core"."IDX_edb0517d454bc9c2138e44757c"');
    await queryRunner.query('DROP TABLE "core"."deliveryKnowledgeSource"');
  }
}
