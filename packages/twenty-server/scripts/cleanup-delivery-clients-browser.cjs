const fs=require('node:fs');
const assert=require('node:assert/strict');
const {connectionSource}=require('../dist/database/typeorm/core/core.datasource');
const {DeliveryOperationsEntity}=require('../dist/modules/delivery/entities/delivery-operations.entity');
(async()=>{
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  const fixture=JSON.parse(fs.readFileSync('/tmp/otogrow-phase5-browser.json','utf8'));
  assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
  await connectionSource.initialize();
  try { await connectionSource.transaction(async(manager)=>{
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`delivery:${fixture.workspaceId}`]);
    const record=await manager.getRepository(DeliveryOperationsEntity).findOneBy({workspaceId:fixture.workspaceId});
    if(record?.state.clients){
      const state=record.state.clients;
      const linkIds=state.links.filter((item)=>fixture.engagementIds.includes(item.engagementId)).map((item)=>item.id);
      const shareIds=state.shares.filter((item)=>fixture.engagementIds.includes(item.engagementId)).map((item)=>item.id);
      state.engagements=state.engagements.filter((item)=>!fixture.engagementIds.includes(item.id));
      state.shares=state.shares.filter((item)=>!fixture.engagementIds.includes(item.engagementId));
      state.links=state.links.filter((item)=>!fixture.engagementIds.includes(item.engagementId));
      state.audit=state.audit.filter((item)=>![...fixture.engagementIds,...linkIds,...shareIds].includes(item.targetId));
      record.state.notices=record.state.notices.filter((item)=>item.taskId!==fixture.taskId);
      record.state.fulfilments=record.state.fulfilments.filter((item)=>item.taskId!==fixture.taskId);
      await manager.getRepository(DeliveryOperationsEntity).save(record);
    }
    await manager.query('DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',[fixture.workspaceId,fixture.taskId]);
    await manager.query(`DELETE FROM "${fixture.schema}".task WHERE id=$1`,[fixture.taskId]);
    await manager.query('DELETE FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',[fixture.workspaceId,fixture.projectIds]);
    await manager.query(`DELETE FROM "${fixture.schema}".company WHERE id=ANY($1::uuid[])`,[fixture.companyIds]);
    await manager.query(`DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=ANY($1::uuid[])`,[fixture.memberIds]);
    await manager.query('DELETE FROM core."userWorkspace" WHERE id=ANY($1::uuid[])',[fixture.memberIds]);
    await manager.query('DELETE FROM core."user" WHERE id=ANY($1::uuid[])',[fixture.userIds]);
  });fs.unlinkSync('/tmp/otogrow-phase5-browser.json');console.log('Removed exact Phase 5 browser fixture.'); }finally{await connectionSource.destroy();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
