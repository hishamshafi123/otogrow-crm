const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddVideoQaAndFathomImportsFastInstanceCommand: Command } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793666115145-add-video-qa-and-fathom-imports');
const { INSTANCE_COMMANDS } = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const { getRegisteredInstanceCommandMetadata } = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const { userTables, dataFingerprint, schemaFingerprint } = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');

const NEW_TABLES = ['deliveryVideoQaReport', 'deliveryFathomConnection'];
const CHANGED_TABLES = ['deliveryKnowledgeSource', 'deliveryKnowledgeVersion'];
const EXCLUDED_TABLES = [...NEW_TABLES, ...CHANGED_TABLES];
const KNOWLEDGE_INDEX = 'IDX_1a9293664d2b3f97fcc7fa2937';
const KNOWLEDGE_CHECK = 'CHK_fd491fe51d33f292c0d0f45bbc';
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function knowledgeSnapshot(runner, stripAdded = false) {
  const data = {};
  for (const [table, field] of [
    ['deliveryKnowledgeSource', 'fathomRecordingId'],
    ['deliveryKnowledgeVersion', 'fathomProvenance'],
  ])
    data[table] = await runner.query(`SELECT (to_jsonb(row)-'${field}')::text AS value FROM core.${quote(table)} row ORDER BY 1`);
  const columns = await runner.query(`SELECT table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name FROM information_schema.columns WHERE table_schema='core' AND table_name=ANY($1) ORDER BY 1,3`, [CHANGED_TABLES]);
  const indexes = await runner.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1) ORDER BY 1,2`, [CHANGED_TABLES]);
  const constraints = await runner.query(`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND c.relname=ANY($1) ORDER BY 1,2`, [CHANGED_TABLES]);
  return {
    data,
    columns: stripAdded ? columns.filter((row) => !['fathomRecordingId', 'fathomProvenance'].includes(row.column_name)) : columns,
    indexes: stripAdded ? indexes.filter((row) => row.indexname !== KNOWLEDGE_INDEX) : indexes,
    constraints: stripAdded ? constraints.filter((row) => row.conname !== KNOWLEDGE_CHECK) : constraints,
  };
}

async function assertSchema(runner) {
  const tables = await userTables(runner);
  for (const name of NEW_TABLES) assert(tables.some((table) => table.schema === 'core' && table.name === name));
  const indexes = await runner.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1) AND indexname NOT LIKE 'PK_%' ORDER BY 1,2`, [NEW_TABLES]);
  assert.equal(indexes.length, 5);
  assert.equal(indexes.filter((index) => index.indexdef.startsWith('CREATE UNIQUE')).length, 4);
  const foreignKeys = await runner.query(`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND c.relname=ANY($1) AND k.contype='f' ORDER BY 1,2`, [NEW_TABLES]);
  assert.equal(foreignKeys.length, 4);
  assert(foreignKeys.some((key) => key.definition.includes('FOREIGN KEY ("workspaceId", "taskId")')));
  assert(foreignKeys.some((key) => key.definition.includes('FOREIGN KEY ("workspaceId", "projectId")')));
  const current = await knowledgeSnapshot(runner);
  const addedColumns = current.columns.filter((row) => ['fathomRecordingId', 'fathomProvenance'].includes(row.column_name));
  assert.deepEqual(addedColumns.map((row) => [row.table_name, row.column_name, row.is_nullable, row.data_type]), [
    ['deliveryKnowledgeSource', 'fathomRecordingId', 'YES', 'text'],
    ['deliveryKnowledgeVersion', 'fathomProvenance', 'YES', 'jsonb'],
  ]);
  assert(current.indexes.some((row) => row.indexname === KNOWLEDGE_INDEX && row.indexdef.includes('CREATE UNIQUE')));
  assert(current.constraints.some((row) => row.conname === KNOWLEDGE_CHECK));
}

