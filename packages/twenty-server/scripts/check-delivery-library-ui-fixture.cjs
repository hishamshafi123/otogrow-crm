const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {existsSync,readFileSync,writeFileSync,unlinkSync} = require('node:fs');
const {connectionSource} = require('../dist/database/typeorm/core/core.datasource');
const FILE='/tmp/otogrow-library-fixture.json',NAME='Disposable brand-library acceptance';
(async()=>{
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname)); await connectionSource.initialize();
  try{
    if(process.argv[2]==='create'){
      assert(!existsSync(FILE));const fixture={workspaceId:'0a420537-0122-45c3-a2f5-18298b636227',projectId:randomUUID()};
      await connectionSource.query('INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,\'[]\')',[fixture.projectId,fixture.workspaceId,NAME]);
      writeFileSync(FILE,JSON.stringify(fixture));console.log('Created exact synthetic brand-library project. No staff or permissions changed.');
    }else{
      assert.equal(process.argv[2],'cleanup');const fixture=JSON.parse(readFileSync(FILE,'utf8'));
      await connectionSource.transaction(async manager=>{
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`delivery:${fixture.workspaceId}`]);
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`knowledge:${fixture.workspaceId}:${fixture.projectId}`]);
        const [project]=await manager.query('SELECT name,"memberIds" FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);assert.equal(project.name,NAME);assert.deepEqual(project.memberIds,[]);
        assert.equal((await manager.query('SELECT 1 FROM core."deliveryTask" WHERE "projectId"=$1',[fixture.projectId])).length,0);
        const versions=await manager.query('SELECT v.title,v.knowledge FROM core."deliveryKnowledgeVersion" v JOIN core."deliveryKnowledgeSource" s ON s.id=v."sourceId" AND s."workspaceId"=v."workspaceId" WHERE s."projectId"=$1 AND s."workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);assert(versions.every(row=>row.title.startsWith('Disposable ')&&row.knowledge.startsWith('Fixture:')),'Unexpected knowledge content; stop cleanup');
        await manager.query('DELETE FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1 AND "sourceId" IN (SELECT id FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=$2)',[fixture.workspaceId,fixture.projectId]);
        await manager.query('DELETE FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=$2',[fixture.workspaceId,fixture.projectId]);
        await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',[fixture.workspaceId,fixture.projectId]);
        await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);
      });unlinkSync(FILE);console.log('Removed exact synthetic library project, source versions and activity.');
    }
  }finally{await connectionSource.destroy();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
