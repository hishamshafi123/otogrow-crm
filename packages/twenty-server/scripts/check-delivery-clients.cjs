const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const axios = require('axios');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryBusinessService,
} = require('../dist/modules/delivery/business/delivery-business.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalPost = axios.post;
  try {
    const [workspace] = await runner.query(
      process.argv.includes('--browser-fixture')
        ? `SELECT w.* FROM core.workspace w JOIN core."userWorkspace" uw ON uw."workspaceId"=w.id JOIN core."user" u ON u.id=uw."userId" WHERE u.email='tim@apple.dev' LIMIT 1`
        : `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(),
      editor = randomUUID(),
      outsider = randomUUID();
    for (const member of [admin, editor, outsider]) {
      const user = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [member, user, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Operations','fixture')`,
        [member, user, `${user}@example.invalid`],
      );
    }
    let failAfterTransaction = false;
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          const result = await callback(manager);
          if (failAfterTransaction) {
            failAfterTransaction = false;
            throw new Error(
              'Synthetic failure after client and activity writes',
            );
          }
          return result;
        }),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const delivery = new DeliveryService(
      scoped,
      access,
      createIsolatedNativeTaskAccess(),
    );
    const creative = new DeliveryCreativeService(
      scoped,
      delivery,
      {},
      createIsolatedNativeTaskAccess(),
    );
    const operations = new DeliveryOperationsService(
      scoped,
      delivery,
      creative,
      {
        findByWorkspaceId: async () => ({
          isActive: true,
          botUsername: 'fixture_bot',
        }),
        decryptBotToken: () => 'fixture-token',
      },
      { get: () => 'http://localhost:3001' },
    );
    const clients = new DeliveryClientsService(
      scoped,
      delivery,
      creative,
      new DeliveryCommitmentsService(scoped, delivery),
    );
    const business = new DeliveryBusinessService(
      scoped,
      delivery,
      {},
      undefined,
      access,
    );
    const projectIds = [];
    const confidential = `PRIVATE-CLIENT-${randomUUID()}`;
    const activity = () =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND ("actorId"=ANY($2::uuid[]) OR "projectId"=ANY($3::uuid[])) ORDER BY "recordedAt",id',
        [workspace.id, [admin, editor, outsider], projectIds],
      );
    const checkedOperation = async (operation) => {
      const before = await activity();
      try {
        return await operation();
      } catch (error) {
        assert.deepEqual(
          await activity(),
          before,
          'Rejected client writes must not record successful activity',
        );
        throw error;
      }
    };
    const command = (actor, input) =>
      checkedOperation(() => clients.command(workspace, actor, actor, input));
    const originalRespond = clients.respond.bind(clients);
    clients.respond = (...args) =>
      checkedOperation(() => originalRespond(...args));
    const originalUpload = clients.upload.bind(clients);
    clients.upload = (...args) =>
      checkedOperation(() => originalUpload(...args));
    const read = () =>
      runner.manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: workspace.id });
    const companyA = randomUUID(),
      companyB = randomUUID();
    for (const companyId of [companyA, companyB])
      await runner.query(
        `INSERT INTO ${schema}.company (id,name) VALUES ($1,'Synthetic client')`,
        [companyId],
      );
    const makeEngagement = async (companyId) => {
      const snapshot = await delivery.command(workspace, admin, admin, {
        action: 'project',
        name: companyId,
        companyId,
        memberIds: [editor],
      });
      const project = snapshot.projects.find((item) => item.name === companyId);
      projectIds.push(project.id);
      const fieldId = randomUUID();
      const result = await command(admin, {
        action: 'engagement',
        engagement: {
          revision: 0,
          projectId: project.id,
          name: companyId,
          services: ['SEO'],
          billing: 'RETAINER',
          scope: 'Monthly SEO',
          allowance: 'Weekly reporting',
          contact: confidential,
          fields: [{ id: fieldId, label: 'Website', required: true }],
        },
      });
      return {
        engagement: result.engagements.find((item) => item.name === companyId),
        project,
        fieldId,
      };
    };
    const first = await makeEngagement(companyA),
      second = await makeEngagement(companyB);
    const beforeFailedEngagement = await read();
    failAfterTransaction = true;
    await assert.rejects(
      command(admin, {
        action: 'engagement',
        engagement: {
          revision: 0,
          projectId: first.project.id,
          name: 'Should roll back',
          services: ['SEO'],
          billing: 'ONE_TIME',
          scope: confidential,
          allowance: '',
          contact: confidential,
          fields: [],
        },
      }),
      /Synthetic failure/,
    );
    assert.deepEqual(await read(), beforeFailedEngagement);
    await assert.rejects(clients.snapshot(workspace, editor, editor));
    const accessA = await command(admin, {
      action: 'link',
      engagementId: first.engagement.id,
    });
    const accessB = await command(admin, {
      action: 'link',
      engagementId: second.engagement.id,
    });
    const credentialA = accessA.token + ':' + accessA.accessCode,
      credentialB = accessB.token + ':' + accessB.accessCode;
    const beforeReads = await activity();
    await assert.rejects(clients.portal(accessA.token));
    await assert.rejects(clients.portal(accessA.token + ':wrong'));
    assert.equal((await clients.portal(credentialA)).engagement.name, companyA);
    assert(
      !JSON.stringify(await clients.portal(credentialA)).includes(companyB),
    );
    assert(
      !JSON.stringify(await clients.snapshot(workspace, admin, admin)).includes(
        'codeHash',
      ),
    );
    assert.deepEqual(
      await activity(),
      beforeReads,
      'Portal and staff reads must not create activity',
    );
    const budgetRequest = {
      action: 'budget',
      requestId: randomUUID(),
      revision: first.engagement.revision,
      amount: 12345,
      reason: confidential,
    };
    await assert.rejects(clients.respond(credentialA, budgetRequest));
    assert.equal((await clients.portal(credentialA)).advertising, null);
    const {
      id,
      revision,
      projectId,
      name,
      services,
      billing,
      scope,
      allowance,
      contact,
      fields: engagementFields,
    } = first.engagement;
    const advertising = {
      managerId: admin,
      marketerId: editor,
      currency: 'USD',
      channel: 'META',
      period: 'DAILY',
    };
    const advertisingFields = {
      id,
      revision,
      projectId,
      name,
      services,
      billing,
      scope,
      allowance,
      contact,
      fields: engagementFields,
      advertising,
    };
    const beforeInvalidAdvertising = JSON.stringify((await read()).state);
    await assert.rejects(
      command(admin, {
        action: 'engagement',
        engagement: advertisingFields,
      }),
      /Select the Performance marketing service/,
    );
    await assert.rejects(
      command(admin, {
        action: 'engagement',
        engagement: {
          ...advertisingFields,
          id: undefined,
          revision: 0,
          name: 'Contradictory video engagement',
          services: ['AI video'],
        },
      }),
      /Select the Performance marketing service/,
    );
    assert.equal(
      JSON.stringify((await read()).state),
      beforeInvalidAdvertising,
      'Invalid service entitlements must not change stored engagements or history',
    );
    await command(admin, {
      action: 'engagement',
      engagement: {
        id,
        revision,
        projectId,
        name,
        services: [...services, 'PERFORMANCE_MARKETING'],
        billing,
        scope,
        allowance,
        contact,
        fields: engagementFields,
        advertising,
      },
    });
    await assert.rejects(clients.respond(credentialA, budgetRequest));
    budgetRequest.revision += 1;
    await clients.respond(credentialA, budgetRequest);
    await clients.respond(credentialA, budgetRequest);
    await assert.rejects(
      clients.respond(credentialA, {
        ...budgetRequest,
        amount: budgetRequest.amount + 1,
      }),
      /different budget request/,
    );
    await assert.rejects(
      clients.respond(credentialA, {
        ...budgetRequest,
        revision: budgetRequest.revision + 1,
      }),
      /different budget request/,
    );
    const budgetPortal = await clients.portal(credentialA);
    assert.equal(budgetPortal.advertising.requests.length, 1);
    assert.equal(budgetPortal.advertising.requests[0].amount, 12345);
    assert.equal(budgetPortal.advertising.requests[0].status, 'REVIEW');
    assert.equal(
      budgetPortal.advertising.requests[0].clientRequestId,
      budgetRequest.requestId,
    );
    assert.equal(
      budgetPortal.advertising.requests[0].clientRequestRevision,
      budgetRequest.revision,
    );
    assert.equal(budgetPortal.advertising.requests[0].reason, budgetRequest.reason);
    assert(!JSON.stringify(budgetPortal.advertising).includes(editor));
    assert.equal((await clients.portal(credentialB)).advertising, null);
    const budgetState = await read();
    const budgetRecord = budgetState.state.business.records.find(
      (item) => item.clientRequestId === budgetRequest.requestId,
    );
    assert(budgetRecord.taskId);
    const budgetEvents = (await activity()).filter(
      (event) =>
        event.sourceId === budgetRecord.id &&
        event.action === 'CLIENT_BUDGET_REQUESTED',
    );
    assert.equal(
      budgetEvents.length,
      1,
      'Retried budget requests must not duplicate activity',
    );
    assert.equal(budgetEvents[0].actorType, 'CLIENT');
    assert.equal(budgetEvents[0].actorId, null);
    assert.equal(budgetEvents[0].actorName, 'Client portal');
    assert.equal(budgetEvents[0].subjectMemberId, editor);
    const taskCreated = (await activity()).find(
      (event) =>
        event.taskId === budgetRecord.taskId && event.action === 'TASK_CREATED',
    );
    assert.equal(
      taskCreated.actorType,
      'CLIENT',
      'The reviewing manager did not create the client request',
    );
    assert.equal(taskCreated.actorId, null);
    assert.equal(taskCreated.subjectMemberId, editor);
    assert(
      budgetState.state.notices.some(
        (item) =>
          item.taskId === budgetRecord.taskId && item.recipientId === admin,
      ),
    );
    const transition = (actor, recordRevision, status) =>
      business.command(workspace, actor, actor, {
        action: 'transition',
        id: budgetRecord.id,
        revision: recordRevision,
        status,
        note: 'Verified synthetic workflow',
        evidence: 'https://example.com/evidence',
      });
    await assert.rejects(transition(editor, 1, 'APPROVED'));
    await transition(admin, 1, 'APPROVED');
    await transition(editor, 2, 'APPLIED');
    await assert.rejects(transition(editor, 3, 'VERIFIED'));
    await transition(admin, 3, 'VERIFIED');
    assert.equal(
      (await clients.portal(credentialA)).advertising.requests[0].status,
      'VERIFIED',
    );
    const historicalBudgets = JSON.stringify(
      (await read()).state.business.records.filter(
        (record) => record.clientEngagementId === id,
      ),
    );
    for (const legacyService of ['SEO', 'AI video']) {
      const legacyOperations = await read();
      const legacyEngagement = legacyOperations.state.clients.engagements.find(
        (engagement) => engagement.id === id,
      );
      legacyEngagement.services = [legacyService];
      await runner.manager
        .getRepository(DeliveryOperationsEntity)
        .save(legacyOperations);
      const beforeLegacyReads = JSON.stringify((await read()).state);
      assert.equal(
        (await clients.portal(credentialA)).advertising,
        null,
        'Legacy stale advertising settings cannot expose budgets to ordinary service clients',
      );
      await assert.rejects(clients.respond(credentialA, budgetRequest));
      await assert.rejects(
        clients.respond(credentialA, {
          ...budgetRequest,
          requestId: randomUUID(),
          revision: revision + 1,
        }),
      );
      assert.equal(
        JSON.stringify((await read()).state),
        beforeLegacyReads,
        'Denied legacy budget reads/actions must preserve all stored history',
      );
    }
    const correctedLegacy = await read();
    correctedLegacy.state.clients.engagements.find(
      (engagement) => engagement.id === id,
    ).services = [...services, 'Performance marketing'];
    await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .save(correctedLegacy);
    assert.equal(
      (await clients.portal(credentialA)).advertising.requests[0].status,
      'VERIFIED',
      'Correcting the explicit service restores existing budget history',
    );
    await command(admin, {
      action: 'engagement',
      engagement: {
        id,
        revision: revision + 1,
        projectId,
        name,
        services,
        billing,
        scope,
        allowance,
        contact,
        fields: engagementFields,
        advertising: null,
      },
    });
    await assert.rejects(
      clients.respond(credentialA, {
        ...budgetRequest,
        requestId: randomUUID(),
        revision: revision + 2,
      }),
    );
    assert.equal((await clients.portal(credentialA)).advertising, null);
    assert.equal(
      JSON.stringify(
        (await read()).state.business.records.filter(
          (record) => record.clientEngagementId === id,
        ),
      ),
      historicalBudgets,
      'Removing the service must retain historical budget evidence',
    );
    first.engagement.revision += 2;
    const asset = {
      id: randomUUID(),
      name: `${confidential}.png`,
      mimeType: 'image/png',
      size: 100,
      createdAt: new Date().toISOString(),
    };
    let writes = 0;
    await assert.rejects(
      clients.upload(accessA.token + ':wrong', asset, async () => {
        writes++;
      }),
    );
    assert.equal(writes, 0);
    await assert.rejects(
      clients.upload(credentialA, asset, async () => {
        throw new Error('Synthetic storage failure');
      }),
      /Synthetic storage failure/,
    );
    await clients.upload(credentialA, asset, async (path) => {
      assert(path.includes(first.engagement.id));
      writes++;
    });
    assert.equal(writes, 1);
    assert.equal(
      (await clients.brandAsset(credentialA, asset.id)).asset.name,
      asset.name,
    );
    await assert.rejects(clients.brandAsset(credentialB, asset.id));
    await assert.rejects(
      clients.staffBrandAsset(
        workspace,
        editor,
        editor,
        first.engagement.id,
        asset.id,
      ),
    );
    assert.equal(
      (
        await clients.staffBrandAsset(
          workspace,
          admin,
          admin,
          first.engagement.id,
          asset.id,
        )
      ).asset.id,
      asset.id,
    );
    const requestId = randomUUID();
    await assert.rejects(
      clients.respond(credentialA, {
        action: 'onboard',
        requestId,
        revision: first.engagement.revision,
        answers: {},
      }),
    );
    await clients.respond(credentialA, {
      action: 'onboard',
      requestId,
      revision: first.engagement.revision,
      answers: { [first.fieldId]: confidential },
    });
    await clients.respond(credentialA, {
      action: 'onboard',
      requestId,
      revision: first.engagement.revision,
      answers: { [first.fieldId]: confidential },
    });
    assert.equal((await clients.portal(credentialA)).submissions.length, 1);
    const submitted = (await activity()).filter(
      (event) =>
        event.sourceId === first.engagement.id &&
        event.action === 'CLIENT_ONBOARDING_SUBMITTED',
    );
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].actorType, 'CLIENT');
    await command(admin, {
      action: 'accept',
      engagementId: first.engagement.id,
      submissionId: requestId,
    });
    await command(admin, {
      action: 'accept',
      engagementId: first.engagement.id,
      submissionId: requestId,
    });
    assert.equal(
      (await activity()).filter(
        (event) =>
          event.sourceId === first.engagement.id &&
          event.action === 'CLIENT_ONBOARDING_ACCEPTED' &&
          event.actorId === admin,
      ).length,
      1,
    );
    await assert.rejects(
      clients.respond(credentialB, {
        action: 'onboard',
        requestId: randomUUID(),
        revision: 1,
        answers: { [first.fieldId]: 'Cross-client' },
      }),
    );
    const fields = {
      title: 'Approved SEO report',
      brief: 'INTERNAL SECRET',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: editor,
      reviewerId: admin,
      checklist: [],
      evidence: [],
    };
    const snapshot = await delivery.command(workspace, admin, admin, {
      action: 'create',
      projectId: first.project.id,
      fields,
    });
    const taskId = snapshot.tasks.find(
      (item) => item.title === fields.title,
    ).id;
    const task = () =>
      runner.manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId: workspace.id, taskId });
    const share = () =>
      command(admin, {
        action: 'share',
        engagementId: first.engagement.id,
        taskId,
        revision: 1,
        kind: 'SUBMISSION',
      });
    await assert.rejects(share());
    await delivery.command(workspace, editor, editor, {
      action: 'submit',
      taskId,
      revision: (await task()).revision,
      description: 'Client-visible report',
      evidence: ['https://example.com/report'],
    });
    await delivery.command(workspace, admin, admin, {
      action: 'review',
      taskId,
      revision: (await task()).revision,
      decision: 'APPROVED',
      feedback: 'INTERNAL FEEDBACK',
    });
    await assert.rejects(
      command(admin, {
        action: 'share',
        engagementId: second.engagement.id,
        taskId,
        revision: (await task()).revision,
        kind: 'SUBMISSION',
      }),
    );
    const shared = await command(admin, {
      action: 'share',
      engagementId: first.engagement.id,
      taskId,
      revision: (await task()).revision,
      kind: 'SUBMISSION',
    });
    const shareId = shared.shares.find((item) => item.taskId === taskId).id;
    if (process.argv.includes('--browser-fixture')) {
      const users = await runner.query(
        'SELECT "userId" FROM core."userWorkspace" WHERE id=ANY($1::uuid[])',
        [[admin, editor, outsider]],
      );
      require('node:fs').writeFileSync(
        '/tmp/otogrow-phase5-browser.json',
        JSON.stringify({
          workspaceId: workspace.id,
          schema: workspace.databaseSchema,
          memberIds: [admin, editor, outsider],
          userIds: users.map((item) => item.userId),
          companyIds: [companyA, companyB],
          projectIds: [first.project.id, second.project.id],
          engagementIds: [first.engagement.id, second.engagement.id],
          taskId,
          token: accessA.token,
          code: accessA.accessCode,
        }),
        { mode: 0o600 },
      );
      await runner.commitTransaction();
      process.stdout.write('Created disposable Phase 5 browser fixture.\n');
      return;
    }
    const publicPayload = await clients.portal(credentialA);
    assert.equal(publicPayload.shares.length, 1);
    assert(!JSON.stringify(publicPayload).includes('INTERNAL'));
    assert(!JSON.stringify(publicPayload).includes(admin));
    assert.equal((await clients.portal(credentialB)).shares.length, 0);
    await assert.rejects(
      clients.respond(credentialB, {
        action: 'review',
        requestId: randomUUID(),
        shareId,
        decision: 'APPROVED',
        comment: 'Guessing',
      }),
    );
    assert.equal(
      (await read()).state.fulfilments.filter((item) => item.taskId === taskId)
        .length,
      0,
    );
    await operations.command(workspace, admin, admin, {
      action: 'delivered',
      taskId,
      revision: (await task()).revision,
      note: 'Synthetic delivery',
    });
    const previous = (await read()).state.fulfilments.find(
      (item) => item.taskId === taskId,
    );
    const review = {
      action: 'review',
      requestId: randomUUID(),
      shareId,
      decision: 'CHANGES_REQUESTED',
      comment: confidential,
    };
    await clients.respond(credentialA, review);
    await clients.respond(credentialA, review);
    assert.equal(
      (await clients.portal(credentialA)).shares[0].reviews.length,
      1,
    );
    const reviewed = (await activity()).filter(
      (event) =>
        event.sourceId === shareId && event.action === 'CLIENT_SHARE_REVIEWED',
    );
    assert.equal(reviewed.length, 1);
    assert.equal(reviewed[0].actorType, 'CLIENT');
    assert.equal(reviewed[0].actorId, null);
    assert.equal(reviewed[0].subjectMemberId, editor);
    assert.equal(reviewed[0].outcome, 'CHANGES_REQUESTED');
    assert.equal(reviewed[0].clientId, companyA);
    assert.equal(reviewed[0].taskName, fields.title);
    assert.equal(
      (await read()).state.fulfilments.find((item) => item.taskId === taskId)
        .history.length,
      previous.history.length + 1,
    );
    await assert.rejects(
      operations.command(workspace, admin, admin, {
        action: 'fulfilment',
        taskId,
        cycle: previous.cycle,
        historyLength: previous.history.length,
        decision: 'FULFILLED',
        note: 'Stale confirmation',
      }),
    );
    assert(
      (await task()).details.events.some(
        (item) => item.action === 'CLIENT_CHANGES_REQUESTED',
      ),
    );
    for (const decision of ['COMMENT', 'APPROVED'])
      await clients.respond(credentialA, {
        action: 'review',
        requestId: randomUUID(),
        shareId,
        decision,
        comment: confidential,
      });
    assert.deepEqual(
      (await activity())
        .filter(
          (event) =>
            event.sourceId === shareId &&
            event.action === 'CLIENT_SHARE_REVIEWED',
        )
        .map((event) => event.outcome)
        .sort(),
      ['APPROVED', 'CHANGES_REQUESTED', 'RECORDED'],
    );
    await command(admin, { action: 'withdraw', id: shareId });
    assert.equal((await clients.portal(credentialA)).shares.length, 0);
    await assert.rejects(
      clients.respond(credentialA, { ...review, requestId: randomUUID() }),
    );
    const rotated = await command(admin, {
      action: 'link',
      engagementId: first.engagement.id,
    });
    await assert.rejects(clients.portal(credentialA));
    await assert.rejects(clients.brandAsset(credentialA, asset.id));
    const active = rotated.links.find(
      (item) => item.engagementId === first.engagement.id && !item.revokedAt,
    );
    await command(admin, { action: 'revoke', id: active.id });
    await command(admin, { action: 'revoke', id: active.id });
    await assert.rejects(
      clients.portal(rotated.token + ':' + rotated.accessCode),
    );
    const state = await read();
    state.state.clients.links.find(
      (item) => item.engagementId === second.engagement.id,
    ).expiresAt = '2020-01-01T00:00:00Z';
    await runner.manager.getRepository(DeliveryOperationsEntity).save(state);
    await assert.rejects(clients.portal(credentialB));
    const allEvents = await activity();
    for (const expected of [
      'CLIENT_ENGAGEMENT_CREATED',
      'CLIENT_ENGAGEMENT_UPDATED',
      'CLIENT_PORTAL_CREATED',
      'CLIENT_PORTAL_ROTATED',
      'CLIENT_PORTAL_REVOKED',
      'CLIENT_BRAND_ASSET_UPLOADED',
      'CLIENT_ONBOARDING_SUBMITTED',
      'CLIENT_ONBOARDING_ACCEPTED',
      'CLIENT_SHARE_CREATED',
      'CLIENT_SHARE_WITHDRAWN',
      'CLIENT_SHARE_REVIEWED',
      'CLIENT_BUDGET_REQUESTED',
    ])
      assert(
        allEvents.some((event) => event.action === expected),
        `Missing ${expected}`,
      );
    assert.equal(
      allEvents.filter(
        (event) =>
          event.sourceId === first.engagement.id &&
          event.action === 'CLIENT_PORTAL_REVOKED',
      ).length,
      1,
    );
    const serializedActivity = JSON.stringify(allEvents);
    const savedState = await read();
    for (const secret of [
      confidential,
      'INTERNAL SECRET',
      'INTERNAL FEEDBACK',
      'Client-visible report',
      'https://example.com/report',
      accessA.token,
      accessA.accessCode,
      accessB.token,
      accessB.accessCode,
      rotated.token,
      rotated.accessCode,
      ...savedState.state.clients.links.flatMap((link) => [
        link.hash,
        link.codeHash,
      ]),
    ])
      assert(
        !serializedActivity.includes(secret),
        'Activity must not retain private contents or portal credentials',
      );
    process.stdout.write(
      'PASS: client permissions and full portal lifecycle; explicit performance-marketing budget entitlement, contradictory new/edited configuration rejection, legacy SEO/video denial, service-removal revocation and preserved budget history; durable staff/client activity with correct budget task attribution, idempotency, atomic failure rollback, version/subject snapshots and no private contents or credentials. Rolled back; no external calls.\n',
    );
  } finally {
    axios.post = originalPost;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
