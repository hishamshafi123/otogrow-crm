import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793133548966)
export class AddDeliveryAiFinanceFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" DROP CONSTRAINT "CHK_60b25b3109b9eb0814862b4df7"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" DROP CONSTRAINT "CHK_84dd5db10c39e082e1486c35d9"');
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceAiClaim" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "spendId" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "reviewedSpendRevision" integer, "currentEntryId" uuid, "replacementEntryId" uuid, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_243be19cc26b4c8a650c872456" CHECK ("replacementEntryId" IS NULL OR ("currentEntryId" IS NOT NULL AND "replacementEntryId" <> "currentEntryId")), CONSTRAINT "CHK_91b6bb83941dd233b5c61ed876" CHECK ("reviewedSpendRevision" IS NULL OR "reviewedSpendRevision" > 0), CONSTRAINT "CHK_c570e46118685ebe4655b2a692" CHECK (revision > 0), CONSTRAINT "PK_b30156df8eb489c7ab9ea89e280" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_2e594a607f135a95e82a28ebdd" ON "core"."deliveryFinanceAiClaim" ("workspaceId", "spendId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" ADD "sourceAiSpend" jsonb');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_4b5c1e09b9da95620baf0fddc2" ON "core"."otogrowAiSpend" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" ADD CONSTRAINT "CHK_4baad4b2ae804be240d2b7d4ea" CHECK (("sourceType"=\'MANUAL\' AND "planId" IS NULL AND "sourcePlan" IS NULL AND "sourceAiSpend" IS NULL) OR ("sourceType"=\'PLAN\' AND "planId" IS NOT NULL AND "sourcePlan" IS NOT NULL AND "sourceAiSpend" IS NULL) OR ("sourceType"=\'AI_SPEND\' AND "planId" IS NULL AND "sourcePlan" IS NULL AND "sourceAiSpend" IS NOT NULL AND kind=\'COST\' AND currency=\'USD\'))');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" ADD CONSTRAINT "CHK_3199c264563bbcfe130790a24c" CHECK ("sourceType" IN (\'MANUAL\', \'PLAN\', \'AI_SPEND\'))');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" ADD CONSTRAINT "FK_d5774e822390a942927e78d4ce7" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" ADD CONSTRAINT "FK_2e594a607f135a95e82a28ebdd1" FOREIGN KEY ("workspaceId", "spendId") REFERENCES "core"."otogrowAiSpend"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" ADD CONSTRAINT "FK_aae67a0178876039162c2ff5609" FOREIGN KEY ("workspaceId", "currentEntryId") REFERENCES "core"."deliveryFinanceEntry"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" ADD CONSTRAINT "FK_293e98b9792d47589295c16d0ba" FOREIGN KEY ("workspaceId", "replacementEntryId") REFERENCES "core"."deliveryFinanceEntry"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryFinanceAiClaim")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceEntry" WHERE "sourceType"='AI_SPEND') THEN
        RAISE EXCEPTION 'AI finance history exists; preserve it before rolling back this schema.';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" DROP CONSTRAINT "FK_293e98b9792d47589295c16d0ba"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" DROP CONSTRAINT "FK_aae67a0178876039162c2ff5609"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" DROP CONSTRAINT "FK_2e594a607f135a95e82a28ebdd1"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceAiClaim" DROP CONSTRAINT "FK_d5774e822390a942927e78d4ce7"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" DROP CONSTRAINT "CHK_3199c264563bbcfe130790a24c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" DROP CONSTRAINT "CHK_4baad4b2ae804be240d2b7d4ea"');
    await queryRunner.query('DROP INDEX "core"."IDX_4b5c1e09b9da95620baf0fddc2"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" DROP COLUMN "sourceAiSpend"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceAiClaim"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" ADD CONSTRAINT "CHK_84dd5db10c39e082e1486c35d9" CHECK (("sourceType" = ANY (ARRAY[\'MANUAL\'::text, \'PLAN\'::text])))');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceEntry" ADD CONSTRAINT "CHK_60b25b3109b9eb0814862b4df7" CHECK (((("sourceType" = \'MANUAL\'::text) AND ("planId" IS NULL) AND ("sourcePlan" IS NULL)) OR (("sourceType" = \'PLAN\'::text) AND ("planId" IS NOT NULL) AND ("sourcePlan" IS NOT NULL))))');
  }
}
