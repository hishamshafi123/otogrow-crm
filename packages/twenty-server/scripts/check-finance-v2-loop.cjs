#!/usr/bin/env node
'use strict';

// Automated verification gate runner for the Otogrow Finance V2 Loop Engineering System.
// Runs migration monotonicity checks, backend/frontend Finance V2 suites, direct tsgo typechecks,
// and shared-module regression checks without relying on Nx cache.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_DIR = path.join(REPO_ROOT, 'packages/twenty-server');
const FRONT_DIR = path.join(REPO_ROOT, 'packages/twenty-front');
const UPGRADE_DIR = path.join(
  SERVER_DIR,
  'src/database/commands/upgrade-version-command/2-34',
);

const results = [];

const runStep = (id, label, command, args, cwd) => {
  console.log(`\n=== [${id}] ${label} ===`);
  const startedAt = Date.now();
  const res = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const passed = res.status === 0;
  results.push({ id, label, passed, elapsedSec });
  console.log(
    `>>> [${id}] ${passed ? 'PASS' : 'FAIL'} (${elapsedSec}s)`,
  );
  return passed;
};

const checkUpgradeTimestamps = () => {
  const id = 'G5-MIGRATION-ORDER';
  const label = 'Upgrade command timestamps in 2-34/ are unique and monotonic';
  console.log(`\n=== [${id}] ${label} ===`);
  const files = fs
    .readdirSync(UPGRADE_DIR)
    .filter((name) => name.includes('instance-command-'))
    .sort();
  const seen = new Map();
  const errors = [];
  for (const file of files) {
    const match = file.match(/instance-command-(?:fast|slow)-(\d{13})-/);
    if (!match) {
      errors.push(`Unrecognized timestamp format in ${file}`);
      continue;
    }
    const ts = match[1];
    if (seen.has(ts)) {
      errors.push(`Duplicate timestamp ${ts}: ${seen.get(ts)} and ${file}`);
    }
    seen.set(ts, file);
  }
  const financeV2Files = files.filter((f) => f.includes('finance-v2'));
  if (financeV2Files.length === 0) {
    errors.push('No Finance V2 instance command migration found in 2-34/');
  } else {
    const allTimestamps = [...seen.keys()].sort();
    const newest = allTimestamps[allTimestamps.length - 1];
    const newestFile = seen.get(newest);
    if (!newestFile || !newestFile.includes('finance-v2')) {
      console.log(
        `Note: newest timestamp in 2-34/ is ${newestFile} (${newest}); finance-v2 files: ${financeV2Files.join(', ')}`,
      );
    }
  }
  const passed = errors.length === 0;
  if (!passed) {
    for (const err of errors) console.error(`  ERROR: ${err}`);
  } else {
    console.log(
      `Checked ${files.length} instance commands (${financeV2Files.join(', ')}) — OK`,
    );
  }
  results.push({ id, label, passed, elapsedSec: '0.0' });
  return passed;
};

const main = () => {
  const skipTypecheck = process.argv.includes('--skip-typecheck');
  const jestBin = path.join(REPO_ROOT, 'node_modules/.bin/jest');
  const tsgoBin = path.join(REPO_ROOT, 'node_modules/.bin/tsgo');
  const tsxBin = path.join(REPO_ROOT, 'node_modules/.bin/tsx');

  checkUpgradeTimestamps();

  runStep(
    'G1-G6-SERVER-TESTS',
    'Backend Finance V2 invariants, payroll, PDF & service tests',
    jestBin,
    [
      '--config=packages/twenty-server/jest.config.mjs',
      '--runInBand',
      'src/modules/delivery/finance-v2/',
    ],
    REPO_ROOT,
  );

  runStep(
    'G3-REAL-PDF-SMOKE',
    'Real @react-pdf/renderer branded Quote & Invoice PDF generation',
    tsxBin,
    ['scripts/check-finance-v2-pdf.ts'],
    SERVER_DIR,
  );

  runStep(
    'G7-G8-FRONT-TESTS',
    'Frontend Finance V2 & DeliveryFinance behavior tests',
    jestBin,
    [
      '--config=packages/twenty-front/jest.config.mjs',
      '--runInBand',
      'src/modules/delivery/finance/__tests__/DeliveryFinance.test.tsx',
      'src/modules/delivery/finance/v2/',
    ],
    REPO_ROOT,
  );

  if (!skipTypecheck) {
    runStep(
      'G7-SERVER-TSGO',
      'Direct twenty-server typecheck (tsgo --noEmit)',
      tsgoBin,
      ['-p', 'tsconfig.json', '--noEmit'],
      SERVER_DIR,
    );

    runStep(
      'G7-FRONT-TSGO',
      'Direct twenty-front typecheck (tsgo --noEmit)',
      tsgoBin,
      ['-p', 'tsconfig.json', '--noEmit'],
      FRONT_DIR,
    );
  }

  console.log('\n================ FINANCE V2 LOOP GATE SUMMARY ================');
  let allPassed = true;
  for (const row of results) {
    const badge = row.passed ? 'PASS' : 'FAIL';
    if (!row.passed) allPassed = false;
    console.log(`  [${badge}] ${row.id.padEnd(20)} (${row.elapsedSec}s) — ${row.label}`);
  }
  console.log('==============================================================\n');
  process.exit(allPassed ? 0 : 1);
};

main();
