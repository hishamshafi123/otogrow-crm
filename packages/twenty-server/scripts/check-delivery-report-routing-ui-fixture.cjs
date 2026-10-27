const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const FILE = '/tmp/otogrow-report-routing-fixture.json';
const NAME = 'Disposable client reporting acceptance';
(async () => {
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') {
      assert(!existsSync(FILE));
      const fixture = { workspaceId:'0a420537-0122-45c3-a2f5-18298b636227', companyId:randomUUID(), projectId:randomUUID(), memberId:randomUUID(), userId:randomUUID() };
      await connectionSource.transaction(async manager => {
        const [workspace] = await manager.query('SELECT "databaseSchema" FROM core.workspace WHERE id=$1',[fixture.workspaceId]);
        assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)); fixture.schema=workspace.databaseSchema;
        await manager.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)',[fixture.userId,`${fixture.userId}@example.invalid`]);
        await manager.query('INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES ($1,$2,$3)',[fixture.memberId,fixture.workspaceId,fixture.userId]);
        await manager.query(`INSERT INTO "${fixture.schema}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Reporting test','marketer')`,[fixture.memberId,fixture.userId,`${fixture.userId}@example.invalid`]);
        await manager.query(`INSERT INTO "${fixture.schema}".company (id,name) VALUES ($1,$2)`,[fixture.companyId,NAME]);
        await manager.query('INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES ($1,$2,$3,$4,$5)',[fixture.projectId,fixture.workspaceId,NAME,fixture.companyId,JSON.stringify([fixture.memberId])]);
      });
      writeFileSync(FILE,JSON.stringify(fixture)); console.log('Created exact synthetic company, project and marketer. No real staff or roles changed.');
    } else {
      assert.equal(process.argv[2],'cleanup'); const fixture=JSON.parse(readFileSync(FILE,'utf8')); assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
      await connectionSource.transaction(async manager=>{
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`delivery:${fixture.workspaceId}`]);
        const [project]=await manager.query('SELECT name FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);assert.equal(project.name,NAME);
        const [operations]=await manager.query('SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',[fixture.workspaceId]);
        const engagements=(operations?.state.clients?.engagements??[]).filter(row=>row.projectId===fixture.projectId);
        assert(engagements.every(row=>row.name===NAME));const ids=engagements.map(row=>row.id);
        assert(!(operations?.state.clients?.links??[]).some(row=>ids.includes(row.engagementId)));
        assert(!(operations?.state.clients?.shares??[]).some(row=>ids.includes(row.engagementId)));
        assert(!(operations?.state.metaReporting?.connections??[]).some(row=>ids.includes(row.engagementId)),'Unexpected saved reporting connection; stop cleanup');
        assert.equal((await manager.query('SELECT 1 FROM core."deliveryTask" WHERE "projectId"=$1',[fixture.projectId])).length,0);
        if(operations?.state.clients) {
          operations.state.clients.engagements=operations.state.clients.engagements.filter(row=>!ids.includes(row.id));
          operations.state.clients.audit=operations.state.clients.audit.filter(row=>!ids.includes(row.targetId));
          await manager.query('UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',[operations.id,operations.state]);
        }
        await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',[fixture.workspaceId,fixture.projectId]);
        await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);
        await manager.query(`DELETE FROM "${fixture.schema}".company WHERE id=$1 AND name=$2`,[fixture.companyId,NAME]);
        await manager.query(`DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=$1 AND "userId"=$2`,[fixture.memberId,fixture.userId]);
        await manager.query('DELETE FROM core."userWorkspace" WHERE id=$1 AND "userId"=$2',[fixture.memberId,fixture.userId]);
        await manager.query('DELETE FROM core."user" WHERE id=$1 AND email=$2',[fixture.userId,`${fixture.userId}@example.invalid`]);
      });unlinkSync(FILE);console.log('Removed exact synthetic reporting fixture and activity.');
    }
  } finally { await connectionSource.destroy(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
