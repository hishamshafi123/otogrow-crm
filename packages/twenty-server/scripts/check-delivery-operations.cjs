const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const axios = require('axios');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { DeliveryService } = require('../dist/modules/delivery/delivery.service');
const { DeliveryCreativeService } = require('../dist/modules/delivery/creative/delivery-creative.service');
const { DeliveryOperationsService } = require('../dist/modules/delivery/operations/delivery-operations.service');
const { DeliveryOperationsEntity } = require('../dist/modules/delivery/entities/delivery-operations.entity');
const { DeliveryTaskEntity } = require('../dist/modules/delivery/entities/delivery-task.entity');
(async () => {
  assert(['localhost','127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect(); await runner.startTransaction();
  const originalPost = axios.post;
  const OriginalDate = Date;
  // Task assignment timestamps and scheduler assertions must use the same fixture clock.
  global.Date = class extends OriginalDate {
    constructor(...values) { super(...(values.length ? values : ['2026-10-24T10:00:00Z'])); }
    static now() { return OriginalDate.parse('2026-10-24T10:00:00Z'); }
  };
  try {
    const [workspace] = await runner.query(process.argv.includes('--browser-fixture') ? `SELECT w.* FROM core.workspace w JOIN core."userWorkspace" uw ON uw."workspaceId"=w.id JOIN core."user" u ON u.id=uw."userId" WHERE u.email='tim@apple.dev' LIMIT 1` : 'SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL LIMIT 1');
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(), editor = randomUUID(), outsider = randomUUID();
    for (const member of [admin,editor,outsider]) {
      const user = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [user, `${user}@example.invalid`]);
      await runner.query('INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)', [member,user,workspace.id]);
      await runner.query(`INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Operations','fixture')`, [member,user,`${user}@example.invalid`]);
    }
    const scoped = { manager: runner.manager, getRepository: (entity) => runner.manager.getRepository(entity), query: (...args) => runner.query(...args), transaction: (callback) => callback(runner.manager) };
    const delivery = new DeliveryService(scoped, { userHasWorkspaceSettingPermission: async ({userWorkspaceId}) => userWorkspaceId === admin });
    const creative = new DeliveryCreativeService(scoped, delivery, {});
    const operations = new DeliveryOperationsService(scoped, delivery, creative, { findByWorkspaceId: async () => ({ isActive: true, botUsername: 'fixture_bot' }), decryptBotToken: () => 'fixture-token' }, { get: () => 'http://localhost:3001' });
    let sent = 0; let fail = false;
    axios.post = async () => { sent++; if (fail) throw new Error('ambiguous transport failure'); return { data: { ok: true } }; };
    const now = new Date('2026-10-24T10:00:00Z');
    const later = (minutes) => new Date(now.getTime() + minutes * 60000);
    const command = (actor, input, time = now) => operations.command(workspace, actor, actor, input, time);
    const taskCommand = (actor, input) => delivery.command(workspace, actor, actor, input);
    const read = () => runner.manager.getRepository(DeliveryOperationsEntity).findOneBy({workspaceId:workspace.id});
    // Keep test changes isolated even when the workspace already has saved settings.
    const previousOperations = await read();
    await runner.manager.getRepository(DeliveryOperationsEntity).delete({workspaceId:workspace.id});
    let snapshot = await taskCommand(admin, {action:'project', name:'Phase 4 fixture', companyId:null, memberIds:[editor]});
    const project = snapshot.projects.find((item) => item.name === 'Phase 4 fixture');
    const fields = {title:'Recurring SEO fixture', brief:'Submit backlink evidence', service:'SEO', priority:'NORMAL', scheduledDate:null,dueAt:null,assigneeId:editor,reviewerId:admin,checklist:[],evidence:[]};
    await assert.rejects(command(editor,{action:'settings',enabled:true,telegramEnabled:true,timezone:'UTC',founderId:admin}));
    await command(admin,{action:'settings',enabled:true,telegramEnabled:true,timezone:'UTC',founderId:admin});
    await command(admin,{action:'template',template:{projectId:project.id,fields,frequency:'DAILY',weekdays:[1],monthDay:31,time:'09:00',startDate:'2026-10-20',endDate:null,paused:false,dueHours:24}});
    await operations.tickWorkspace(workspace,now);
    let record = await read();
    const template = record.state.templates[0];
    assert.equal(template.skipped,4);
    const taskId = template.lastTaskId; assert(taskId);
    if (process.argv.includes('--browser-fixture')) {
      const users = await runner.query('SELECT "userId" FROM core."userWorkspace" WHERE id=ANY($1::uuid[])',[[admin,editor,outsider]]);
      record.state.enabled = false;
      record.state.telegramEnabled = false;
      await runner.manager.getRepository(DeliveryOperationsEntity).save(record);
      require('node:fs').writeFileSync('/tmp/otogrow-phase4-browser.json', JSON.stringify({ workspaceId:workspace.id,schema:workspace.databaseSchema,projectId:project.id,memberIds:[admin,editor,outsider],userIds:users.map((item)=>item.userId),previousOperations }),{mode:0o600});
      await runner.commitTransaction();
      console.log('Created temporary Phase 4 browser fixture with schedules and Telegram disabled.');
      return;
    }

    const task = () => runner.manager.getRepository(DeliveryTaskEntity).findOneBy({workspaceId:workspace.id,taskId});
    await operations.tickWorkspace(workspace,now);
    assert.equal((await read()).state.templates[0].lastTaskId,taskId);
    await assert.rejects(command(outsider,{action:'seen',taskId}));
    await command(editor,{action:'seen',taskId});
    await operations.dispatchWorkspace(workspace,later(6));
    assert.equal((await read()).state.notices.find((item)=>item.taskId===taskId && item.kind==='ASSIGNMENT').sendState,'SUPPRESSED');
    const link = (await command(editor,{action:'linkTelegram'})).link;
    const payload = new URL(link).searchParams.get('start');
    await operations.handleTelegramUpdate(workspace.id,{update_id:1,message:{message_id:1,chat:{id:123456},text:`/start ${payload}`}},now);
    await operations.handleTelegramUpdate(workspace.id,{update_id:2,message:{message_id:2,chat:{id:999999},text:`/start ${payload}`}},now);
    assert.equal((await read()).state.connections[editor].chatId,'123456');
    await command(admin,{action:'message',taskId,recipientId:editor,text:'Review this assignment.'});
    await operations.dispatchWorkspace(workspace,later(4)); assert.equal(sent,0);
    await operations.dispatchWorkspace(workspace,later(5)); assert.equal(sent,1);
    await operations.dispatchWorkspace(workspace,later(10)); assert.equal(sent,1);
    await command(admin,{action:'message',taskId,recipientId:editor,text:'Acknowledge this.'},later(11));
    let notice = (await read()).state.notices.at(-1);
    await command(editor,{action:'acknowledge',id:notice.id},later(12));
    await operations.dispatchWorkspace(workspace,later(20)); assert.equal(sent,1);
    const expiredLink = (await command(editor,{action:'linkTelegram'})).link;
    await operations.handleTelegramUpdate(workspace.id,{update_id:3,message:{message_id:3,chat:{id:999998},text:`/start ${new URL(expiredLink).searchParams.get('start')}`}},later(11));
    assert.equal((await read()).state.connections[editor].chatId,'123456');
    await runner.query('UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',[project.id,JSON.stringify([editor,outsider])]);
    await taskCommand(admin,{action:'edit',taskId,revision:(await task()).revision,fields:{...fields,assigneeId:outsider}});
    await operations.tickWorkspace(workspace,later(20));
    assert((await read()).state.notices.some((item)=>item.taskId===taskId && item.kind==='ASSIGNMENT' && item.recipientId===outsider && !item.cancelled));
    await taskCommand(admin,{action:'edit',taskId,revision:(await task()).revision,fields});
    await operations.tickWorkspace(workspace,later(20));
    await command(editor,{action:'seen',taskId},later(20));

    await command(admin,{action:'message',taskId,recipientId:editor,text:'Timeout fixture'},later(21));
    fail = true; await operations.dispatchWorkspace(workspace,later(26)); assert.equal(sent,2);
    await operations.dispatchWorkspace(workspace,later(30)); assert.equal(sent,2); fail=false;
    assert.equal((await read()).state.notices.at(-1).sendState,'UNCERTAIN');
    await command(admin,{action:'message',taskId,recipientId:editor,text:'Revocation fixture'},later(31));
    await runner.query('UPDATE core."deliveryProject" SET "memberIds"=\'[]\'::jsonb WHERE id=$1',[project.id]);
    await operations.dispatchWorkspace(workspace,later(36)); assert.equal(sent,2);
    assert.equal((await read()).state.notices.at(-1).sendState,'SUPPRESSED');
    await runner.query('UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',[project.id,JSON.stringify([editor])]);
    await taskCommand(editor,{action:'submit',taskId,revision:(await task()).revision,description:'Completed SEO work',evidence:['https://example.com/evidence']});
    await taskCommand(admin,{action:'review',taskId,revision:(await task()).revision,decision:'APPROVED',feedback:''});
    await assert.rejects(command(editor,{action:'delivered',taskId,revision:(await task()).revision,note:'Sent'}));
    await command(admin,{action:'delivered',taskId,revision:(await task()).revision,note:'Sent to synthetic client'});
    await operations.tickWorkspace(workspace,later(719));
    assert(!(await read()).state.notices.some((item)=>item.taskId===taskId && item.kind==='FULFILMENT' && !item.cancelled));
    await operations.tickWorkspace(workspace,later(720));
    await operations.tickWorkspace(workspace,later(721));
    assert.equal((await read()).state.notices.filter((item)=>item.taskId===taskId && item.kind==='FULFILMENT' && !item.cancelled).length,1);
    await command(admin,{action:'fulfilment',taskId,cycle:1,historyLength:1,decision:'NOT_FULFILLED',note:'Waiting for review'},later(722));
    assert.equal((await read()).state.fulfilments.find((item)=>item.taskId===taskId).nextCheckAt,later(1442).toISOString());
    await command(admin,{action:'fulfilment',taskId,cycle:1,historyLength:2,decision:'REDOING',note:'Client requested a revision'},later(723));
    assert.equal((await task()).details.state,'CHANGES_REQUESTED');
    await assert.rejects(command(admin,{action:'delivered',taskId,revision:(await task()).revision,note:'Cannot deliver unapproved revision'},later(724)));
    await taskCommand(editor,{action:'submit',taskId,revision:(await task()).revision,description:'Revised work',evidence:['https://example.com/v2']});
    await taskCommand(admin,{action:'review',taskId,revision:(await task()).revision,decision:'APPROVED',feedback:''});
    await command(admin,{action:'delivered',taskId,revision:(await task()).revision,note:'Redelivered'},later(730));
    await command(admin,{action:'fulfilment',taskId,cycle:2,historyLength:4,decision:'FULFILLED',note:'No objection; complete'},later(1450));
    await assert.rejects(command(admin,{action:'fulfilment',taskId,cycle:1,historyLength:2,decision:'REDOING',note:'Stale'}));
    await command(admin,{action:'alert',taskId,category:'CLIENT',severity:'URGENT',reason:'Review concern',ownerId:admin});
    await command(admin,{action:'alert',taskId,category:'CLIENT',severity:'NORMAL',reason:'Updated concern',ownerId:admin});
    assert.equal((await read()).state.alerts.filter((item)=>item.taskId===taskId && item.category==='CLIENT').length,1);
    const editorSnapshot = await operations.snapshot(workspace,editor,editor);
    assert.equal(editorSnapshot.alerts.length,0); assert.equal(editorSnapshot.templates.length,0); assert(!JSON.stringify(editorSnapshot).includes('123456'));
    console.log('PASS: recurring idempotency/catch-up, access isolation, one-time/acknowledged/revoked/uncertain reminders, private single-use linking, delivery checks and redo/redelivery, and founder deduplication. Synthetic transaction rolled back; no Telegram network calls.');
  } finally {
    axios.post = originalPost; global.Date = OriginalDate;
    if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); await connectionSource.destroy();
  }
})().catch((error) => {console.error(error);process.exitCode=1;});
