const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  createFixture,
  cleanupFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const NOW = new Date('2026-10-29T08:00:00.000Z');
const DATE = '2026-10-29';
const TIMEZONE = 'Asia/Qatar';
const copy = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (name) => {
  assert(/^[a-zA-Z0-9_]+$/.test(name));
  return `"${name}"`;
};
function detailsFor(fixture, task) {
  const sentinel = `PRIVATE_TASK_HISTORY:${fixture.workspaceId}:${task.taskId}:`;
  const privateText = sentinel + 'x'.repeat(1024);
  const creative = newCreativeDocument();
  creative.version = 1;
  creative.briefVersion = 1;
  creative.approvedBriefVersion = 1;
  creative.productionVersion = 1;
  creative.assemblyVersion = 1;
  creative.brief = {
    ...creative.brief,
    outputKind: 'IMAGE',
    concept: privateText,
    duration: 2,
  };
  creative.revisionCharge = 34567;
  creative.assets = Array.from({ length: 8 }, (_, index) => ({
    id: index === 0 ? task.finalAssetId : randomUUID(),
    name: `${sentinel} old media ${index}`,
    kind: index === 0 ? 'FINAL' : 'IMAGE',
    mimeType: 'image/png',
    size: 128,
    storageState: 'READY',
    createdAt: NOW.toISOString(),
    uploadedBy: task.assigneeId,
    briefVersion: 1,
    productionVersion: 1,
    assemblyVersion: 1,
    shotId: null,
    shotVersion: null,
    parentAssetId: null,
    reviews: [],
  }));
  creative.finalAssetId = task.finalAssetId;
  const submissions = Array.from({ length: 12 }, (_, index) => ({
    version: index + 1,
    description: privateText,
    evidence: [`https://example.invalid/synthetic/${task.taskId}/${index}`],
    submittedBy: task.assigneeId,
    submittedAt: new Date(NOW.getTime() - (index + 2) * 86400000).toISOString(),
    decision: 'CHANGES_REQUESTED',
    feedback: privateText,
    reviewedBy: fixture.people.admin.memberId,
    reviewedAt: NOW.toISOString(),
  }));
  submissions.push({
    version: 13,
    creativeVersion: 1,
    finalAssetId: task.finalAssetId,
    description: privateText,
    evidence: [],
    submittedBy: task.assigneeId,
    submittedAt: NOW.toISOString(),
    ...(task.state === 'APPROVED'
      ? {
          decision: 'APPROVED',
          reviewedBy: fixture.people.admin.memberId,
          reviewedAt: NOW.toISOString(),
          feedback: 'Synthetic existing approval',
        }
      : task.state === 'IN_REVIEW'
        ? {}
        : {
            decision: 'CHANGES_REQUESTED',
            reviewedBy: fixture.people.admin.memberId,
            reviewedAt: NOW.toISOString(),
            feedback: 'Synthetic earlier review',
          }),
  });
  return {
    brief: privateText,
    service: task.service,
    priority: task.priority,
    scheduledDate: task.scheduledDate,
    reviewerId: fixture.people.admin.memberId,
    state: task.state,
    blocker: task.state === 'BLOCKED' ? 'Synthetic source is missing.' : '',
    checklist: [
      {
        id: randomUUID(),
        text: 'Synthetic task check one',
        done: task.index % 2 === 0,
      },
      { id: randomUUID(), text: 'Synthetic task check two', done: false },
    ],
    evidence: [],
    submissions,
    events: Array.from({ length: 24 }, (_, index) => ({
      id: randomUUID(),
      actorId: task.assigneeId,
      action: 'COMMENT',
      text: privateText,
      at: new Date(NOW.getTime() - index * 1000).toISOString(),
    })),
    creative,
  };
}
async function createTaskReadsFixture(manager) {
  const fixture = await createFixture(manager, 'task_reads_rollback');
  await manager.query(
    `COMMENT ON SCHEMA ${quote(fixture.schemaName)} IS '${fixture.sentinel}'`,
  );
  await manager.query(
    `CREATE TABLE ${quote(fixture.schemaName)}.task (id uuid PRIMARY KEY,title text NOT NULL,"assigneeId" uuid,"dueAt" timestamptz,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL,status text,"deletedAt" timestamptz)`,
  );
  for (const name of ['reader', 'writer'])
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles[name], []],
    );
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.secondWriter, ['finance.read']],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
    [
      fixture.projects.first,
      JSON.stringify([
        fixture.people.reader.memberId,
        fixture.people.writer.memberId,
      ]),
    ],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
    [
      fixture.projects.otherClient,
      JSON.stringify([fixture.people.secondWriter.memberId]),
    ],
  );
  fixture.tasks = [];
  const states = [
    'PLANNED',
    'IN_PROGRESS',
    'BLOCKED',
    'IN_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
  ];
  for (const [scope, count, workspaceId, projectId] of [
    ['PRIMARY', 137, fixture.workspaceId, fixture.projects.first],
    ['OTHER', 19, fixture.workspaceId, fixture.projects.otherClient],
    ['FOREIGN', 11, fixture.foreignWorkspaceId, fixture.projects.foreign],
  ]) {
    const rows = Array.from({ length: count }, (_, index) => {
      const task = {
        taskId: randomUUID(),
        finalAssetId: randomUUID(),
        scope,
        index,
        workspaceId,
        projectId,
        title: `Task reads ${scope} ${String(index).padStart(3, '0')}`,
        assigneeId:
          scope === 'PRIMARY'
            ? index % 2 === 0
              ? fixture.people.reader.memberId
              : fixture.people.writer.memberId
            : fixture.people.secondWriter.memberId,
        state: states[index % states.length],
        service: ['AI video', 'SEO', 'Performance marketing'][index % 3],
        priority: ['LOW', 'NORMAL', 'HIGH'][index % 3],
        scheduledDate:
          index % 3 === 0 ? DATE : index % 3 === 1 ? '2026-10-28' : null,
        dueAt:
          index % 4 === 0
            ? null
            : index % 4 === 1
              ? '2026-10-29T16:00:00.000Z'
              : index % 4 === 2
                ? '2026-10-28T16:00:00.000Z'
                : '2026-10-30T16:00:00.000Z',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        revision: 1,
      };
      task.details = detailsFor(fixture, task);
      fixture.tasks.push(task);
      return task;
    });
    await manager.query(
      `INSERT INTO ${quote(fixture.schemaName)}.task(id,title,"assigneeId",status,"dueAt","createdAt","updatedAt") SELECT row."taskId",row.title,row."assigneeId",CASE WHEN row.state='APPROVED' THEN 'DONE' ELSE 'IN_PROGRESS' END,row."dueAt"::timestamptz,row."createdAt"::timestamptz,row."updatedAt"::timestamptz FROM jsonb_to_recordset($1::jsonb) AS row("taskId" uuid,title text,"assigneeId" uuid,state text,"dueAt" text,"createdAt" text,"updatedAt" text)`,
      [JSON.stringify(rows.map(({ details, ...row }) => row))],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) SELECT row."workspaceId",row."taskId",row."projectId",row.details,1 FROM jsonb_to_recordset($1::jsonb) AS row("workspaceId" uuid,"taskId" uuid,"projectId" uuid,details jsonb)',
      [
        JSON.stringify(
          rows.map((row) => ({
            workspaceId: row.workspaceId,
            taskId: row.taskId,
            projectId: row.projectId,
            details: row.details,
          })),
        ),
      ],
    );
  }
  const state = newDeliveryOperations();
  state.business = { records: [], inbox: [], seen: {} };
  state.clients = { engagements: [], shares: [], links: [], audit: [] };
  const approved = fixture.tasks.find(
    (task) => task.scope === 'PRIMARY' && task.state === 'APPROVED',
  );
  state.fulfilments = [
    {
      taskId: approved.taskId,
      status: 'WAITING',
      deliveredSubmissionVersion: 13,
      deliveredAt: new Date(NOW.getTime() - 86400000).toISOString(),
      nextCheckAt: new Date(NOW.getTime() + 43200000).toISOString(),
      cycle: 1,
      history: Array.from({ length: 40 }, (_, index) => ({
        at: NOW.toISOString(),
        actorId: fixture.people.admin.memberId,
        action: 'DELIVERED',
        note: `PRIVATE_TASK_HISTORY:${fixture.workspaceId}:old fulfilment ${index} ${'x'.repeat(1024)}`,
      })),
    },
  ];
  await manager.query(
    'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
    [fixture.workspaceId, state],
  );
  return fixture;
}
async function sourceFingerprint(manager, fixture) {
  const tables = await manager.query(
    `SELECT table_schema AS schema,table_name AS name FROM information_schema.columns WHERE column_name='workspaceId' AND table_schema='core' ORDER BY table_name`,
  );
  const result = {};
  for (const table of tables)
    result[`core.${table.name}`] = hash(
      await manager.query(
        `SELECT to_jsonb(row)::text AS value FROM core.${quote(table.name)} row WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY value`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
    );
  for (const name of ['task', 'company', 'workspaceMember'])
    result[`native.${name}`] = hash(
      await manager.query(
        `SELECT to_jsonb(row)::text AS value FROM ${quote(fixture.schemaName)}.${quote(name)} row ORDER BY value`,
      ),
    );
  result.workspace = hash(
    await manager.query(
      'SELECT to_jsonb(row)::text AS value FROM core.workspace row WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    ),
  );
  result.users = hash(
    await manager.query(
      'SELECT to_jsonb(row)::text AS value FROM core."user" row WHERE id=ANY($1::uuid[]) ORDER BY id',
      [Object.values(fixture.people).map((person) => person.userId)],
    ),
  );
  return result;
}
const denied = (operation, statuses = [403, 404]) =>
  assert.rejects(operation, (error) => statuses.includes(error.getStatus?.()));
module.exports = {
  NOW,
  DATE,
  TIMEZONE,
  copy,
  hash,
  quote,
  detailsFor,
  createTaskReadsFixture,
  sourceFingerprint,
  denied,
  buildServices,
  cleanupFixture,
};
