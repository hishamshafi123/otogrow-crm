const assert = require('node:assert/strict');
const { readFileSync, unlinkSync } = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
(async () => {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  const path = '/tmp/otogrow-phase3-browser.json';
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
  await connectionSource.initialize();
  try {
    await connectionSource.transaction(async (manager) => {
      const projects = await manager.query('SELECT name FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2', [fixture.projectId, fixture.workspaceId]);
      assert.equal(projects[0]?.name, 'Agent verification fixture');
      const users = await manager.query('SELECT email FROM core."user" WHERE id=ANY($1::uuid[])', [fixture.userIds]);
      assert.equal(users.length, 3);
      assert(users.every((user) => user.email.endsWith('@example.invalid')));
      await manager.query('DELETE FROM core."deliveryTask" WHERE "taskId"=$1 AND "workspaceId"=$2 AND "projectId"=$3', [fixture.taskId, fixture.workspaceId, fixture.projectId]);
      await manager.query(`DELETE FROM "${fixture.schema}".task WHERE id=$1`, [fixture.taskId]);
      await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2', [fixture.projectId, fixture.workspaceId]);
      await manager.query(`DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=ANY($1::uuid[])`, [fixture.memberIds]);
      await manager.query('DELETE FROM core."userWorkspace" WHERE id=ANY($1::uuid[]) AND "workspaceId"=$2', [fixture.memberIds, fixture.workspaceId]);
      await manager.query('DELETE FROM core."user" WHERE id=ANY($1::uuid[])', [fixture.userIds]);
    });
    unlinkSync(path);
    console.log('Removed only the recorded synthetic browser fixture.');
  } finally { await connectionSource.destroy(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
