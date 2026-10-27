const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const FILE = '/tmp/otogrow-project-conflict-fixture.json';
const SENTINEL = 'Disposable project conflict acceptance';
(async () => {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') {
      assert(!existsSync(FILE), 'Existing fixture must be cleaned first');
      const workspaceId = '0a420537-0122-45c3-a2f5-18298b636227';
      const projectId = randomUUID();
      await connectionSource.query('INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,\'[]\')', [projectId,workspaceId,SENTINEL]);
      writeFileSync(FILE,JSON.stringify({workspaceId,projectId}));
      console.log('Created exact disposable project fixture with no members or client.');
    } else {
      assert.equal(process.argv[2], 'cleanup');
      const fixture=JSON.parse(readFileSync(FILE,'utf8'));
      await connectionSource.transaction(async manager => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`delivery:${fixture.workspaceId}`]);
        const [project]=await manager.query('SELECT * FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);
        assert(project.name.startsWith(SENTINEL) && project.companyId===null && project.memberIds.length===0 && project.revision<10);
        assert.equal((await manager.query('SELECT id FROM core."deliveryTask" WHERE "projectId"=$1',[fixture.projectId])).length,0);
        await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',[fixture.workspaceId,fixture.projectId]);
        await manager.query('DELETE FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=$2',[fixture.workspaceId,fixture.projectId]);
      });
      unlinkSync(FILE);
      console.log('Removed exact disposable project and its test events.');
    }
  } finally { await connectionSource.destroy(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
