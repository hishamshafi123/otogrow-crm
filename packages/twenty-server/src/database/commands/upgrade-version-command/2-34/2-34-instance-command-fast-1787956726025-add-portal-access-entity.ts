import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1787956726025)
export class AddPortalAccessEntityFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."portalAccess" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "companyId" uuid NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_portal_access_id" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_PORTAL_ACCESS_TOKEN_HASH" ON "core"."portalAccess" ("tokenHash") ');
    await queryRunner.query('CREATE INDEX "IDX_PORTAL_ACCESS_WORKSPACE_ID_COMPANY_ID" ON "core"."portalAccess" ("workspaceId", "companyId") ');
    await queryRunner.query('ALTER TABLE "core"."portalAccess" ADD CONSTRAINT "FK_portal_access_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."portalAccess" DROP CONSTRAINT "FK_portal_access_workspace"');
    await queryRunner.query('DROP INDEX "core"."IDX_PORTAL_ACCESS_WORKSPACE_ID_COMPANY_ID"');
    await queryRunner.query('DROP INDEX "core"."IDX_PORTAL_ACCESS_TOKEN_HASH"');
    await queryRunner.query('DROP TABLE "core"."portalAccess"');
  }
}
