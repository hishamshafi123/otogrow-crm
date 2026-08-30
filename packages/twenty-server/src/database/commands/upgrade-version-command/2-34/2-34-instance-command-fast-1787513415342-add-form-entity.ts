import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1787513415342)
export class AddFormEntityFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."form" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "publicId" uuid NOT NULL DEFAULT uuid_generate_v4(), "fields" jsonb NOT NULL, "successMessage" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_783ba7184eb5b3a22d4e2dcdf85" UNIQUE ("publicId"), CONSTRAINT "PK_8f72b95aa2f8ba82cf95dc7579e" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_FORM_WORKSPACE_ID" ON "core"."form" ("workspaceId") ');
    await queryRunner.query('ALTER TABLE "core"."form" ADD CONSTRAINT "FK_170efff4382c3025eb94c56c909" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."form" DROP CONSTRAINT "FK_170efff4382c3025eb94c56c909"');
    await queryRunner.query('DROP INDEX "core"."IDX_FORM_WORKSPACE_ID"');
    await queryRunner.query('DROP TABLE "core"."form"');
  }
}
