import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1790000001000)
export class AddMetaAdsConfigEntityFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."metaAdsConfig" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appId" text NOT NULL, "appSecret" text NOT NULL, "pageId" text NOT NULL, "pageAccessToken" text NOT NULL, "verifyToken" text NOT NULL, "formId" text, "processedLeadgenIds" jsonb NOT NULL DEFAULT \'[]\', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_metaAdsConfig_appSecret_encrypted" CHECK ("appSecret" LIKE \'enc:v2:%\'), CONSTRAINT "CHK_metaAdsConfig_pageAccessToken_encrypted" CHECK ("pageAccessToken" LIKE \'enc:v2:%\'), CONSTRAINT "PK_d6ae18d20ba71f0ebabff25b257" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_META_ADS_CONFIG_WORKSPACE_ID" ON "core"."metaAdsConfig" ("workspaceId") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metaAdsConfig" ADD CONSTRAINT "FK_97f531dd550631f5fd223926a93" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."metaAdsConfig" DROP CONSTRAINT "FK_97f531dd550631f5fd223926a93"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_META_ADS_CONFIG_WORKSPACE_ID"',
    );
    await queryRunner.query('DROP TABLE "core"."metaAdsConfig"');
  }
}
