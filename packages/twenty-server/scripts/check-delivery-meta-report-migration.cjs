const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddDeliveryMetaReportsFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792942106514-add-delivery-meta-reports');
const { migrateLegacyMetaReports } = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect(); await runner.startTransaction();
    const migration = new AddDeliveryMetaReportsFastInstanceCommand();
    const [{ name }] = await runner.query('SELECT to_regclass($1) AS name', ['core."deliveryMetaReport"']);
    assert.equal(name, null, 'Run before applying this migration.');
    await migration.up(runner);
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const report = { id: randomUUID(), accountId: '9999912345', date: '2026-10-01', projectId: null, managerId: null, marketerId: null,
      currency: 'USD', timezone: 'Asia/Qatar', fetchedAt: '2026-10-02T03:00:00.000Z', account: null, ads: [], status: 'APPROVED', reviewedBy: randomUUID(), reviewedAt: '2026-10-02T04:00:00.000Z', note: 'Preserve exact decision', taskId: randomUUID() };
    const state = { connections: [], reports: [report], workerSeenAt: null };
    await migrateLegacyMetaReports(runner.manager, workspace.id, state);
    const [saved] = await runner.query('SELECT report FROM core."deliveryMetaReport" WHERE id=$1', [report.id]);
    assert.deepEqual(saved.report, report); assert.deepEqual(state.reports, []);
    const conflicting = { connections: [], reports: [{ ...report, note: 'Different' }], workerSeenAt: null };
    await assert.rejects(migrateLegacyMetaReports(runner.manager, workspace.id, conflicting), /differs/);
    assert.equal(conflicting.reports.length, 1);
    await assert.rejects(migration.down(runner), /Restore retained/);
    await runner.query('DELETE FROM core."deliveryMetaReport" WHERE id=$1', [report.id]);
    await migration.down(runner);
    assert.equal((await runner.query('SELECT to_regclass($1) AS name', ['core."deliveryMetaReport"']))[0].name, null);
    console.log('PASS: additive report schema, exact legacy copy, conflict preservation and guarded down. Rolled back.');
  } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); await connectionSource.destroy(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
