const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const {
  WORKSPACE_ID, additions, exactIds, fingerprint,
  isAuthenticationLifecycleTable, locked, noNativeAutomation,
  operations, quote, readTables, syncDirectory, withoutHeartbeat, writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const { DeliveryAgentEntity } = require('../dist/modules/delivery/entities/delivery-agent.entity');
const { deliveryAgentConfigurationSchema } = require('../dist/modules/delivery/agents/delivery-agent.types');
const { OtogrowActivityEventEntity } = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');
const { OtogrowActivityAnalysisRunEntity } = require('../dist/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity');
const {
  activityAnalysisBody, activityAnalysisContextFingerprint, activityAnalysisEvidenceFingerprint,
  buildActivityAnalysisContext, validateActivityAnalysisOutput,
} = require('../dist/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy');
const { advertisingHash } = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');

const { realCachedCurrentWork } = require('./check-otogrow-activity-current-work-support.cjs');
const { OtogrowAccessService } = require('../dist/modules/otogrow-access/otogrow-access.service');
const { WorkspaceEntity } = require('../dist/engine/core-modules/workspace/workspace.entity');
const FILE = '/tmp/otogrow-activity-analysis-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SOURCES = ['otogrowactivityevent', 'otogrowactivityanalysisrun', 'deliveryagent'];
const fault = (stage) => {
  if (process.env.OTOGROW_ACTIVITY_ANALYSIS_UI_TEST_FAILURE === stage)
    throw new Error(`Injected ${stage} interruption; use guarded cleanup.`);
};
const write = (fixture, initial = false) => writeJournal(fixture, FILE, initial);
const modelFor = (fixture) => `__fixture_unregistered__/activity-${fixture.nonce}`;
const entries = (fixture) => [
  { name: 'otogrowActivityAnalysisRun', ids: [fixture.runId] },
  { name: 'otogrowActivityEvent', ids: fixture.events.map((event) => event.id) },
  { name: 'deliveryAgent', ids: [fixture.agentId] },
  ...(fixture.includeCurrentWork ? [
    { name: 'deliveryTask', ids: [fixture.deliveryTaskId] },
    { name: 'task', schema: fixture.schema, ids: [fixture.taskId] },
    { name: 'deliveryProject', ids: [fixture.projectId] },
  ] : []),
];
function read() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(fixture.marker, `activity-analysis-ui:${fixture.nonce}`);
  assert(['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(fixture.status));
  const ids = [fixture.nonce, fixture.agentId, fixture.runId, fixture.requestId, fixture.personId,
    ...fixture.events.flatMap((event) => [event.id, event.actorId]),
    ...(fixture.includeCurrentWork ? [fixture.projectId, fixture.taskId, fixture.deliveryTaskId] : [])];
  ids.forEach((id) => assert.match(id, UUID));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(fixture.events.length, 55);
  assert(Array.isArray(fixture.cleanupAttempts));
  if (fixture.schema) quote(fixture.schema);
  return fixture;
}
async function administrator(manager, fixture) {
  const rows = await manager.query(
    `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
    [WORKSPACE_ID],
  );
  assert.equal(rows.length, 1, 'Use the unchanged original native administrator.');
  if (fixture.actorId) {
    assert.equal(rows[0].memberId, fixture.actorId);
    assert.equal(rows[0].userId, fixture.actorUserId);
    assert.equal(rows[0].userWorkspaceId, fixture.userWorkspaceId);
  }
  return rows[0];
}
async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  const current = await operations(manager);
  assert.equal(current.id, fixture.baseline.operations.id);
  assert.equal(fingerprint(withoutHeartbeat(current.state)), fixture.baseline.operations.hash);
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const present = extra.filter((table) => table.rows.length);
  const expected = entries(fixture);
  const rowCount = present.reduce((count, table) => count + table.rows.length, 0);
  const hasSeed = rowCount > 0;
  for (const table of extra) {
    const owned = hasSeed ? expected.find((entry) => entry.name === table.name && table.schema === (entry.schema ?? 'core')) : null;
    exactIds(table.rows, owned?.ids ?? [], `Unexpected addition in ${table.schema}.${table.name}; preserve journal.`);
    for (const row of table.rows)
      assert.equal(row.hash, fixture.seed[`${table.name}:${row.id}`], 'Owned archive/evidence/configuration changed; no inference or edits permitted.');
  }
  if (hasSeed) {
    await administrator(manager, fixture);
    assert.equal(rowCount, fixture.includeCurrentWork ? 60 : 57);
    const [run] = await manager.query('SELECT status,usage,"cancelRequestId",agent FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 AND id=$2', [WORKSPACE_ID, fixture.runId]);
    assert.equal(run.status, 'SUCCEEDED');
    assert.equal(run.usage, null);
    assert.equal(run.cancelRequestId, null);
    assert.equal(run.agent.modelId, modelFor(fixture));
  }
  return { tables, extra, hasSeed };
}
async function seed(manager, fixture) {
  const configuration = deliveryAgentConfigurationSchema.parse({
    name: `${fixture.title} archived assistant`, purpose: 'Synthetic browser acceptance only; no model dispatch.',
    kind: 'ACTIVITY', enabled: true, instructions: 'FIXTURE only. Cite the supplied structural events; current work status is unknown.',
    requiredInputs: ['activity', 'question'], outputFormat: 'analysis', tools: [], modelId: modelFor(fixture),
    projectIds: [], roles: ['ADMIN'], roleIds: null, dailyRunLimit: 1, maxOutputTokens: 512, humanConfirmation: true,
  });
  if (fixture.includeCurrentWork) {
    await manager.query('INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)', [fixture.projectId, WORKSPACE_ID, fixture.title, JSON.stringify([fixture.actorId])]);
    await manager.query(`INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,'IN_PROGRESS','2026-11-04T06:00:00Z')`, [fixture.taskId, `${fixture.title} current review`, fixture.actorId]);
    const details = { brief: fixture.marker, service: 'AI_VIDEO', priority: 'NORMAL', scheduledDate: '2026-11-02', reviewerId: fixture.actorId, state: 'IN_REVIEW', blocker: 'FIXTURE: reported waiting for an independent reviewer', checklist: [], evidence: [], submissions: [{ version: 1, description: 'FIXTURE only', evidence: [], submittedBy: fixture.actorId, submittedAt: '2026-11-02T03:00:00.000Z' }], events: [] };
    await manager.query('INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)', [fixture.deliveryTaskId, WORKSPACE_ID, fixture.taskId, fixture.projectId, JSON.stringify(details)]);
  }
  await manager.getRepository(DeliveryAgentEntity).insert({ id: fixture.agentId, workspaceId: WORKSPACE_ID, version: 1,
    configuration, createdAt: new Date('2020-02-21T09:00:00Z'), updatedAt: new Date('2020-02-21T09:00:00Z') });
  const events = fixture.events.map((event, index) => ({
    id: event.id, workspaceId: WORKSPACE_ID, occurredAt: new Date(Date.UTC(2020, 1, 20, 9, 0, index)),
    actorId: event.actorId, actorName: `FIXTURE recorded actor ${String(index + 1).padStart(2, '0')}`,
    actorType: index % 5 === 0 ? 'AGENT' : 'HUMAN', subjectMemberId: fixture.personId,
    subjectName: fixture.title, category: 'AGENT', action: 'AGENT_SAVED', outcome: 'RECORDED',
    summary: `${fixture.marker}: FIXTURE structural configuration event ${index + 1}; no real work or inference occurred.`,
    projectId: fixture.includeCurrentWork ? fixture.projectId : null, projectName: fixture.includeCurrentWork ? fixture.title : null, clientId: null, clientName: null, taskId: null, taskName: null,
    agentName: `${fixture.title} archived assistant`, sourceType: 'agent', sourceId: fixture.agentId,
    changes: [{ field: 'instructionsChanged', before: 'false', after: 'true' },
      ...(index === 54 ? [{ field: 'agentRoles', before: null,
        after: `FIXTURE repeated structural role labels ${'fixture-role, '.repeat(80)}EXACT_FIXTURE_TAIL` }] : [])],
  }));
  await manager.getRepository(OtogrowActivityEventEntity).insert(events);
  const [{ capturedAt }] = await manager.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "capturedAt"`);
  const filters = { personId: fixture.includeCurrentWork ? null : fixture.personId, projectId: fixture.includeCurrentWork ? fixture.projectId : null, clientId: null, category: null, action: null, outcome: null,
    from: '2020-02-20T00:00:00.000Z', through: '2020-02-21T00:00:00.000Z' };
  const storedAgent = await manager.getRepository(DeliveryAgentEntity).findOneByOrFail({ workspaceId: WORKSPACE_ID, id: fixture.agentId });
  const body = { agentId: fixture.agentId, filters, ...(fixture.includeCurrentWork ? { includeCurrentWork: true } : {}), question: `${fixture.marker}: Who acted in this synthetic recorded history, and what remains unknown?` };
  let currentWork;
  if (fixture.includeCurrentWork) {
    const permissions = { userHasWorkspaceSettingPermission: async ({ workspaceId, userWorkspaceId }) => {
      const [row] = await manager.query('SELECT EXISTS(SELECT 1 FROM core."roleTarget" target JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=target."workspaceId" WHERE target."workspaceId"=$1 AND target."userWorkspaceId"=$2 AND role."canUpdateAllSettings"=true) AS allowed', [workspaceId, userWorkspaceId]); return row.allowed;
    } };
    const runtime = await realCachedCurrentWork(new OtogrowAccessService(connectionSource, permissions), (diagnostic) => console.error(diagnostic.name, diagnostic.message));
    try {
      const workspace = await manager.getRepository(WorkspaceEntity).findOneByOrFail({ id: WORKSPACE_ID });
      currentWork = await runtime.currentWork.snapshot(manager, workspace, fixture.actorId, fixture.userWorkspaceId, { personId: null, projectId: fixture.projectId, clientId: null }, capturedAt);
      assert.equal(currentWork.totalCount, 1); assert.equal(currentWork.complete, true);
      assert.equal(currentWork.items[0].reviewerState, 'SELF_REVIEW');
    } finally { await runtime.close(); }
  }
  const context = buildActivityAnalysisContext(body, storedAgent, { capturedAt,
    coverageStartedAt: capturedAt, totalCount: 55, containsFinance: false,
    events: events.map(({ workspaceId, ...event }) => ({ ...event, occurredAt: event.occurredAt.toISOString().replace(/Z$/, '000Z') })) }, currentWork);
  const citations = context.citations;
  const agent = { id: fixture.agentId, name: configuration.name, version: 1, modelId: configuration.modelId, maxOutputTokens: 512 };
  const bodyFingerprint = advertisingHash(activityAnalysisBody(body));
  const contextFingerprint = activityAnalysisContextFingerprint(context, storedAgent);
  const evidenceFingerprint = activityAnalysisEvidenceFingerprint(context);
  const input = { ...body, question: context.question, id: fixture.runId, requestId: fixture.requestId,
    bodyFingerprint, contextFingerprint, evidenceFingerprint, capturedAt, agentVersion: 1, pricingRevision: 1 };
  await manager.getRepository(OtogrowActivityAnalysisRunEntity).insert({
    workspaceId: WORKSPACE_ID, id: fixture.runId, requestId: fixture.requestId,
    initiatorId: fixture.actorId, initiatorName: fixture.actorName, userWorkspaceId: fixture.userWorkspaceId,
    agentId: fixture.agentId, agentVersion: 1, revision: 3, status: 'SUCCEEDED', inputHash: fingerprint(input), bodyFingerprint,
    contextFingerprint, input, configuration, agent,
    basis: { evidenceFingerprint, containsFinance: false, includedCount: 55, omittedCount: 0, promptVersion: context.promptVersion, outputContractVersion: context.outputContractVersion, ...(currentWork ? { currentWork: { nativeVisibilityFingerprint: currentWork.nativeVisibilityFingerprint, taskIds: currentWork.items.map((task) => task.taskId) } } : {}) },
    context, startReceipt: { action: 'STARTED', requestId: fixture.requestId, runId: fixture.runId,
      actorId: fixture.actorId, userWorkspaceId: fixture.userWorkspaceId, inputHash: fingerprint(input), bodyFingerprint,
      createdAt: '2020-02-21T09:00:00.000Z', revision: 1, status: 'QUEUED' },
    result: validateActivityAnalysisOutput({ summary: `${fixture.marker}: FIXTURE saved answer for citation and draft-navigation acceptance. No model inference occurred.`,
      summaryCitationIds: [citations[0].id],
      findings: [{ kind: 'RECORDED', text: 'FIXTURE: The named actor recorded a structural change affecting the selected person. Actor and affected person are distinct.', citationIds: [citations[0].id] },
        ...(currentWork ? [{ kind: 'CURRENT_STATE', text: 'FIXTURE: At capture this task was in review and its assigned owner was also its effective reviewer. An independent reviewer is needed; no model inference occurred.', citationIds: [`current-task:${fixture.taskId}`] }] : [{ kind: 'POSSIBLE_BOTTLENECK', text: 'FIXTURE: Check current delivery records before deciding whether any work is waiting; this archive does not establish a current blocker.', citationIds: [citations[54].id] }])],
      unknowns: [currentWork ? 'Unrecorded work and the reasons for a wait are unknown.' : 'Current assignments, review queue and unrecorded work are unknown.'], limitations: context.limitations }, context),
    usage: null, error: null, cancelRequestId: null, cancelInputHash: null, cancelReceipt: null,
    createdAt: new Date('2020-02-21T09:00:00Z'), updatedAt: new Date('2020-02-21T09:00:00Z'), startedAt: new Date('2020-02-21T09:00:00Z'), finishedAt: new Date('2020-02-21T09:00:00Z'),
  });
}
function print(fixture) {
  const filter = fixture.includeCurrentWork ? `activityProject=${fixture.projectId}` : `activityPerson=${fixture.personId}`;
  console.log(JSON.stringify({ journal: FILE, status: fixture.status, title: fixture.title, personId: fixture.personId,
    runId: fixture.runId, agentId: fixture.agentId, taskId: fixture.taskId, projectId: fixture.projectId, eventIds: [fixture.events[0].id, fixture.events[54].id],
    urls: { history: `http://apple.localhost:3001/delivery?view=activity&${filter}&activityFrom=2020-02-20&activityThrough=2020-02-20&activityAnalysis=history&activityAnalysisRun=${fixture.runId}` },
    allowed: 'Read/filter/page/exact citations and unsaved question navigation only. Archive is explicitly synthetic; no model was called. A process-local readonly mock may allow Preview (without pricing/funding); no Start/cancel, assistant edit, role/model/budget changes, assignment, provider or message action.' }, null, 2));
}
async function create(includeCurrentWork = false) {
  assert(!existsSync(FILE), 'Recover the active activity-analysis browser fixture first.');
  const nonce = randomUUID();
  const fixture = { version: 1, workspaceId: WORKSPACE_ID, nonce, marker: `activity-analysis-ui:${nonce}`,
    title: `Disposable activity analysis ${nonce.slice(0, 8)}`, status: 'CREATING', createdAt: new Date().toISOString(),
    includeCurrentWork, ...(includeCurrentWork ? { projectId: randomUUID(), taskId: randomUUID(), deliveryTaskId: randomUUID() } : {}),
    agentId: randomUUID(), runId: randomUUID(), requestId: randomUUID(), personId: randomUUID(),
    events: Array.from({ length: 55 }, () => ({ id: randomUUID(), actorId: randomUUID() })), seed: {}, cleanupAttempts: [] };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query('SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1', [WORKSPACE_ID]);
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    const actor = await administrator(manager, fixture);
    fixture.actorId = actor.memberId; fixture.actorUserId = actor.userId; fixture.userWorkspaceId = actor.userWorkspaceId; fixture.actorName = actor.name;
    await noNativeAutomation(manager, fixture, SOURCES);
    const original = await operations(manager);
    fixture.baseline = { tables: await readTables(manager, fixture), operations: { id: original.id, hash: fingerprint(withoutHeartbeat(original.state)) } };
    assert(fixture.baseline.tables.length >= 177, 'Protect the full current scoped table inventory.');
    fixture.status = 'PREPARED'; write(fixture);
    await seed(manager, fixture);
    const after = await readTables(manager, fixture);
    for (const entry of entries(fixture))
      for (const id of entry.ids) {
        const row = after.find((table) => table.schema === (entry.schema ?? 'core') && table.name === entry.name).rows.find((row) => row.id === id);
        assert(row); fixture.seed[`${entry.name}:${id}`] = row.hash;
      }
    write(fixture); await validate(manager, fixture); fault('create-before-commit');
  });
  fault('create-after-commit'); fixture.status = 'READY'; write(fixture); print(fixture);
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const entry of entries(fixture)) {
        const rows = await manager.query(`SELECT id FROM ${quote(entry.schema ?? 'core')}.${quote(entry.name)} WHERE id=ANY($1::uuid[])`, [entry.ids]);
        assert.equal(rows.length, 0, 'Unknown partial seed requires manual investigation.');
      }
      return;
    }
    const observation = await validate(manager, fixture);
    const authentication = observation.tables.filter(isAuthenticationLifecycleTable);
    if (observation.hasSeed) {
      fixture.status = 'CLEANUP_PREPARED'; fixture.cleanupAttempts.push({ preparedAt: new Date().toISOString(), rows: observation.extra.filter((table) => table.rows.length) });
      assert(fixture.cleanupAttempts.length <= 20); write(fixture);
      for (const entry of entries(fixture)) {
        const table = observation.extra.find((row) => row.schema === (entry.schema ?? 'core') && row.name === entry.name);
        const ids = table.rows.map((row) => row.id);
        const removed = await manager.query(`WITH removed AS(DELETE FROM ${quote(entry.schema ?? 'core')}.${quote(entry.name)} WHERE id=ANY($1::uuid[]) RETURNING id)SELECT id FROM removed`, [ids]);
        exactIds(removed, ids);
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(table.hash, isAuthenticationLifecycleTable(table) ? authentication.find((row) => row.name === table.name).hash : fixture.baseline.tables[index].hash, `Original ${table.schema}.${table.name} changed.`);
    assert.equal(fingerprint(withoutHeartbeat((await operations(manager)).state)), fixture.baseline.operations.hash);
    write(fixture); fault('cleanup-before-commit');
  });
  fault('cleanup-after-commit'); fixture.status = 'CLEANED'; write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt)) assert.equal(fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))), fingerprint(fixture));
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE); syncDirectory(FILE);
  console.log(`PASS exact activity-analysis fixture cleanup: ${fixture.baseline?.tables.length ?? 0} protected scoped tables and original Operations/current authentication preserved; only owned synthetic events/archive/config removed. No model, real-task edit, send, role, spend or pricing change. Receipt: ${receipt}`);
}
async function main() {
  assert.equal(process.argv.length, 3);
  const command = process.argv[2]; assert(['create', 'create-current', 'inspect', 'cleanup'].includes(command));
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname), 'Local database only.');
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Network/provider access forbidden in this fixture.'); };
  try {
    await connectionSource.initialize();
    if (command === 'create' || command === 'create-current') await create(command === 'create-current');
    else {
      const fixture = read();
      if (command === 'cleanup') await cleanup(fixture);
      else { await connectionSource.transaction(async (manager) => { await locked(manager); await validate(manager, fixture); }); print(fixture); }
    }
  } finally { if (connectionSource.isInitialized) await connectionSource.destroy(); global.fetch = originalFetch; }
}
if (require.main === module) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`Preserve ${FILE}; guarded cleanup is required.`); process.exitCode = 1;
});
