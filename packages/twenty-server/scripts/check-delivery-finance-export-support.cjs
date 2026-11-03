const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  TABLES: PERIOD_TABLES,
  createPeriodFixture,
  cleanupPeriodFixture,
} = require('./check-delivery-finance-period.cjs');

const EXPORT_TABLES = [
  'deliveryFinanceExportBatch',
  'deliveryFinanceExportProfile',
];
const FORECAST_TABLES = [
  'deliveryFinanceForecastRealization',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastAnchor',
];
const TABLES = [...PERIOD_TABLES, ...FORECAST_TABLES, ...EXPORT_TABLES];
const EVENT_SOURCE_TYPES = ['EXPORT_PROFILE', 'EXPORT_BATCH'];
const PROTECTED_TABLES = [...PERIOD_TABLES, ...FORECAST_TABLES].filter(
  (table) => !['deliveryFinanceEvent', 'otogrowActivityEvent'].includes(table),
);

const createExportFixture = (manager, prefix = 'ai_finance_export') =>
  createPeriodFixture(manager, prefix);

async function assertExportFixture(manager, fixture) {
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.match(fixture.schemaName, /^ai_finance_export[a-z_]*_[a-f0-9_]{36}$/);
  assert(fixture.schemaName.length <= 63);
  assert.notEqual(fixture.workspaceId, fixture.foreignWorkspaceId);
  const rows = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.displayName, fixture.sentinel);
    assert.equal(row.databaseSchema, fixture.schemaName);
  }
}

async function cleanupExportFixture(manager, fixture) {
  await assertExportFixture(manager, fixture);
  const workspaceIds = [fixture.workspaceId, fixture.foreignWorkspaceId];
  await manager.query(
    'DELETE FROM core."deliveryFinanceEvent" WHERE "workspaceId"=ANY($1::uuid[]) AND "sourceType"=ANY($2::text[])',
    [workspaceIds, EVENT_SOURCE_TYPES],
  );
  for (const table of [...EXPORT_TABLES, ...FORECAST_TABLES])
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [workspaceIds],
    );
  await cleanupPeriodFixture(manager, fixture);
}

async function fingerprint(manager, fixture, tables = TABLES) {
  const result = {};
  for (const table of tables) {
    const rows = await manager.query(
      `SELECT to_jsonb(fixture_row)::text AS value FROM core."${table}" fixture_row WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    result[table] = {
      count: rows.length,
      hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    };
  }
  return result;
}

async function financialFingerprint(manager, fixture) {
  const result = await fingerprint(manager, fixture, PROTECTED_TABLES);
  const rows = await manager.query(
    'SELECT to_jsonb(fixture_row)::text AS value FROM core."deliveryFinanceEvent" fixture_row WHERE "workspaceId"=ANY($1::uuid[]) AND NOT ("sourceType"=ANY($2::text[])) ORDER BY id',
    [[fixture.workspaceId, fixture.foreignWorkspaceId], EVENT_SOURCE_TYPES],
  );
  result.financialEvents = {
    count: rows.length,
    hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
  };
  return result;
}

const checksum = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function parseCsv(value) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (character === '\r' || character === '\n')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (character === '\r' && value[index + 1] === '\n') index++;
    } else cell += character;
  }
  assert.equal(quoted, false, 'CSV quotes must be balanced.');
  if (row.length || cell.length) rows.push([...row, cell]);
  return rows;
}

module.exports = {
  TABLES,
  EXPORT_TABLES,
  EVENT_SOURCE_TYPES,
  createExportFixture,
  assertExportFixture,
  cleanupExportFixture,
  fingerprint,
  financialFingerprint,
  checksum,
  parseCsv,
};
