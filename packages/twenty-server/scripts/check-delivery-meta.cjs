const {DeliveryOperationsService}=require('../dist/modules/delivery/operations/delivery-operations.service');
const {DeliveryCreativeService}=require('../dist/modules/delivery/creative/delivery-creative.service');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DeliveryMetaService}=require('../dist/modules/delivery/advertising/delivery-meta.service');
const {MetaReportingError}=require('../dist/modules/delivery/advertising/delivery-meta.adapter');
const {connectionSource}=require('../dist/database/typeorm/core/core.datasource');
const {DeliveryService}=require('../dist/modules/delivery/delivery.service');
const {DeliveryOperationsEntity}=require('../dist/modules/delivery/entities/delivery-operations.entity');
(async()=>{
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();const runner=connectionSource.createQueryRunner();await runner.connect();await runner.startTransaction();
  try{
    const [workspace]=await runner.query('SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL LIMIT 1');assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));const schema=`"${workspace.databaseSchema}"`;
    const admin=randomUUID(),manager=randomUUID(),employee=randomUUID(),outsider=randomUUID();
    for(const member of [admin,manager,employee,outsider]){const user=randomUUID();await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)',[user,`${user}@example.invalid`]);await runner.query('INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',[member,user,workspace.id]);await runner.query(`INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName") VALUES ($1,$2,$3,'Business fixture')`,[member,user,`${user}@example.invalid`]);}
    const scoped={manager:runner.manager,getRepository:(entity)=>runner.manager.getRepository(entity),query:(...args)=>runner.query(...args),transaction:(callback)=>callback(runner.manager)};
    const delivery=new DeliveryService(scoped,{userHasWorkspaceSettingPermission:async({userWorkspaceId})=>[admin,manager].includes(userWorkspaceId)});
    await delivery.command(workspace,admin,admin,{action:'member',workspaceMemberId:manager,access:'MANAGER',roleLabel:'Project manager'});
    const project=(await delivery.command(workspace,admin,admin,{action:'project',name:'Business fixture',companyId:null,memberIds:[employee]})).projects.find((item)=>item.name==='Business fixture');
    const create=async(actor,record)=>{const result=await command(actor,{action:'save',record:{revision:0,projectId:project.id,...record}});return result.records.find((item)=>item.title===record.title);};
    let providerCalls=0, hook=null, fail=false;
    const adapter={account:async()=>({id:'act_1657332765534462',name:'Fixture',currency:'USD',timezone_name:'Asia/Qatar',account_status:1}),insights:async(accountId,token,date,level)=>{providerCalls++;assert.equal(token,'synthetic-reporting-token');if(fail)throw new MetaReportingError('AUTH');if(hook)await hook();return level==='account'?[{account_id:accountId,date_start:date,date_stop:date,spend:'12.34',impressions:'100',clicks:'5',actions:[{action_type:'lead',value:'2'}],action_values:[]}]:[];}};
    const encryption={encryptVersioned:(token)=>'encrypted:'+Buffer.from(token).toString('base64'),decryptVersionedOrThrow:(token)=>Buffer.from(token.slice(10),'base64').toString()};
    const reporting=new DeliveryMetaService(scoped,delivery,encryption,adapter);
    const operations=new DeliveryOperationsService(scoped,delivery,new DeliveryCreativeService(scoped,delivery,{}),{findByWorkspaceId:async()=>null},{get:()=>null});
    const configuration={accountId:'1657332765534462',revision:0,token:'synthetic-reporting-token',projectId:project.id,managerId:manager,marketerId:employee,time:'06:00',enabled:true};
    await assert.rejects(reporting.command(workspace,employee,employee,{action:'connect',configuration}));
    const connected=await reporting.command(workspace,admin,admin,{action:'connect',configuration});
    assert(!JSON.stringify(connected).includes('synthetic-reporting-token'));assert(!JSON.stringify(connected).includes('ciphertext'));
    await reporting.sync(workspace,configuration.accountId,true,new Date('2026-10-25T02:59:00Z'));assert.equal(providerCalls,0);
    await reporting.sync(workspace,configuration.accountId,true,new Date('2026-10-25T03:00:00Z'));assert.equal(providerCalls,2);
    await reporting.sync(workspace,configuration.accountId,true,new Date('2026-10-25T03:05:00Z'));assert.equal(providerCalls,2);
    let reports=(await reporting.snapshot(workspace,admin,admin)).reports;assert.equal(reports.length,1);assert.equal(reports[0].date,'2026-10-24');
    assert.equal((await reporting.snapshot(workspace,employee,employee)).reports.length,0);
    const managerNotices=(await operations.snapshot(workspace,manager,manager)).notices.filter(item=>item.taskId===`meta-report:${reports[0].id}`);
    assert.equal(managerNotices.length,1);
    assert.equal((await operations.snapshot(workspace,employee,employee)).notices.filter(item=>item.taskId===`meta-report:${reports[0].id}`).length,0);
    await operations.command(workspace,manager,manager,{action:'acknowledge',id:managerNotices[0].id});

    await assert.rejects(reporting.command(workspace,employee,employee,{action:'review',id:reports[0].id,status:'APPROVED',note:'Self review'}));
    await reporting.command(workspace,manager,manager,{action:'review',id:reports[0].id,status:'APPROVED',note:'Review campaign targeting'});
    assert.equal((await reporting.snapshot(workspace,employee,employee)).reports.length,1);
    await assert.rejects(reporting.command(workspace,manager,manager,{action:'review',id:reports[0].id,status:'APPROVED',note:'Duplicate'}));
    await reporting.sync(workspace,configuration.accountId,false,new Date('2026-10-25T04:00:00Z'));
    reports=(await reporting.snapshot(workspace,admin,admin)).reports;assert.equal(reports.length,1);assert(reports[0].taskId);
    fail=true;await reporting.sync(workspace,configuration.accountId,true,new Date('2026-10-26T03:00:00Z'));
    assert.equal((await reporting.snapshot(workspace,admin,admin)).connections[0].enabled,false);
    fail=false;hook=async()=>{hook=null;await reporting.command(workspace,admin,admin,{action:'disconnect',accountId:configuration.accountId,revision:1});};
    await assert.rejects(reporting.sync(workspace,configuration.accountId,false,new Date('2026-10-26T04:00:00Z')));
    assert.equal((await reporting.snapshot(workspace,admin,admin)).reports.length,1);
    console.log('PASS: Meta reporting permissions, redacted snapshots, Qatar 06:00 schedule, duplicate prevention, manager approval/assignment, auth-failure disable and in-flight disconnect. Rolled back; mock provider only.');
  }finally{await runner.rollbackTransaction();await runner.release();await connectionSource.destroy();}
})().catch(error=>{console.error(error);process.exitCode=1;});
