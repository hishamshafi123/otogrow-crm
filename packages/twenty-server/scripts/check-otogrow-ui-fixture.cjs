const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { WorkspaceEntity } = require('../dist/engine/core-modules/workspace/workspace.entity');
const { DeliveryProjectEntity } = require('../dist/modules/delivery/entities/delivery-project.entity');
const { DeliveryTaskEntity } = require('../dist/modules/delivery/entities/delivery-task.entity');
const { DeliveryOperationsEntity } = require('../dist/modules/delivery/entities/delivery-operations.entity');
const { recordOtogrowActivity } = require('../dist/modules/otogrow-activity/record-otogrow-activity');
const { newDeliveryOperations } = require('../dist/modules/delivery/operations/delivery-operations.types');
const { newDeliveryBusiness } = require('../dist/modules/delivery/business/delivery-business.types');
const { newDeliveryClients } = require('../dist/modules/delivery/clients/delivery-clients.types');
const { newCreativeDocument } = require('../dist/modules/delivery/creative/delivery-creative.types');
const FILE = '/tmp/otogrow-ui-activity-fixture.json';
const SENTINEL = 'Disposable OS interface acceptance';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'cleanup') {
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      await connectionSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`delivery:${fixture.workspaceId}`]);
        const project = await manager.getRepository(DeliveryProjectEntity).findOneByOrFail({ id: fixture.projectId, workspaceId: fixture.workspaceId, name: SENTINEL });
        assert(project);
        assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
        const operations = await manager.getRepository(DeliveryOperationsEntity).findOneBy({ workspaceId: fixture.workspaceId });
        if (operations) {
          const noticeIds = operations.state.notices.filter((item) => fixture.taskIds.includes(item.taskId)).map((item) => item.id);
          await manager.query('DELETE FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[])', [fixture.workspaceId, noticeIds]);
          for (const field of ['notices', 'fulfilments', 'alerts']) operations.state[field] = operations.state[field].filter((item) => !fixture.taskIds.includes(item.taskId));
          for (const id of fixture.taskIds) delete operations.state.assignments[id];
          const business = operations.state.business;
          if (business) {
            const recordIds = business.records.filter((item) => item.projectId === fixture.projectId).map((item) => item.id);
            business.records = business.records.filter((item) => !recordIds.includes(item.id));
            business.inbox = business.inbox.filter((item) => !recordIds.includes(item.conversationId));
            if (business.agentRuns) business.agentRuns = business.agentRuns.filter((item) => !recordIds.includes(item.conversationId));
            for (const seen of Object.values(business.seen)) for (const id of recordIds) delete seen[id];
          }
          const clients = operations.state.clients;
          if (clients) {
            const engagementIds = clients.engagements.filter((item) => item.projectId === fixture.projectId).map((item) => item.id);
            const shareIds = clients.shares.filter((item) => engagementIds.includes(item.engagementId)).map((item) => item.id);
            clients.engagements = clients.engagements.filter((item) => !engagementIds.includes(item.id));
            clients.shares = clients.shares.filter((item) => !engagementIds.includes(item.engagementId));
            clients.links = clients.links.filter((item) => !engagementIds.includes(item.engagementId));
            clients.audit = clients.audit.filter((item) => ![...engagementIds, ...shareIds].includes(item.targetId));
          }
          await manager.getRepository(DeliveryOperationsEntity).save(operations);
        }
        const batches = await manager.query('SELECT id,label FROM core."deliveryBatch" WHERE "workspaceId"=$1 AND "projectId"=$2', [fixture.workspaceId, fixture.projectId]);
        assert(batches.every((batch) => batch.label.startsWith('Disposable batch acceptance')));
        const batchIds = batches.map((batch) => batch.id);
        for (const table of ['deliveryBatchItem', 'deliveryBatchEvent']) await manager.query(`DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND "batchId"=ANY($2::uuid[])`, [fixture.workspaceId, batchIds]);
        await manager.query('DELETE FROM core."deliveryBatch" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])', [fixture.workspaceId, batchIds]);
        const periods = await manager.query('SELECT id FROM core."deliveryCommitmentPeriod" WHERE "workspaceId"=$1 AND "projectId"=$2', [fixture.workspaceId, fixture.projectId]);
        const periodIds = periods.map((period) => period.id);
        if (periodIds.length) {
          for (const table of ['deliveryCommitmentEvent', 'deliveryCommitmentAllocation', 'deliveryCommitmentLine']) {
            await manager.query(`DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND "periodId"=ANY($2::uuid[])`, [fixture.workspaceId, periodIds]);
          }
          await manager.query('DELETE FROM core."deliveryCommitmentPeriod" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])', [fixture.workspaceId, periodIds]);
        }
        await manager.query('DELETE FROM core."deliveryWorkflowArchive" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])', [fixture.workspaceId, fixture.taskIds]);
        if (fixture.workflowIds?.length) {
          const versions = await manager.query('SELECT definition FROM core."deliveryWorkflowVersion" WHERE "workspaceId"=$1 AND "templateId"=ANY($2::uuid[])', [fixture.workspaceId, fixture.workflowIds]);
          assert(versions.length && versions.every((row) => row.definition.name.startsWith('Disposable SEO workflow acceptance')));
          await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'workflow-template\' AND "sourceId"=ANY($2::uuid[])', [fixture.workspaceId, fixture.workflowIds]);
          await manager.query('DELETE FROM core."deliveryWorkflowVersion" WHERE "workspaceId"=$1 AND "templateId"=ANY($2::uuid[])', [fixture.workspaceId, fixture.workflowIds]);
          await manager.query('DELETE FROM core."deliveryWorkflowTemplate" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])', [fixture.workspaceId, fixture.workflowIds]);
        }
        await manager.query('DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2', [fixture.workspaceId, fixture.projectId]);
        await manager.query('DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2', [fixture.workspaceId, fixture.projectId]);
        await manager.query(`DELETE FROM "${fixture.schema}".task WHERE id = ANY($1::uuid[])`, [fixture.taskIds]);
        await manager.getRepository(DeliveryProjectEntity).delete({ id: fixture.projectId, workspaceId: fixture.workspaceId });
      });
      unlinkSync(FILE);
      console.log('Exact temporary UI fixture removed.');
      return;
    }
    if (process.argv[2] === 'track-workflow') {
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      const rows = await connectionSource.query('SELECT DISTINCT "templateId" FROM core."deliveryWorkflowVersion" WHERE "workspaceId"=$1 AND definition->>\'name\'=\'Disposable SEO workflow acceptance\' AND reason=\'Disposable browser acceptance only.\'', [fixture.workspaceId]);
      assert.equal(rows.length, 1);
      fixture.workflowIds = rows.map((row) => row.templateId);
      writeFileSync(FILE, JSON.stringify(fixture));
      console.log('Exact disposable workflow recorded for cleanup.');
      return;
    }
    if (process.argv[2] === 'augment') {
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      await connectionSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`delivery:${fixture.workspaceId}`]);
        const project = await manager.getRepository(DeliveryProjectEntity).findOneByOrFail({ id: fixture.projectId, workspaceId: fixture.workspaceId, name: SENTINEL });
        const memberId = project.memberIds[0];
        assert(memberId && project.companyId);
        const repository = manager.getRepository(DeliveryOperationsEntity);
        const operations = await repository.findOneBy({ workspaceId: fixture.workspaceId }) ?? repository.create({ workspaceId: fixture.workspaceId, state: newDeliveryOperations() });
        operations.state.business ??= newDeliveryBusiness();
        operations.state.clients ??= newDeliveryClients();
        assert(!operations.state.business.records.some((item) => item.projectId === project.id), 'Fixture already augmented.');
        const now = new Date().toISOString();
        const conversationId = randomUUID();
        operations.state.business.records.push({ id: conversationId, kind: 'CONVERSATION', revision: 1, projectId: project.id, title: 'Disposable client conversation', channel: 'EMAIL', sourceUrl: null, ownerId: memberId, private: true, grants: [], createdBy: memberId, createdAt: now, updatedAt: now, status: 'OPEN', decisionBy: null, evidence: null, taskId: null, history: [] });
        operations.state.business.inbox.push({ id: randomUUID(), conversationId, authorId: memberId, createdAt: now, text: 'Acceptance fixture: please review the opening hook.', kind: 'INBOUND_NOTE', sourceUrl: null, sourceIds: [] });
        operations.state.clients.engagements.push({ id: randomUUID(), projectId: project.id, companyId: project.companyId, revision: 1, name: 'Disposable client agreement', services: ['AI video'], billing: 'RETAINER', scope: 'Browser acceptance only.', allowance: 'Legacy scope note retained.', contact: '', fields: [{ id: randomUUID(), label: 'Website link', required: true }], assets: [], submissions: [] });
        await repository.save(operations);
        const task = await manager.getRepository(DeliveryTaskEntity).findOneByOrFail({ workspaceId: fixture.workspaceId, taskId: fixture.taskIds[3], projectId: project.id });
        task.details.creative = newCreativeDocument();
        await manager.getRepository(DeliveryTaskEntity).save(task);
      });
      console.log('Added disposable conversation, engagement and creative document. No external action.');
      return;
    }
    assert.equal(process.argv[2], 'create');
    const workspace = await connectionSource.getRepository(WorkspaceEntity).findOneByOrFail({ id: '0a420537-0122-45c3-a2f5-18298b636227' });
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const [member] = await connectionSource.query(`SELECT id FROM "${workspace.databaseSchema}"."workspaceMember" WHERE "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`);
    assert(member);
    const [company] = await connectionSource.query(`SELECT id FROM "${workspace.databaseSchema}".company WHERE "deletedAt" IS NULL ORDER BY name LIMIT 1`);
    const projectId = randomUUID();
    const taskIds = [];
    await connectionSource.transaction(async (manager) => {
      await manager.getRepository(DeliveryProjectEntity).insert({ id: projectId, workspaceId: workspace.id, name: SENTINEL, companyId: company?.id ?? null, memberIds: [member.id] });
      const states = ['CHANGES_REQUESTED', 'BLOCKED', 'IN_PROGRESS', 'PLANNED', 'IN_REVIEW', 'APPROVED'];
      const titles = ['Revise the opening hook', 'Waiting for product photographs', 'Finish the product edit', 'Plan next week’s creative', 'Submitted for review', 'Approved brand video'];
      for (let index = 0; index < states.length; index++) {
        const taskId = randomUUID(); taskIds.push(taskId);
        const dueAt = index === 2 ? new Date(Date.now() - 86400000).toISOString() : null;
        const scheduledDate = index === 3 ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) : null;
        await manager.query(`INSERT INTO "${workspace.databaseSchema}".task (id,title,"assigneeId","dueAt",status) VALUES ($1,$2,$3,$4,'TODO')`, [taskId, titles[index], member.id, dueAt]);
        await manager.getRepository(DeliveryTaskEntity).insert({ workspaceId: workspace.id, taskId, projectId, revision: 1, details: { state: states[index], brief: 'Disposable browser acceptance task.', service: 'AI video', priority: index === 2 ? 'HIGH' : 'NORMAL', scheduledDate, reviewerId: member.id, blocker: index === 1 ? 'The product reference photographs are still needed.' : '', checklist: [{ id: randomUUID(), text: 'Check product accuracy', done: false }], evidence: [], submissions: [], events: [] } });
        await recordOtogrowActivity(manager, { workspaceId: workspace.id, actorId: member.id, category: 'DELIVERY', action: 'TASK_CREATED', outcome: 'RECORDED', summary: 'UI acceptance: created a production task.', projectId, taskId, sourceType: 'task', sourceId: taskId, changes: [{ field: 'state', before: null, after: states[index] }] });
      }
      await recordOtogrowActivity(manager, { workspaceId: workspace.id, actorId: member.id, actorType: 'AGENT', category: 'AGENT', action: 'AGENT_RUN_COMPLETED', outcome: 'SUCCEEDED', summary: 'UI acceptance: assistant findings ready for review.', projectId, taskId: taskIds[0], sourceType: 'agent-run', sourceId: randomUUID(), changes: [{ field: 'runStatus', before: 'RUNNING', after: 'SUCCEEDED' }] });
    });
    writeFileSync(FILE, JSON.stringify({ workspaceId: workspace.id, projectId, taskIds, schema: workspace.databaseSchema }));
    console.log('Temporary UI fixture created; exact cleanup manifest saved.');
  } finally { await connectionSource.destroy(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