async function main() {
  assert.equal(INSTANCE_COMMANDS.filter((entry) => entry === Command).length, 1);
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Command), { version: '2.34.0', timestamp: 1793666115145, type: 'fast' });
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const tables = await userTables(runner);
    assert(!tables.some((table) => table.schema === 'core' && NEW_TABLES.includes(table.name)), 'Run the unapplied migration proof before local installation.');
    const originalData = await dataFingerprint(runner, EXCLUDED_TABLES);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, false, [], '', EXCLUDED_TABLES);
    const originalKnowledge = await knowledgeSnapshot(runner);
    const migration = new Command();
    const preserved = async () => {
      assert.deepEqual(await dataFingerprint(runner, EXCLUDED_TABLES), originalData);
      assert.equal(await schemaFingerprint(runner, false, [], '', EXCLUDED_TABLES), protectedSchema);
      assert.deepEqual(await knowledgeSnapshot(runner, true), originalKnowledge);
    };
    let counter = 0;
    const isolated = async (operation) => {
      const name = `media_meetings_${++counter}`;
      await runner.query(`SAVEPOINT ${name}`);
      try { return await operation(); }
      finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const rejects = (operation, code) => isolated(() => assert.rejects(operation, (error) => error.code === code));
    await migration.up(runner);
    await assertSchema(runner);
    await preserved();
    const installedSchema = await schemaFingerprint(runner);
    await isolated(async () => {
      const fixture = await createFixture(runner.manager, 'media_meetings_migration');
      const actorId = fixture.people.admin.memberId;
      const taskId = randomUUID();
      await runner.query('INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",revision,details) VALUES($1,$2,$3,1,$4)', [fixture.workspaceId, taskId, fixture.projects.first, {}]);
      const fixtureSchema = await schemaFingerprint(runner);
      const qa = (overrides = {}) => ({
        workspaceId: fixture.workspaceId, id: randomUUID(), taskId,
        projectId: fixture.projects.first, initiatorId: actorId,
        userWorkspaceId: fixture.people.admin.userWorkspaceId,
        requestId: randomUUID(), inputHash: 'a'.repeat(64), pricingRevision: 1,
        input: {}, ...overrides,
      });
      const insert = (table, values) => {
        const fields = Object.keys(values);
        return runner.query(`INSERT INTO core.${quote(table)} (${fields.map(quote).join(',')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(values));
      };
      const first = qa();
      await isolated(async () => {
        await insert('deliveryVideoQaReport', first);
        await rejects(() => insert('deliveryVideoQaReport', qa({ requestId: first.requestId })), '23505');
        await rejects(() => insert('deliveryVideoQaReport', qa({ inputHash: 'bad' })), '23514');
        await rejects(() => insert('deliveryVideoQaReport', qa({ result: {}, completedAt: null })), '23514');
        await rejects(() => insert('deliveryVideoQaReport', qa({ taskId: randomUUID() })), '23503');
        await rejects(() => insert('deliveryVideoQaReport', qa({ workspaceId: randomUUID() })), '23503');
      });
      await rejects(() => insert('deliveryFathomConnection', { workspaceId: fixture.workspaceId, revision: 1, enabled: true, apiKey: null, updatedBy: actorId }), '23514');
      await rejects(() => insert('deliveryFathomConnection', { workspaceId: fixture.workspaceId, revision: 0, enabled: false, updatedBy: actorId }), '23514');
      const source = () => ({ id: randomUUID(), workspaceId: fixture.workspaceId, projectId: fixture.projects.first, createdBy: actorId, revision: 1, currentVersion: 1, fathomRecordingId: '123456' });
      await isolated(async () => {
        await insert('deliveryKnowledgeSource', source());
        await rejects(() => insert('deliveryKnowledgeSource', source()), '23505');
        await rejects(() => insert('deliveryKnowledgeSource', { ...source(), fathomRecordingId: '0' }), '23514');
        await insert('deliveryKnowledgeSource', { ...source(), fathomRecordingId: null });
        await insert('deliveryKnowledgeSource', { ...source(), fathomRecordingId: null });
      });
      const retained = [
        ['QA report', () => insert('deliveryVideoQaReport', qa())],
        ['Fathom connection', () => insert('deliveryFathomConnection', { workspaceId: fixture.workspaceId, revision: 1, enabled: false, updatedBy: actorId })],
        ['Fathom source', () => insert('deliveryKnowledgeSource', source())],
        ['Fathom provenance', () => insert('deliveryKnowledgeVersion', { workspaceId: fixture.workspaceId, sourceId: randomUUID(), version: 1, title: 'FIXTURE', meetingDate: '2020-02-01', sourceUrl: '', transcript: '', knowledge: '', fathomProvenance: {}, createdBy: actorId })],
        ['QA pricing', () => insert('otogrowAiPrice', { workspaceId: fixture.workspaceId, modelId: 'FIXTURE', kind: 'VIDEO_QA', enabled: false, source: 'https://example.invalid', verifiedAt: '2020-02-01', pricing: {} })],
        ['QA spend', () => insert('otogrowAiSpend', { workspaceId: fixture.workspaceId, sourceKind: 'MEDIA', sourceRunId: randomUUID(), actorId, state: 'RELEASED', reservedMicroUsd: '0', price: { kind: 'VIDEO_QA' } })],
      ];
      for (const [label, seed] of retained)
        await isolated(async () => {
          await seed();
          await isolated(() => assert.rejects(() => migration.down(runner), /Cannot remove retained video QA or Fathom import history/, label));
          assert.equal(await schemaFingerprint(runner), fixtureSchema);
        });
    });
    await preserved();
    await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    await migration.up(runner);
    await assertSchema(runner);
    assert.equal(await schemaFingerprint(runner), installedSchema);
    await preserved();
    console.log(`PASS video QA/Fathom migration: ${tables.length} original tables preserved, two added tables/six indexes/four scoped FKs/two nullable provenance fields; exact source uniqueness, SQL constraints, six independent retained-history guards and up/down/re-up. Outer rollback only.`);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
