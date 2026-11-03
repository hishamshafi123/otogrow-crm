const assert = require('node:assert/strict');
const { CommandFactory } = require('nest-commander');
const { DataSource } = require('typeorm');
const { CommandModule } = require('../dist/command/command.module');
const {
  UpgradeSequenceReaderService,
} = require('../dist/engine/core-modules/upgrade/services/upgrade-sequence-reader.service');
const {
  InstanceCommandRunnerService,
} = require('../dist/engine/core-modules/upgrade/services/instance-command-runner.service');

async function main() {
  assert.equal(process.argv.length, 2);
  const app = await CommandFactory.createWithoutRunning(CommandModule, {
    logger: ['error'],
  });
  try {
    assert(
      ['localhost', '127.0.0.1'].includes(
        new URL(app.get(DataSource).options.url).hostname,
      ),
    );
    const steps = app
      .get(UpgradeSequenceReaderService)
      .getUpgradeSequence()
      .filter(
        (step) =>
          step.kind === 'fast-instance' &&
          step.command.constructor.name ===
            'AddDeliveryCreativeReviewFastInstanceCommand',
      );
    assert.equal(
      steps.length,
      1,
      'Expected one generated creative-review migration.',
    );
    const step = steps[0];
    const result = await app
      .get(InstanceCommandRunnerService)
      .runFastInstanceCommand({ command: step.command, name: step.name });
    assert(['success', 'already-executed'].includes(result.status));
    console.log(`Delivery creative review migration: ${result.status}`);
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
