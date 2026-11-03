const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDelegatedGmailInboxFastInstanceCommand: Command,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793677084748-add-delegated-gmail-inbox');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  getRegisteredInstanceCommandMetadata,
} = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const TABLES = [
  'deliveryInboxBinding',
  'deliveryInboxConsent',
  'deliveryInboxReply',
];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
async function main() {
  assert.equal(process.argv.length, 2);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter((candidate) => candidate === Command).length,
    1,
  );
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Command), {
    version: '2.34.0',
    timestamp: 1793677084748,
    type: 'fast',
  });
  connectionSource.setOptions({ logging: false });
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='60s'");
    const tables = await userTables(runner);
    assert(
      !tables.some(
        (table) => table.schema === 'core' && TABLES.includes(table.name),
      ),
      'Run before installation; never remove retained inbox data.',
    );
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."otogrowActivityEvent" WHERE left(action,6)=\'INBOX_\'',
        )
      )[0].count,
      0,
      'Existing inbox audit correctly prevents destructive down; preserve it.',
    );
    const beforeData = await dataFingerprint(runner),
      beforeSchema = await schemaFingerprint(runner),
      protectedSchema = await schemaFingerprint(runner, false, [], '', TABLES);
    const migration = new Command();
    let sequence = 0;
    const isolated = async (operation) => {
      const name = `inbox_schema_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const reject = (operation, code) =>
      isolated(() => assert.rejects(operation, (error) => error.code === code));
    const insert = (table, values) => {
      const fields = Object.keys(values);
      return runner.query(
        `INSERT INTO core.${quote(table)} (${fields.map(quote).join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')})`,
        Object.values(values),
      );
    };
    const retained = () =>
      isolated(() =>
        assert.rejects(
          () => migration.down(runner),
          /Cannot remove retained Gmail inbox history/,
        ),
      );
    const preserved = async () => {
      assert.deepEqual(await dataFingerprint(runner, TABLES), beforeData);
      assert.equal(
        await schemaFingerprint(runner, false, [], '', TABLES),
        protectedSchema,
      );
    };
    const check = async () => {
      const indexes = await runner.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1) AND indexname NOT LIKE 'PK_%'",
        [TABLES],
      );
      assert.equal(indexes.length, 10);
      assert.equal(
        indexes.filter((row) => row.indexdef.startsWith('CREATE UNIQUE'))
          .length,
        8,
      );
      assert.equal(
        indexes.filter((row) => row.indexdef.includes(' WHERE ')).length,
        2,
      );
      const keys = await runner.query(
        "SELECT relation.relname,pg_get_constraintdef(constraint_row.oid,true) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1) AND constraint_row.contype='f'",
        [TABLES],
      );
      assert.equal(keys.length, 6);
      assert.equal(
        keys.filter((row) => row.definition.includes('ON DELETE RESTRICT'))
          .length,
        3,
      );
    };
    await migration.up(runner);
    await check();
    await preserved();
    const installed = await schemaFingerprint(runner);
    await isolated(async () => {
      const fixture = await createFixture(runner.manager, 'inbox_schema');
      const binding = (fields = {}) => ({
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        conversationId: randomUUID(),
        accountId: randomUUID(),
        channelId: randomUUID(),
        threadExternalId: 'synthetic',
        ownerMemberId: fixture.people.admin.memberId,
        ownerUserWorkspaceId: fixture.people.admin.userWorkspaceId,
        projectId: fixture.projects.first,
        revision: 1,
        consent: { grants: [] },
        ...fields,
      });
      const first = binding();
      await insert('deliveryInboxBinding', first);
      await retained();
      for (const consent of [
        {},
        null,
        [],
        { grants: null },
        { grants: {} },
        { grants: Array.from({ length: 101 }, () => ({})) },
      ])
        await reject(
          () => insert('deliveryInboxBinding', binding({ consent })),
          consent === null ? '23502' : '23514',
        );
      await reject(
        () => insert('deliveryInboxBinding', binding({ revision: 0 })),
        '23514',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxBinding',
            binding({ projectId: fixture.projects.foreign }),
          ),
        '23503',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxBinding',
            binding({ conversationId: first.conversationId }),
          ),
        '23505',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxBinding',
            binding({ accountId: first.accountId, channelId: first.channelId }),
          ),
        '23505',
      );
      const consent = (fields = {}) => ({
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        bindingId: first.id,
        revision: 1,
        inputHash: 'a'.repeat(64),
        snapshot: { grants: [] },
        receipt: {},
        ...fields,
      });
      const receipt = consent();
      await insert('deliveryInboxConsent', receipt);
      await retained();
      await reject(() => insert('deliveryInboxConsent', consent()), '23505');
      await reject(
        () =>
          insert(
            'deliveryInboxConsent',
            consent({ workspaceId: fixture.foreignWorkspaceId }),
          ),
        '23503',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxConsent',
            consent({ revision: 2, inputHash: 'bad' }),
          ),
        '23514',
      );
      const reply = (fields = {}) => ({
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        requestId: randomUUID(),
        bindingId: first.id,
        conversationId: first.conversationId,
        actorId: fixture.people.writer.memberId,
        userWorkspaceId: fixture.people.writer.userWorkspaceId,
        inputHash: 'b'.repeat(64),
        input: {},
        body: { text: 'Synthetic reviewed reply' },
        bodyFingerprint: 'c'.repeat(64),
        status: 'DRAFT',
        headerMessageId: '<synthetic@example.invalid>',
        preparationReceipt: {},
        ...fields,
      });
      const draft = reply();
      await insert('deliveryInboxReply', draft);
      await retained();
      for (const body of [
        {},
        { text: null },
        { text: 12 },
        { text: '' },
        { text: 'x'.repeat(12001) },
      ])
        await reject(
          () => insert('deliveryInboxReply', reply({ body })),
          '23514',
        );
      await reject(
        () => insert('deliveryInboxReply', reply({ status: 'UNKNOWN' })),
        '23514',
      );
      await reject(
        () => insert('deliveryInboxReply', reply({ body: null })),
        '23514',
      );
      await reject(
        () => insert('deliveryInboxReply', reply({ status: 'QUEUED' })),
        '23514',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxReply',
            reply({
              sendRequestId: randomUUID(),
              sendReceipt: {},
              sendInputHash: null,
            }),
          ),
        '23514',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxReply',
            reply({ cancelRequestId: randomUUID() }),
          ),
        '23514',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxReply',
            reply({ workspaceId: fixture.foreignWorkspaceId }),
          ),
        '23503',
      );
      await reject(
        () =>
          insert('deliveryInboxReply', reply({ requestId: draft.requestId })),
        '23505',
      );
      const sent = reply({
        status: 'QUEUED',
        sendRequestId: randomUUID(),
        sendReceipt: {},
        sendInputHash: 'd'.repeat(64),
        cancelRequestId: randomUUID(),
        cancelReceipt: {},
      });
      await insert('deliveryInboxReply', sent);
      await reject(
        () =>
          insert(
            'deliveryInboxReply',
            reply({
              sendRequestId: sent.sendRequestId,
              sendReceipt: {},
              sendInputHash: 'd'.repeat(64),
            }),
          ),
        '23505',
      );
      await reject(
        () =>
          insert(
            'deliveryInboxReply',
            reply({ cancelRequestId: sent.cancelRequestId, cancelReceipt: {} }),
          ),
        '23505',
      );
      for (const only of ['deliveryInboxConsent', 'deliveryInboxReply'])
        await isolated(async () => {
          const other =
            only === 'deliveryInboxConsent'
              ? 'deliveryInboxReply'
              : 'deliveryInboxConsent';
          await runner.query(
            `DELETE FROM core.${quote(other)} WHERE "workspaceId"=$1`,
            [fixture.workspaceId],
          );
          const keys = await runner.query(
            'SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND confrelid=\'core."deliveryInboxBinding"\'::regclass',
            [`core."${only}"`],
          );
          assert.equal(keys.length, 1);
          await runner.query(
            `ALTER TABLE core.${quote(only)} DROP CONSTRAINT ${quote(keys[0].conname)}`,
          );
          await runner.query(
            'DELETE FROM core."deliveryInboxBinding" WHERE "workspaceId"=$1',
            [fixture.workspaceId],
          );
          await retained();
        });
      await isolated(async () => {
        for (const table of [
          'deliveryInboxReply',
          'deliveryInboxConsent',
          'deliveryInboxBinding',
        ])
          await runner.query(
            `DELETE FROM core.${quote(table)} WHERE "workspaceId"=$1`,
            [fixture.workspaceId],
          );
        await insert('otogrowActivityEvent', {
          id: randomUUID(),
          workspaceId: fixture.workspaceId,
          occurredAt: new Date(),
          actorId: fixture.people.admin.memberId,
          actorName: 'Synthetic owner',
          actorType: 'HUMAN',
          category: 'BUSINESS',
          action: 'INBOX_THREAD_CONSENTED',
          outcome: 'RECORDED',
          summary: 'Synthetic retained inbox evidence',
          sourceType: 'conversation',
          sourceId: first.conversationId,
          changes: JSON.stringify([]),
        });
        await retained();
      });
    });
    await preserved();
    await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), beforeSchema);
    await migration.up(runner);
    await check();
    assert.equal(await schemaFingerprint(runner), installed);
    await preserved();
    console.log(
      `PASS Gmail inbox migration: ${tables.length} original tables preserved; 3 tables/10 indexes/6 scoped FKs; missing JSON/null/body/hash/receipt/cross-workspace guards and 4 independent retention sources; up/down/re-up under rollback only.`,
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
