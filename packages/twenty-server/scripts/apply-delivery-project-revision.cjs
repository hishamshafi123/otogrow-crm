const assert = require('node:assert/strict');
const { CommandFactory } = require('nest-commander');
const { CommandModule } = require('../dist/command/command.module');
const { DataSource } = require('typeorm');
const {
  UpgradeSequenceReaderService,
} = require('../dist/engine/core-modules/upgrade/services/upgrade-sequence-reader.service');
const {
  InstanceCommandRunnerService,
} = require('../dist/engine/core-modules/upgrade/services/instance-command-runner.service');
(async () => {
  const app = await CommandFactory.createWithoutRunning(CommandModule, {
    logger: ['error'],
  });
  try {
    assert(
      ['localhost', '127.0.0.1'].includes(
        new URL(app.get(DataSource).options.url).hostname,
      ),
    );
    const step = app
      .get(UpgradeSequenceReaderService)
      .getUpgradeSequence()
      .find(
        (item) =>
          item.kind === 'fast-instance' &&
          item.command.constructor.name ===
            'AddDeliveryProjectRevisionFastInstanceCommand',
      );
    assert(step, 'Generated instance command not found');
    const result = await app
      .get(InstanceCommandRunnerService)
      .runFastInstanceCommand({ command: step.command, name: step.name });
    assert(result.status === 'success' || result.status === 'already-executed');
    console.log(`Delivery project revision migration: ${result.status}`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
