const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { insertMetaReport } = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
const file = '/tmp/otogrow-meta-archive-ui-fixture.json';
const workspaceId = '0a420537-0122-45c3-a2f5-18298b636227';
const memberId = 'cbc4136b-5631-437f-9477-4b8d21456a1e';
const accountId = '9999900261026';
const note = 'Disposable archive acceptance — synthetic figures, not a real campaign.';
async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  assert(['create', 'cleanup'].includes(process.argv[2]));
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') {
      const ids = Array.from({ length: 24 }, () => randomUUID());
      fs.writeFileSync(file, JSON.stringify({ workspaceId, accountId, ids, note }), { flag: 'wx', mode: 0o600 });
      await connectionSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`delivery:${workspaceId}`]);
        const [workspace] = await manager.query('SELECT "databaseSchema" FROM core.workspace WHERE id=$1', [workspaceId]);
        assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
        assert.equal((await manager.query(`SELECT id FROM "${workspace.databaseSchema}"."workspaceMember" WHERE id=$1 AND "deletedAt" IS NULL`, [memberId])).length, 1);
        for (let index = 0; index < ids.length; index++) {
          const date = `2026-09-${String(index + 1).padStart(2, '0')}`;
          const insight = { date_start: date, date_stop: date, account_id: accountId, spend: '12.50', impressions: '100', clicks: '8', actions: [{ action_type: 'lead', value: '3' }], action_values: [] };
          const pending = index === ids.length - 2;
          await insertMetaReport(manager, workspaceId, { id: ids[index], accountId, projectId: null, managerId: memberId, marketerId: null,
            date, currency: 'USD', timezone: 'Asia/Qatar', fetchedAt: `${date}T03:00:00.000Z`, account: insight,
            ads: index === ids.length - 1 ? Array.from({ length: 51 }, (_, ad) => ({ ...insight, ad_id: String(ad), ad_name: `Disposable creative ${ad + 1}`, campaign_name: 'Synthetic archive acceptance' })) : [],
            status: pending ? 'REVIEW' : 'APPROVED', reviewedBy: pending ? null : memberId, reviewedAt: pending ? null : `${date}T04:00:00.000Z`, note, taskId: null });
        }
      });
      console.log('Created 24 disposable report snapshots for account 9999900261026. No connection or provider request.');
    } else {
      const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(fixture.workspaceId, workspaceId); assert.equal(fixture.accountId, accountId); assert.equal(fixture.note, note);
      await connectionSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`delivery:${workspaceId}`]);
        const records = await manager.query('SELECT report FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])', [workspaceId, fixture.ids]);
        assert(records.every(({ report }) => report.accountId === accountId && report.note === note));
        await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'meta-report\' AND "sourceId"=ANY($2::uuid[])', [workspaceId, fixture.ids]);
        await manager.query('DELETE FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) AND "accountId"=$3', [workspaceId, fixture.ids, accountId]);
        assert.equal((await manager.query('SELECT count(*)::int AS count FROM core."deliveryMetaReport" WHERE id=ANY($1::uuid[])', [fixture.ids]))[0].count, 0);
      });
      fs.unlinkSync(file); console.log('Removed exact disposable report fixtures and their test-only archive events.');
    }
  } finally { await connectionSource.destroy(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
