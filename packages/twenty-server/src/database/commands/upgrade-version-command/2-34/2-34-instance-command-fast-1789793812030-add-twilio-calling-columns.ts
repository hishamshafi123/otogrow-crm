import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1789793812030)
export class AddTwilioCallingColumnsFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" ADD "voiceNumber" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" ADD "apiKeySid" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" ADD "apiKeySecret" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" ADD "twimlAppSid" text',
    );
    await queryRunner.query(
      `ALTER TABLE "core"."twilioConfig" ADD CONSTRAINT "CHK_twilioConfig_apiKeySecret_encrypted" CHECK ("apiKeySecret" IS NULL OR "apiKeySecret" LIKE 'enc:v2:%')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" DROP CONSTRAINT "CHK_twilioConfig_apiKeySecret_encrypted"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" DROP COLUMN "twimlAppSid"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" DROP COLUMN "apiKeySecret"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" DROP COLUMN "apiKeySid"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."twilioConfig" DROP COLUMN "voiceNumber"',
    );
  }
}
