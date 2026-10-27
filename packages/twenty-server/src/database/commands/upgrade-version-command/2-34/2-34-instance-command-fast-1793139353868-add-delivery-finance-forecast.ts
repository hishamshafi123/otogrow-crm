import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793139353868)
export class AddDeliveryFinanceForecastFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "core"."IDX_d39da878eb67253f778647300d"');
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceForecastItem" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "status" text NOT NULL, "kind" text NOT NULL, "sourceType" text NOT NULL, "receivableId" uuid, "planId" uuid, "planMonth" text, "currency" text NOT NULL, "title" text NOT NULL, "amountMicros" bigint NOT NULL, "expectedDate" date, "ownerId" uuid NOT NULL, "ownerName" text NOT NULL, "nextActionDate" date NOT NULL, "note" text NOT NULL, "sourceToken" text, "sourceSnapshot" jsonb, "createdBy" uuid NOT NULL, "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_fcbdca60e9b94ca5adc176e0b4" CHECK ("planMonth" IS NULL OR ("planMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("planMonth",4)<>\'0000\')), CONSTRAINT "CHK_de64888b0b72719c5e8856bd4a" CHECK ((kind=\'COLLECTION\' AND "sourceType"=\'RECEIVABLE\' AND "receivableId" IS NOT NULL AND "planId" IS NULL AND "planMonth" IS NULL) OR (kind=\'OUTFLOW\' AND "receivableId" IS NULL AND (("sourceType"=\'PLAN\' AND "planId" IS NOT NULL AND "planMonth" IS NOT NULL) OR ("sourceType"=\'MANUAL\' AND "planId" IS NULL AND "planMonth" IS NULL)))), CONSTRAINT "CHK_4f26ea241e260ab2accc655bf0" CHECK (status IN (\'ACTIVE\',\'CANCELLED\')), CONSTRAINT "CHK_f4d76adc6277b6e62f725c2c15" CHECK ("amountMicros" >= 0), CONSTRAINT "CHK_b74b633fc669ad9fb91132156e" CHECK (revision > 0), CONSTRAINT "PK_2c8a154648c2b43b64d2a16b913" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_28826d6e32e656efa611864e33" ON "core"."deliveryFinanceForecastItem" ("workspaceId", "planId", "planMonth") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_a48d78951eee3e7a2a1d91fbb5" ON "core"."deliveryFinanceForecastItem" ("workspaceId", "receivableId") ');
    await queryRunner.query('CREATE INDEX "IDX_faf0d55e4a186255e6347f0756" ON "core"."deliveryFinanceForecastItem" ("workspaceId", "currency", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_e14843508ce8980966f247be88" ON "core"."deliveryFinanceForecastItem" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceForecastRealization" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "cashId" uuid NOT NULL, "cashTitle" text NOT NULL, "targetTitle" text NOT NULL, "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "status" text NOT NULL DEFAULT \'ACTIVE\', "projectId" uuid, "projectName" text, "requestHash" text NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reversedBy" uuid, "reversedByName" text, "reversedAt" TIMESTAMP WITH TIME ZONE, "reversalReason" text, "itemId" uuid NOT NULL, "note" text NOT NULL, CONSTRAINT "CHK_46baaf0e710fbe7f67e12e3d15" CHECK (status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)), CONSTRAINT "CHK_f715d2c666933cdb2790c93b43" CHECK (status IN (\'ACTIVE\',\'REVERSED\')), CONSTRAINT "CHK_1b7b7182f9d844c1127f4171a9" CHECK (revision > 0), CONSTRAINT "CHK_e8c22b5de699970c3da1248157" CHECK ("amountMicros" > 0), CONSTRAINT "PK_e6a22ea8059881afd0047d2b7a1" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_6a276d7e39ec406802a9db78c7" ON "core"."deliveryFinanceForecastRealization" ("workspaceId", "itemId", "id") ');
    await queryRunner.query('CREATE INDEX "IDX_bdd492cb2d0dde2fca51263a2c" ON "core"."deliveryFinanceForecastRealization" ("workspaceId", "cashId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryFinanceForecastAnchor" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "closingDate" date NOT NULL, "timezone" text NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "note" text NOT NULL, "evidenceUrl" text, "changedBy" uuid NOT NULL, "changedByName" text NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_be7cf5c2cc81250144941058b5" CHECK (length(btrim(note)) > 0), CONSTRAINT "CHK_f9c3097cf112c7686bf0ffd4ea" CHECK (revision > 0), CONSTRAINT "PK_230f1d9ffa4262d058c62e6bf72" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_4a83aa64555a0acc3559bb502f" ON "core"."deliveryFinanceForecastAnchor" ("workspaceId", "currency") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_d39da878eb67253f778647300d" ON "core"."deliveryFinancePlan" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" ADD CONSTRAINT "FK_b16e1c394d36dce69dde7e6a896" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" ADD CONSTRAINT "FK_a48d78951eee3e7a2a1d91fbb50" FOREIGN KEY ("workspaceId", "receivableId") REFERENCES "core"."deliveryFinanceSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" ADD CONSTRAINT "FK_6384096ea0ce87e980c62844016" FOREIGN KEY ("workspaceId", "planId") REFERENCES "core"."deliveryFinancePlan"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" ADD CONSTRAINT "FK_481e695f91b9a68c5d4b3f587c3" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" ADD CONSTRAINT "FK_9edb1ed63b12de0b9549cff41b7" FOREIGN KEY ("workspaceId", "cashId") REFERENCES "core"."deliveryFinanceSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" ADD CONSTRAINT "FK_f6c768f3f8366aff25e861b7716" FOREIGN KEY ("workspaceId", "itemId") REFERENCES "core"."deliveryFinanceForecastItem"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastAnchor" ADD CONSTRAINT "FK_1532bc371716cad5c87825fde98" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM core."deliveryFinanceForecastAnchor")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceForecastItem")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceForecastRealization")
        OR EXISTS (SELECT 1 FROM core."deliveryFinanceEvent" WHERE "sourceType" IN ('FORECAST_ANCHOR','FORECAST_ITEM','FORECAST_REALIZATION')) THEN
        RAISE EXCEPTION 'Cash forecast history exists; preserve it before rolling back this schema.';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastAnchor" DROP CONSTRAINT "FK_1532bc371716cad5c87825fde98"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" DROP CONSTRAINT "FK_f6c768f3f8366aff25e861b7716"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" DROP CONSTRAINT "FK_9edb1ed63b12de0b9549cff41b7"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastRealization" DROP CONSTRAINT "FK_481e695f91b9a68c5d4b3f587c3"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" DROP CONSTRAINT "FK_6384096ea0ce87e980c62844016"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" DROP CONSTRAINT "FK_a48d78951eee3e7a2a1d91fbb50"');
    await queryRunner.query('ALTER TABLE "core"."deliveryFinanceForecastItem" DROP CONSTRAINT "FK_b16e1c394d36dce69dde7e6a896"');
    await queryRunner.query('DROP INDEX "core"."IDX_d39da878eb67253f778647300d"');
    await queryRunner.query('DROP INDEX "core"."IDX_4a83aa64555a0acc3559bb502f"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceForecastAnchor"');
    await queryRunner.query('DROP INDEX "core"."IDX_bdd492cb2d0dde2fca51263a2c"');
    await queryRunner.query('DROP INDEX "core"."IDX_6a276d7e39ec406802a9db78c7"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceForecastRealization"');
    await queryRunner.query('DROP INDEX "core"."IDX_e14843508ce8980966f247be88"');
    await queryRunner.query('DROP INDEX "core"."IDX_faf0d55e4a186255e6347f0756"');
    await queryRunner.query('DROP INDEX "core"."IDX_a48d78951eee3e7a2a1d91fbb5"');
    await queryRunner.query('DROP INDEX "core"."IDX_28826d6e32e656efa611864e33"');
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceForecastItem"');
    await queryRunner.query('CREATE INDEX "IDX_d39da878eb67253f778647300d" ON "core"."deliveryFinancePlan" ("workspaceId", "id") ');
  }
}
