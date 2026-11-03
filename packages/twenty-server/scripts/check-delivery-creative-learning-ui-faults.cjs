const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const FILE = '/tmp/otogrow-creative-learning-ui-fixture.json';

function run(mode, fault) {
  const result = spawnSync(
    process.execPath,
    ['-r', 'dotenv/config', 'scripts/check-delivery-creative-learning-ui-fixture.cjs', mode],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=2048',
        OTOGROW_CREATIVE_LEARNING_UI_TEST_FAILURE: fault ?? '',
      },
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, fault ? 1 : 0, output);
  if (fault) assert.match(output, /Injected/);
}

function main() {
  assert(!existsSync(FILE), 'Finish the active owned fixture before the fault drill.');
  const faults = [
    'create-before-commit',
    'create-after-commit',
    'cleanup-before-commit',
    'cleanup-after-commit',
  ];
  for (const fault of faults) {
    const createFault = fault.startsWith('create-');
    run('create', createFault ? fault : undefined);
    const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
    if (!createFault) run('cleanup', fault);
    run('cleanup');
    assert(!existsSync(FILE));
    const receipt = JSON.parse(readFileSync(`${FILE}.${fixture.nonce}.cleaned.json`, 'utf8'));
    assert.equal(receipt.status, 'CLEANED');
    console.log(`PASS guarded Creative learning interruption: ${fault}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(`Preserve any active ${FILE}; the drill never bypasses cleanup guards.`);
  process.exitCode = 1;
}
