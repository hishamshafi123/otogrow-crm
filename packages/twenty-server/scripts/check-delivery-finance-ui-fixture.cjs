const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const FILE = '/tmp/otogrow-finance-ui-fixture.json';
const SENTINEL = 'Disposable finance acceptance';
const MONTH = '2099-12';
const tables = [
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
];
const snapshot = async (manager, workspaceId) => {
  const rows = {};
  for (const table of tables) {
    rows[table] = await manager.query(
      `SELECT * FROM core."${table}" WHERE "workspaceId"=$1 ORDER BY id`,
      [workspaceId],
    );
  }
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') {
      assert(!existsSync(FILE));
      const fixture = {
        workspaceId: '0a420537-0122-45c3-a2f5-18298b636227',
        projectId: randomUUID(),
        memberId: randomUUID(),
        userId: randomUUID(),
        month: MONTH,
      };
      await connectionSource.transaction(async (manager) => {
        const [workspace] = await manager.query(
          'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
          [fixture.workspaceId],
        );
        assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
        fixture.schema = workspace.databaseSchema;
        for (const [table, field] of [
          ['deliveryFinancePlan', 'name'],
          ['deliveryFinanceEntry', 'title'],
        ]) {
          const [existing] = await manager.query(
            `SELECT count(*)::int AS count FROM core."${table}" WHERE "workspaceId"=$1 AND "${field}" LIKE $2`,
            [fixture.workspaceId, SENTINEL + '%'],
          );
          assert.equal(existing.count, 0);
        }
        fixture.baseline = await snapshot(manager, fixture.workspaceId);
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [fixture.userId, `${fixture.userId}+finance@example.invalid`],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES ($1,$2,$3)',
          [fixture.memberId, fixture.workspaceId, fixture.userId],
        );
        await manager.query(
          `INSERT INTO "${fixture.schema}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Disposable finance','employee')`,
          [
            fixture.memberId,
            fixture.userId,
            `${fixture.userId}+finance@example.invalid`,
          ],
        );
        await manager.query(
          'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,$4)',
          [
            fixture.projectId,
            fixture.workspaceId,
            SENTINEL + ' client',
            JSON.stringify([fixture.memberId]),
          ],
        );
      });
      writeFileSync(FILE, JSON.stringify(fixture));
      console.log(
        'Created exact synthetic finance employee/project. Use service month ' +
          MONTH +
          ' and prefix ' +
          SENTINEL +
          '. No real salaries, cash or permissions changed.',
      );
    } else {
      assert.equal(process.argv[2], 'cleanup');
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
      await connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        const [project] = await manager.query(
          'SELECT * FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',
          [fixture.projectId, fixture.workspaceId],
        );
        assert.equal(project.name, SENTINEL + ' client');
        assert.deepEqual(project.memberIds, [fixture.memberId]);
        const [user] = await manager.query(
          'SELECT email FROM core."user" WHERE id=$1',
          [fixture.userId],
        );
        assert.equal(user.email, `${fixture.userId}+finance@example.invalid`);
        const plans = await manager.query(
          'SELECT * FROM core."deliveryFinancePlan" WHERE "workspaceId"=$1 AND name LIKE $2',
          [fixture.workspaceId, SENTINEL + '%'],
        );
        const entries = await manager.query(
          'SELECT * FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND title LIKE $2',
          [fixture.workspaceId, SENTINEL + '%'],
        );
        assert(plans.length <= 4 && entries.length <= 8);
        for (const plan of plans) {
          assert.equal(plan.startMonth, MONTH);
          assert(!plan.memberId || plan.memberId === fixture.memberId);
        }
        for (const entry of entries) {
          assert.equal(entry.month, MONTH);
          assert(
            !entry.planId || plans.some((plan) => plan.id === entry.planId),
          );
        }
        const ids = [...plans, ...entries].map((row) => row.id);
        const allocations = await manager.query(
          'SELECT * FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=ANY($2::uuid[])',
          [fixture.workspaceId, entries.map((entry) => entry.id)],
        );
        for (const allocation of allocations)
          assert(
            !allocation.projectId || allocation.projectId === fixture.projectId,
          );
        const [outside] = await manager.query(
          'SELECT count(*)::int AS count FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "projectId"=$2 AND NOT ("entryId"=ANY($3::uuid[]))',
          [
            fixture.workspaceId,
            fixture.projectId,
            entries.map((entry) => entry.id),
          ],
        );
        assert.equal(outside.count, 0);
        await manager.query(
          `DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType" IN ('finance-plan','finance-entry') AND "sourceId"=ANY($2::uuid[])`,
          [fixture.workspaceId, ids],
        );
        await manager.query(
          'DELETE FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
          [fixture.workspaceId, ids],
        );
        await manager.query(
          'DELETE FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=ANY($2::uuid[])',
          [fixture.workspaceId, entries.map((entry) => entry.id)],
        );
        await manager.query(
          'DELETE FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
          [fixture.workspaceId, entries.map((entry) => entry.id)],
        );
        await manager.query(
          'DELETE FROM core."deliveryFinancePlan" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
          [fixture.workspaceId, plans.map((plan) => plan.id)],
        );
        assert.equal(
          await snapshot(manager, fixture.workspaceId),
          fixture.baseline,
        );
        await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1', [
          fixture.projectId,
        ]);
        await manager.query(
          `DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=$1`,
          [fixture.memberId],
        );
        await manager.query(
          'DELETE FROM core."userWorkspace" WHERE id=$1 AND "workspaceId"=$2',
          [fixture.memberId, fixture.workspaceId],
        );
        await manager.query('DELETE FROM core."user" WHERE id=$1', [
          fixture.userId,
        ]);
      });
      unlinkSync(FILE);
      console.log(
        'Removed exact finance fixtures and history; existing finance baseline is unchanged.',
      );
    }
  } finally {
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
