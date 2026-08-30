import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1787593556029)
export class AddTwilioConfigEntityFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."twilioConfig" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountSid" text NOT NULL, "authToken" text NOT NULL, "whatsappSenderNumber" text, "smsNumber" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_twilioConfig_authToken_encrypted" CHECK ("authToken" LIKE \'enc:v2:%\'), CONSTRAINT "PK_1829415144d70f0f097527b16cc" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_TWILIO_CONFIG_WORKSPACE_ID" ON "core"."twilioConfig" ("workspaceId") ');
    await queryRunner.query('ALTER TABLE "core"."twilioConfig" ADD CONSTRAINT "FK_8d47072a1be759e1c2668052415" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."twilioConfig" DROP CONSTRAINT "FK_8d47072a1be759e1c2668052415"');
    await queryRunner.query('DROP INDEX "core"."IDX_TWILIO_CONFIG_WORKSPACE_ID"');
    await queryRunner.query('DROP TABLE "core"."twilioConfig"');
  }
}
