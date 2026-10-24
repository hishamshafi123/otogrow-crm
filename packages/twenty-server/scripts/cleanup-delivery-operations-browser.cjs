const assert = require('node:assert/strict');
const fs = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { DeliveryOperationsEntity } = require('../dist/modules/delivery/entities/delivery-operations.entity');
(async () => {
  const path='/tmp/otogrow-phase4-browser.json';
  const fixture=JSON.parse(fs.readFileSync(path,'utf8'));
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
  await connectionSource.initialize();
  try { await connectionSource.transaction(async(manager)=>{
    const [project]=await manager.query('SELECT name FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',[fixture.projectId,fixture.workspaceId]);
    assert.equal(project.name,'Phase 4 fixture');
    const users=await manager.query('SELECT email FROM core."user" WHERE id=ANY($1::uuid[])',[fixture.userIds]);
    assert.equal(users.length,3); assert(users.every((item)=>item.email.endsWith('@example.invalid')));
    const tasks=await manager.query('DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2 RETURNING "taskId"',[fixture.workspaceId,fixture.projectId]);
    await manager.query(`DELETE FROM "${fixture.schema}".task WHERE id=ANY($1::uuid[])`,[tasks.map((item)=>item.taskId)]);
    await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1',[fixture.projectId]);
    await manager.query(`DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=ANY($1::uuid[])`,[fixture.memberIds]);
    await manager.query('DELETE FROM core."userWorkspace" WHERE id=ANY($1::uuid[])',[fixture.memberIds]);
    await manager.query('DELETE FROM core."user" WHERE id=ANY($1::uuid[])',[fixture.userIds]);
    await manager.getRepository(DeliveryOperationsEntity).delete({workspaceId:fixture.workspaceId});
    if(fixture.previousOperations) await manager.getRepository(DeliveryOperationsEntity).save(fixture.previousOperations);
  }); fs.unlinkSync(path); console.log('Removed recorded Phase 4 test data and restored prior operations settings.'); } finally { await connectionSource.destroy(); }
})().catch((error)=>{console.error(error);process.exitCode=1;});
