import { Injectable } from '@nestjs/common';

import { TwilioDriver } from 'src/engine/core-modules/twenty-config/enums/twilio-driver.enum';
import { ConfigGroupHashService } from 'src/engine/core-modules/twenty-config/services/config-group-hash.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DriverFactoryBase } from 'src/engine/core-modules/twenty-config/dynamic-factory.base';
import { TwilioClientService } from 'src/engine/metadata-modules/twilio-config/services/twilio-client.service';
import { type ChannelMessageDriverInterface } from 'src/modules/messaging/channels/drivers/interfaces/channel-message-driver.interface';
import { LoggerChannelMessageDriver } from 'src/modules/messaging/channels/drivers/logger-channel-message.driver';
import { TwilioChannelMessageDriver } from 'src/modules/messaging/channels/drivers/twilio-channel-message.driver';

@Injectable()
export class ChannelMessageDriverFactory extends DriverFactoryBase<ChannelMessageDriverInterface> {
  constructor(
    twentyConfigService: TwentyConfigService,
    configGroupHashService: ConfigGroupHashService,
    private readonly twilioClientService: TwilioClientService,
  ) {
    super(twentyConfigService, configGroupHashService);
  }

  protected buildConfigKey(): string {
    const driver = this.twentyConfigService.get('TWILIO_DRIVER');

    // Credentials live per workspace in twilioConfig, so a single driver
    // instance covers every workspace.
    if (driver === TwilioDriver.LOGGER) {
      return 'logger';
    }

    if (driver === TwilioDriver.TWILIO) {
      return 'twilio';
    }

    throw new Error(`Unsupported Twilio driver: ${driver}`);
  }

  protected createDriver(): ChannelMessageDriverInterface {
    const driver = this.twentyConfigService.get('TWILIO_DRIVER');

    switch (driver) {
      case TwilioDriver.LOGGER:
        return new LoggerChannelMessageDriver();

      case TwilioDriver.TWILIO:
        return new TwilioChannelMessageDriver(this.twilioClientService);

      default:
        throw new Error(`Invalid Twilio driver: ${driver}`);
    }
  }
}
