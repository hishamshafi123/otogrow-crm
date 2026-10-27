const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const OriginalDate = Date;
const STRUCTURAL_TABLES = [
  'deliveryFinanceAiClaim',
  'deliveryFinanceCashMatch',
  'deliveryFinanceSettlement',
  'deliveryFinanceAllocation',
  'deliveryFinanceEntry',
  'deliveryFinancePlan',
  'deliveryFinancePeriod',
  'otogrowAiSpend',
  'otogrowAiSpendEvent',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'deliveryReminderOutbox',
];

const dateShift = (date, days) => {
  const changed = new OriginalDate(`${date}T12:00:00.000Z`);
  changed.setUTCDate(changed.getUTCDate() + days);
  return changed.toISOString().slice(0, 10);
};

const businessDate = (timeZone = 'UTC', instant = OriginalDate.now()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (name) => parts.find((candidate) => candidate.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

async function withClock(instant, callback) {
  const previousDate = global.Date;
  const timestamp = new OriginalDate(instant).getTime();
  assert(Number.isFinite(timestamp));
  global.Date = class extends OriginalDate {
    constructor(...arguments_) {
      super(...(arguments_.length ? arguments_ : [timestamp]));
    }
    static now() {
      return timestamp;
    }
  };
  try {
    return await callback();
  } finally {
    global.Date = previousDate;
  }
}

async function assertFixture(manager, fixture) {
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.match(fixture.schemaName, /^ai_finance_forecast[a-z_]*_[a-f0-9_]{36}$/);
  assert(fixture.schemaName.length <= 63);
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
}

async function fixtureOperations(manager, fixture) {
  const [operations] = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
    [fixture.workspaceId],
  );
  return operations ?? null;
}

async function mutateFixtureCash(manager, fixture, id, changes) {
  await assertFixture(manager, fixture);
  const operations = await fixtureOperations(manager, fixture);
  assert(operations);
  const records = structuredClone(operations.state.business.records);
  const record = records.find((candidate) => candidate.id === id);
  assert(record && record.kind === 'FINANCE');
  Object.assign(record, changes);
  await manager.query(
    'UPDATE core."deliveryOperations" SET state=jsonb_set(state,\'{business,records}\',$1::jsonb) WHERE "workspaceId"=$2 AND id=$3',
    [JSON.stringify(records), fixture.workspaceId, operations.id],
  );
  return record;
}

async function financialFingerprint(manager, fixture) {
  const result = {};
  for (const table of STRUCTURAL_TABLES) {
    const rows = await manager.query(
      `SELECT to_jsonb(fixture_row)::text AS value FROM core."${table}" fixture_row WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    result[table] = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
  }
  const operations = await fixtureOperations(manager, fixture);
  result.businessRecords = createHash('sha256')
    .update(JSON.stringify(operations?.state.business?.records ?? []))
    .digest('hex');
  return result;
}

module.exports = {
  dateShift,
  businessDate,
  withClock,
  assertFixture,
  fixtureOperations,
  mutateFixtureCash,
  financialFingerprint,
};
