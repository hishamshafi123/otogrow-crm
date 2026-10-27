import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793098333552)
export class AddDeliveryFinanceFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinancePlan" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "type" text NOT NULL, "name" text NOT NULL, "currency" text NOT NULL, "monthlyAmountMicros" bigint NOT NULL, "memberId" uuid, "memberName" text, "startMonth" text NOT NULL, "endMonth" text, "dueDay" integer NOT NULL, "active" boolean NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_0fa2a97404af192f6b008f0c3c" CHECK (NOT (active AND type=\'SALARY\') OR "memberId" IS NOT NULL), CONSTRAINT "CHK_90d8916f21f0fe378c7c10cd1c" CHECK ("endMonth" IS NULL OR ("endMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("endMonth",4)<>\'0000\')), CONSTRAINT "CHK_0c4f34151fa243deb76663aeda" CHECK ("startMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("startMonth",4)<>\'0000\'), CONSTRAINT "CHK_b08058a98d373a193c1dc4dd64" CHECK ("endMonth" IS NULL OR "endMonth" >= "startMonth"), CONSTRAINT "CHK_44835068976ec306ed84c575b5" CHECK (type IN (\'SALARY\', \'OVERHEAD\')), CONSTRAINT "CHK_a7094ab581de8c8735992c22cd" CHECK ("dueDay" BETWEEN 1 AND 31), CONSTRAINT "CHK_30f949b94721da17d6394df214" CHECK ("revision" > 0), CONSTRAINT "CHK_70614cdca4376b95e2b4a5bdd4" CHECK ("monthlyAmountMicros" >= 0), CONSTRAINT "PK_092e6103093c7224b7336a1cadf" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_d39da878eb67253f778647300d" ON "core"."deliveryFinancePlan" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceEntry" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "month" text NOT NULL, "kind" text NOT NULL, "category" text NOT NULL, "title" text NOT NULL, "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "note" text NOT NULL, "evidenceUrl" text, "status" text NOT NULL DEFAULT \'DRAFT\', "sourceType" text NOT NULL, "planId" uuid, "sourcePlan" jsonb, "dueDate" date, "createdBy" uuid NOT NULL, "postedBy" uuid, "postedAt" TIMESTAMP WITH TIME ZONE, "voidedBy" uuid, "voidedAt" TIMESTAMP WITH TIME ZONE, "voidReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_cb620eda2ffda20c299a036bed" CHECK (status<>\'VOID\' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(btrim("voidReason"))>0)), CONSTRAINT "CHK_032e221336a9ce66b2e9f49fe8" CHECK (status<>\'POSTED\' OR ("postedAt" IS NOT NULL AND "postedBy" IS NOT NULL)), CONSTRAINT "CHK_a7b8585739f687f119e2065629" CHECK (month ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left(month,4)<>\'0000\'), CONSTRAINT "CHK_60b25b3109b9eb0814862b4df7" CHECK (("sourceType"=\'MANUAL\' AND "planId" IS NULL AND "sourcePlan" IS NULL) OR ("sourceType"=\'PLAN\' AND "planId" IS NOT NULL AND "sourcePlan" IS NOT NULL)), CONSTRAINT "CHK_84dd5db10c39e082e1486c35d9" CHECK ("sourceType" IN (\'MANUAL\', \'PLAN\')), CONSTRAINT "CHK_2bdd2bf8e5542def8205d42207" CHECK (status IN (\'DRAFT\', \'POSTED\', \'VOID\')), CONSTRAINT "CHK_205c77da795c5ef282b80cab10" CHECK (kind IN (\'REVENUE\', \'COST\')), CONSTRAINT "CHK_ebcfecac21f5cbc2118e83fa1e" CHECK ("revision" > 0), CONSTRAINT "CHK_765ac8c81f666838a9fe520405" CHECK ("amountMicros" >= 0), CONSTRAINT "PK_25c239149bc4b271e09632daf5f" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_0e01d5d7490c9ed05fce29574c" ON "core"."deliveryFinanceEntry" ("workspaceId", "planId", "month") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_d9ae57c16b0ad6be444a6b711b" ON "core"."deliveryFinanceEntry" ("workspaceId", "month", "currency") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_c45a1ed2b7de2bee24f1fa11c5" ON "core"."deliveryFinanceEntry" ("workspaceId", "month", "id") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_c90599a5a5f4ef3d044002aa6a" ON "core"."deliveryFinanceEntry" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceAllocation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entryId" uuid NOT NULL, "bucket" text NOT NULL, "projectId" uuid, "projectName" text, "amountMicros" bigint NOT NULL, CONSTRAINT "CHK_b97f28efa2d7d1f6ba7b01529d" CHECK (bucket = COALESCE("projectId"::text, \'COMPANY\')), CONSTRAINT "CHK_1a7dfe778487a92df98692c82d" CHECK ("amountMicros" >= 0), CONSTRAINT "PK_1b5eb2875e2e878c3d3bf65922f" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_9ebc3755f339c9467f5204ef38" ON "core"."deliveryFinanceAllocation" ("workspaceId", "entryId", "bucket") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceType" text NOT NULL, "sourceId" uuid NOT NULL, "actorId" uuid NOT NULL, "actorName" text NOT NULL, "action" text NOT NULL, "revision" integer NOT NULL, "reason" text NOT NULL, "before" jsonb, "after" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c3994314a75ccaa882ada573499" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_afb2016099b87d11d1398a1aa5" ON "core"."deliveryFinanceEvent" ("workspaceId", "sourceType", "sourceId", "createdAt", "id") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinancePlan" ADD CONSTRAINT "FK_5fec2f711c28e7756e146fb637a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceEntry" ADD CONSTRAINT "FK_a546608f3dc65491ead22e5b8db" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceAllocation" ADD CONSTRAINT "FK_912fc593e95ac352331ea13b06e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceAllocation" ADD CONSTRAINT "FK_91e019ba7aa6f145ad575678b3c" FOREIGN KEY ("workspaceId", "entryId") REFERENCES "core"."deliveryFinanceEntry"("workspaceId","id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceEvent" ADD CONSTRAINT "FK_23b83cb01b4d687640f6fe2b94d" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceEvent" DROP CONSTRAINT "FK_23b83cb01b4d687640f6fe2b94d"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceAllocation" DROP CONSTRAINT "FK_91e019ba7aa6f145ad575678b3c"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceAllocation" DROP CONSTRAINT "FK_912fc593e95ac352331ea13b06e"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceEntry" DROP CONSTRAINT "FK_a546608f3dc65491ead22e5b8db"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinancePlan" DROP CONSTRAINT "FK_5fec2f711c28e7756e146fb637a"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_afb2016099b87d11d1398a1aa5"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceEvent"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_9ebc3755f339c9467f5204ef38"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceAllocation"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_c90599a5a5f4ef3d044002aa6a"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_c45a1ed2b7de2bee24f1fa11c5"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d9ae57c16b0ad6be444a6b711b"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_0e01d5d7490c9ed05fce29574c"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceEntry"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_d39da878eb67253f778647300d"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinancePlan"');
  }
}
