const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryBusinessService,
} = require('../dist/modules/delivery/business/delivery-business.service');
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
  try {
    const [workspace] = await runner.query(
      `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(),
      manager = randomUUID(),
      employee = randomUUID(),
      outsider = randomUUID();
    for (const member of [admin, manager, employee, outsider]) {
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
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName") VALUES ($1,$2,$3,'Business fixture')`,
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
              'Synthetic failure after business and activity writes',
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
    let modelCalls = 0;
    let modelHook = null;
    const model = new MockLanguageModelV3({
      doGenerate: async (request) => {
        modelCalls++;
        assert(
          JSON.stringify(request.prompt).includes('Selected inbound fixture'),
        );
        assert(!JSON.stringify(request.prompt).includes('Unsent reply'));
        if (modelHook) await modelHook();
        return {
          content: [
            {
              type: 'text',
              text: 'Thank you. [NEEDS CONFIRMATION: delivery date]',
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 100,
              noCache: 100,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 20, text: 20, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    const aiBudget = await makeBudgetFixture(scoped, access, workspace, [
      { modelId: 'fixture', kind: 'TEXT' },
    ]);
    const business = new DeliveryBusinessService(
      scoped,
      delivery,
      {
        getModel: () => ({ model }),
        validateModelAvailability: () => {},
      },
      aiBudget,
      access,
    );
    const activity = () =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "actorId"=ANY($2::uuid[]) ORDER BY "recordedAt",id',
        [workspace.id, [admin, manager, employee, outsider]],
      );
    const command = async (actor, input) => {
      const before = await activity();
      try {
        return await business.command(workspace, actor, actor, input);
      } catch (error) {
        if (input.action !== 'aiDraft')
          assert.deepEqual(
            await activity(),
            before,
            'Rejected business writes must not record success activity',
          );
        throw error;
      }
    };
    const snapshot = (actor) => business.snapshot(workspace, actor, actor);
    const roleDirectory = await access.directory(workspace.id, admin, admin);
    const managerRole = roleDirectory.roles.find(
      (role) =>
        role.capabilities.includes('delivery.manage') &&
        !role.capabilities.includes('workspace.admin'),
    );
    assert(managerRole);
    await access.assignRoles(workspace.id, admin, admin, {
      memberId: manager,
      roleIds: [managerRole.id],
      roleRevisions: [{ id: managerRole.id, revision: managerRole.revision }],
      revision: 0,
    });
    const project = (
      await delivery.command(workspace, admin, admin, {
        action: 'project',
        name: 'Business fixture',
        companyId: null,
        memberIds: [employee],
      })
    ).projects.find((item) => item.name === 'Business fixture');
    const create = async (actor, record) => {
      const result = await command(actor, {
        action: 'save',
        record: { revision: 0, projectId: project.id, ...record },
      });
      return result.records.find((item) => item.title === record.title);
    };
    let conversation = await create(admin, {
      kind: 'CONVERSATION',
      title: 'Private client',
      channel: 'EMAIL',
      sourceUrl: null,
      ownerId: admin,
      private: true,
      grants: [{ memberId: employee, read: true, send: true }],
    });
    const beforeReads = await activity();
    assert(
      !(await snapshot(employee)).records.some(
        (item) => item.id === conversation.id,
      ),
    );
    await command(admin, { action: 'seen', id: conversation.id });
    assert.deepEqual(
      await activity(),
      beforeReads,
      'Reading and marking seen must not count as completed work',
    );
    assert(
      !(await snapshot(manager)).records.some(
        (item) => item.id === conversation.id,
      ),
    );
    const fields = {
      kind: 'CONVERSATION',
      title: conversation.title,
      channel: 'EMAIL',
      sourceUrl: null,
      ownerId: admin,
      private: false,
      grants: [{ memberId: employee, read: true, send: false }],
      projectId: project.id,
    };
    await command(admin, {
      action: 'save',
      record: { ...fields, id: conversation.id, revision: 1 },
    });
    assert(
      (await snapshot(employee)).records.some(
        (item) => item.id === conversation.id,
      ),
    );
    await assert.rejects(
      command(employee, {
        action: 'inboxEntry',
        id: conversation.id,
        revision: 2,
        entryKind: 'DRAFT',
        text: 'No send grant',
        sourceUrl: null,
      }),
    );
    await command(admin, {
      action: 'save',
      record: {
        ...fields,
        id: conversation.id,
        revision: 2,
        grants: [{ memberId: employee, read: true, send: true }],
      },
    });
    await command(employee, {
      action: 'inboxEntry',
      id: conversation.id,
      revision: 3,
      entryKind: 'DRAFT',
      text: 'Unsent reply',
      sourceUrl: null,
    });
    assert.equal(
      (await snapshot(employee)).inbox.filter(
        (item) => item.conversationId === conversation.id,
      ).length,
      1,
    );
    await command(admin, {
      action: 'inboxEntry',
      id: conversation.id,
      revision: 4,
      entryKind: 'INBOUND_NOTE',
      text: 'Selected inbound fixture',
      sourceUrl: null,
    });
    const source = (await snapshot(employee)).inbox.find(
      (entry) =>
        entry.conversationId === conversation.id &&
        entry.kind === 'INBOUND_NOTE',
    );
    const agentRepository = runner.manager.getRepository(DeliveryAgentEntity);
    const agent = await agentRepository.save(
      agentRepository.create({
        workspaceId: workspace.id,
        configuration: {
          name: 'Inbox fixture agent',
          purpose: 'Reply drafts',
          kind: 'COPY',
          enabled: true,
          instructions: 'Use only provided facts',
          requiredInputs: [],
          outputFormat: 'findings_and_edits',
          tools: [],
          modelId: 'fixture',
          projectIds: [project.id],
          roles: ['MEMBER'],
          dailyRunLimit: 1,
          maxOutputTokens: 256,
          humanConfirmation: true,
        },
      }),
    );
    await command(employee, {
      action: 'aiDraft',
      id: conversation.id,
      revision: 5,
      agentId: agent.id,
      sourceIds: [source.id],
    });
    const aiDraft = (await snapshot(employee)).inbox
      .filter((entry) => entry.conversationId === conversation.id)
      .at(-1);
    assert.deepEqual(aiDraft.sourceIds, [source.id]);
    assert.equal(aiDraft.kind, 'DRAFT');
    assert.equal(modelCalls, 1);
    const completedDraft = (await activity()).filter(
      (event) => event.action === 'INBOX_DRAFT_SUCCEEDED',
    );
    assert.equal(completedDraft.length, 1);
    assert.equal(completedDraft[0].actorType, 'AGENT');
    assert.equal(completedDraft[0].actorId, employee);
    assert.equal(completedDraft[0].agentName, 'Inbox fixture agent');
    const beforeDailyLimit = await activity();
    await assert.rejects(
      command(employee, {
        action: 'aiDraft',
        id: conversation.id,
        revision: 6,
        agentId: agent.id,
        sourceIds: [source.id],
      }),
    );
    assert.equal(modelCalls, 1);
    assert.deepEqual(await activity(), beforeDailyLimit);
    agent.configuration.dailyRunLimit = 3;
    agent.version++;
    await agentRepository.save(agent);
    modelHook = () =>
      command(admin, {
        action: 'save',
        record: { ...fields, id: conversation.id, revision: 6, grants: [] },
      });
    await assert.rejects(
      command(employee, {
        action: 'aiDraft',
        id: conversation.id,
        revision: 6,
        agentId: agent.id,
        sourceIds: [source.id],
      }),
    );
    assert.equal(modelCalls, 2);
    modelHook = null;
    const afterRevocation = await snapshot(admin);
    assert.equal(
      (await activity()).filter(
        (event) => event.action === 'INBOX_DRAFT_SUCCEEDED',
      ).length,
      1,
    );
    assert.equal(
      (await activity()).filter(
        (event) =>
          event.action === 'INBOX_DRAFT_FAILED' && event.outcome === 'FAILED',
      ).length,
      1,
    );
    assert.equal(
      afterRevocation.inbox.filter(
        (entry) =>
          entry.conversationId === conversation.id && entry.sourceIds.length,
      ).length,
      1,
    );
    assert.equal(
      (await snapshot(employee)).inbox.filter(
        (item) => item.conversationId === conversation.id,
      ).length,
      0,
    );
    const paidDrafts = await runner.query(
      `SELECT state,"actualMicroUsd" FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"='INBOX_DRAFT'`,
      [workspace.id],
    );
    assert.equal(paidDrafts.length, 2);
    assert(
      paidDrafts.every(
        (spend) =>
          spend.state === 'SETTLED' && BigInt(spend.actualMicroUsd) > 0,
      ),
      'Completed and discarded replies both retain provider charges',
    );
    let receivable = await create(admin, {
      kind: 'FINANCE',
      title: 'Invoice fixture',
      currency: 'USD',
      amount: 12345,
      date: '2026-10-24',
      category: 'RECEIVABLE',
      dueDate: '2026-11-01',
      externalReference: randomUUID(),
      evidenceUrl: null,
      notes: '',
    });
    const beforeFailure = await snapshot(admin);
    failAfterTransaction = true;
    await assert.rejects(
      create(admin, {
        kind: 'FINANCE',
        title: 'Must roll back',
        currency: 'USD',
        amount: 98765,
        date: '2026-10-24',
        category: 'EXPENSE',
        dueDate: null,
        externalReference: randomUUID(),
        evidenceUrl: null,
        notes: 'Never persisted',
      }),
      /Synthetic failure/,
    );
    assert.deepEqual(
      await snapshot(admin),
      beforeFailure,
      'A failed transaction must roll back the business mutation and activity together',
    );
    assert(
      !(await snapshot(employee)).records.some(
        (item) => item.id === receivable.id,
      ),
    );
    await assert.rejects(
      command(employee, {
        action: 'transition',
        id: receivable.id,
        revision: 1,
        status: 'PAID',
        note: 'No authority',
        evidence: 'https://example.com/receipt',
      }),
    );
    await command(admin, {
      action: 'transition',
      id: receivable.id,
      revision: 1,
      status: 'PAID',
      note: 'Payment confirmed',
      evidence: 'https://example.com/receipt',
    });
    await assert.rejects(
      command(admin, {
        action: 'transition',
        id: receivable.id,
        revision: 1,
        status: 'PAID',
        note: 'Duplicate',
        evidence: 'https://example.com/receipt',
      }),
    );
    assert.equal(
      (await snapshot(admin)).records.filter(
        (item) =>
          item.kind === 'FINANCE' &&
          item.externalReference === `receivable:${receivable.id}`,
      ).length,
      1,
    );
    await assert.rejects(
      command(admin, {
        action: 'transition',
        id: receivable.id,
        revision: 2,
        status: 'VOID',
        note: 'Cannot orphan a paid receipt',
        evidence: null,
      }),
    );
    const receipt = (await snapshot(admin)).records.find(
      (item) =>
        item.kind === 'FINANCE' &&
        item.externalReference === `receivable:${receivable.id}`,
    );
    await command(admin, {
      action: 'transition',
      id: receipt.id,
      revision: 1,
      status: 'VOID',
      note: 'Synthetic payment reversal',
      evidence: null,
    });
    assert.equal(
      (await snapshot(admin)).records.find((item) => item.id === receivable.id)
        .status,
      'OPEN',
    );
    await command(admin, {
      action: 'transition',
      id: receivable.id,
      revision: 3,
      status: 'PAID',
      note: 'Replacement payment',
      evidence: 'https://example.com/replacement',
    });
    assert.equal(
      (await snapshot(admin)).records.filter(
        (item) =>
          item.kind === 'FINANCE' &&
          item.externalReference === `receivable:${receivable.id}` &&
          item.status !== 'VOID',
      ).length,
      1,
    );
    let budget = await create(employee, {
      kind: 'BUDGET',
      title: 'Budget fixture',
      currency: 'USD',
      amount: 25000,
      channel: 'META',
      period: 'DAILY',
      marketerId: employee,
      reason: 'Test scale-up',
    });
    const transition = async (actor, status, revision, evidence = null) =>
      command(actor, {
        action: 'transition',
        id: budget.id,
        revision,
        status,
        note: 'Synthetic verification',
        evidence,
      });
    await transition(employee, 'REVIEW', 1);
    await assert.rejects(transition(employee, 'APPROVED', 2));
    await transition(admin, 'APPROVED', 2);
    await transition(employee, 'APPLIED', 3, 'https://example.com/meta');
    await transition(manager, 'VERIFIED', 4, 'https://example.com/check');
    await assert.rejects(command(outsider, { action: 'seen', id: budget.id }));
    await command(admin, {
      action: 'assign',
      id: budget.id,
      revision: 5,
      assigneeId: employee,
      reviewerId: manager,
      dueDate: '2026-11-01',
    });
    const assigned = (await snapshot(admin)).records.find(
      (item) => item.id === budget.id,
    );
    assert(assigned.taskId);
    const assignmentEvent = (await activity()).find(
      (event) =>
        event.sourceId === budget.id &&
        event.action === 'BUSINESS_TASK_ASSIGNED',
    );
    assert.equal(assignmentEvent.actorId, admin);
    assert.equal(assignmentEvent.subjectMemberId, employee);
    assert.equal(assignmentEvent.taskId, assigned.taskId);
    const financeEvents = (await activity()).filter(
      (event) => event.sourceType === 'finance',
    );
    assert.equal(
      financeEvents.filter(
        (event) => event.action === 'FINANCE_RECEIPT_CREATED',
      ).length,
      2,
    );
    assert.equal(
      financeEvents.filter((event) => event.action === 'FINANCE_PAID').length,
      2,
    );
    assert.equal(
      financeEvents.filter((event) => event.action === 'FINANCE_VOID').length,
      1,
    );
    const reopened = financeEvents.find(
      (event) => event.action === 'FINANCE_RECEIVABLE_REOPENED',
    );
    assert.deepEqual(
      reopened.changes.find((change) => change.field === 'state'),
      { field: 'state', before: 'PAID', after: 'OPEN' },
    );
    await assert.rejects(
      command(admin, {
        action: 'assign',
        id: budget.id,
        revision: 6,
        assigneeId: employee,
        reviewerId: manager,
        dueDate: '2026-11-01',
      }),
    );
    const confidential = `PRIVATE-CONTENT-${randomUUID()}`;
    const examples = [
      {
        kind: 'AD_REPORT',
        title: 'Ad report fixture',
        date: '2026-10-24',
        channel: 'META',
        currency: 'USD',
        spend: 100,
        attributedRevenue: 200,
        shopifyRevenue: null,
        purchases: 1,
        qualifiedLeads: 0,
        bookedCalls: 0,
        webinarRegistrations: 0,
        goal: 'PURCHASES',
        targetCost: 100,
        recommendation: confidential,
        sourceUrl: `https://example.com/${confidential}`,
        marketerId: employee,
      },
      {
        kind: 'CONTENT',
        title: 'Content fixture',
        channel: 'X',
        account: confidential,
        ownerId: employee,
        scheduledDate: '2026-11-01',
        copy: confidential,
        assetUrl: `https://example.com/${confidential}`,
        notes: confidential,
      },
      {
        kind: 'COMPETITOR',
        title: 'Competitor fixture',
        channel: 'META',
        sourceUrl: `https://example.com/${confidential}`,
        observedDate: '2026-10-24',
        observation: confidential,
        interpretation: confidential,
        suggestedIdea: confidential,
      },
      {
        kind: 'RELEASE',
        title: 'Release fixture',
        ownerId: employee,
        targetDate: '2026-11-01',
        repositoryUrl: `https://example.com/${confidential}`,
        notes: confidential,
        checks: [{ id: randomUUID(), label: confidential, done: false }],
      },
    ];
    for (const example of examples) {
      const creator = example.kind === 'COMPETITOR' ? manager : employee;
      const record = await create(creator, example);
      if (example.kind === 'RELEASE')
        await assert.rejects(
          command(employee, {
            action: 'transition',
            id: record.id,
            revision: 1,
            status: 'REVIEW',
            note: confidential,
            evidence: null,
          }),
        );
      await command(creator, {
        action: 'save',
        record: {
          ...example,
          ...(example.kind === 'RELEASE'
            ? {
                checks: example.checks.map((check) => ({
                  ...check,
                  done: true,
                })),
              }
            : {}),
          id: record.id,
          projectId: project.id,
          revision: 1,
        },
      });
      await command(creator, {
        action: 'transition',
        id: record.id,
        revision: 2,
        status: 'REVIEW',
        note: confidential,
        evidence: null,
      });
      await command(admin, {
        action: 'transition',
        id: record.id,
        revision: 3,
        status: 'APPROVED',
        note: confidential,
        evidence: null,
      });
      if (example.kind === 'CONTENT')
        await command(employee, {
          action: 'transition',
          id: record.id,
          revision: 4,
          status: 'PUBLISHED',
          note: confidential,
          evidence: `https://example.com/${confidential}`,
        });
      if (example.kind === 'RELEASE')
        await command(manager, {
          action: 'transition',
          id: record.id,
          revision: 4,
          status: 'RELEASED',
          note: confidential,
          evidence: `https://example.com/${confidential}`,
        });
      const events = (await activity()).filter(
        (event) => event.sourceId === record.id,
      );
      assert(
        events.some(
          (event) =>
            event.action === `${example.kind}_CREATED` &&
            event.actorId === creator,
        ),
      );
      assert(
        events.some((event) => event.action === `${example.kind}_UPDATED`),
      );
      assert(
        events.some(
          (event) =>
            event.action === `${example.kind}_APPROVED` &&
            event.actorId === admin &&
            event.outcome === 'APPROVED',
        ),
      );
    }
    const serializedActivity = JSON.stringify(await activity());
    for (const sensitive of [
      confidential,
      'Selected inbound fixture',
      'Unsent reply',
      'NEEDS CONFIRMATION',
      'Use only provided facts',
      'receivable:',
      'https://example.com/receipt',
    ])
      assert(
        !serializedActivity.includes(sensitive),
        `Activity exposed ${sensitive}`,
      );
    const conversationChanges = (await activity()).filter(
      (event) =>
        event.sourceId === conversation.id &&
        event.action === 'CONVERSATION_UPDATED',
    );
    assert(
      conversationChanges.some((event) =>
        event.changes.some(
          (change) =>
            change.field === 'sendMemberIds' &&
            change.after === 'Business fixture',
        ),
      ),
    );
    const budgetStages = (await activity())
      .filter((event) => event.sourceId === budget.id)
      .sort(
        (left, right) =>
          Number(
            left.changes.find((change) => change.field === 'revision')?.after,
          ) -
          Number(
            right.changes.find((change) => change.field === 'revision')?.after,
          ),
      )
      .flatMap((event) =>
        event.changes
          .filter((change) => change.field === 'state')
          .map((change) => change.after),
      );
    assert.deepEqual(budgetStages, [
      'DRAFT',
      'REVIEW',
      'APPROVED',
      'APPLIED',
      'VERIFIED',
    ]);
    // Finance-only roles must not inherit project, inbox or delivery administration.
    let financeDirectory = await access.saveRole(workspace.id, admin, admin, {
      name: 'Finance reader fixture',
      description: '',
      capabilities: ['finance.read'],
    });
    const readerRole = financeDirectory.roles.find(
      (role) => role.name === 'Finance reader fixture',
    );
    financeDirectory = await access.saveRole(workspace.id, admin, admin, {
      name: 'Finance editor fixture',
      description: '',
      capabilities: ['finance.manage'],
    });
    const editorRole = financeDirectory.roles.find(
      (role) => role.name === 'Finance editor fixture',
    );
    const assignFinance = async (roleIds) => {
      const current = await access.directory(workspace.id, admin, admin);
      return access.assignRoles(workspace.id, admin, admin, {
        memberId: outsider,
        roleIds,
        revision: current.members.find((member) => member.memberId === outsider)
          .revision,
        roleRevisions: current.roles
          .filter((role) => roleIds.includes(role.id))
          .map(({ id, revision }) => ({ id, revision })),
      });
    };
    await assignFinance([readerRole.id]);
    const readerSnapshot = await snapshot(outsider);
    assert(
      readerSnapshot.financeAccess.read && !readerSnapshot.financeAccess.manage,
    );
    assert(readerSnapshot.records.some((record) => record.kind === 'FINANCE'));
    assert(
      !readerSnapshot.records.some((record) => record.kind === 'CONVERSATION'),
    );
    assert(
      readerSnapshot.financeProjects.some((item) => item.id === project.id),
    );
    assert(
      !(await delivery.snapshot(workspace, outsider, outsider)).projects.some(
        (item) => item.id === project.id,
      ),
    );
    const expenseFields = {
      kind: 'FINANCE',
      title: 'Delegated expense fixture',
      category: 'EXPENSE',
      amount: 200,
      currency: 'USD',
      date: '2026-10-26',
      dueDate: null,
      externalReference: randomUUID(),
      evidenceUrl: null,
      notes: '',
    };
    await assert.rejects(create(outsider, expenseFields));
    const existingFinance = readerSnapshot.records.find(
      (record) => record.kind === 'FINANCE' && record.status !== 'VOID',
    );
    await assert.rejects(
      command(outsider, {
        action: 'transition',
        id: existingFinance.id,
        revision: existingFinance.revision,
        status: 'VOID',
        note: 'Denied reader',
        evidence: null,
      }),
    );
    await assignFinance([readerRole.id, editorRole.id]);
    const editorAccess = await access.getAccess(workspace.id, outsider);
    assert(
      editorAccess.grants.some(
        (grant) =>
          grant.capability === 'finance.read' &&
          grant.sourceId === editorRole.id,
      ),
    );
    assert.deepEqual(editorAccess.capabilities.sort(), [
      'finance.manage',
      'finance.read',
    ]);
    let delegated = await create(outsider, expenseFields);
    assert.equal(delegated.projectId, project.id);
    await assert.rejects(
      create(outsider, {
        ...expenseFields,
        title: 'Foreign allocation',
        projectId: randomUUID(),
        externalReference: randomUUID(),
      }),
    );
    await command(outsider, {
      action: 'transition',
      id: delegated.id,
      revision: delegated.revision,
      status: 'VOID',
      note: 'Correct delegated expense',
      evidence: null,
    });
    const delegatedInvoice = await create(outsider, {
      ...expenseFields,
      title: 'Delegated invoice',
      category: 'RECEIVABLE',
      dueDate: '2026-11-01',
      externalReference: randomUUID(),
    });
    await command(outsider, {
      action: 'transition',
      id: delegatedInvoice.id,
      revision: delegatedInvoice.revision,
      status: 'PAID',
      note: 'Payment evidence',
      evidence: 'https://example.com/receipt',
    });
    const delegatedReceipt = (await snapshot(outsider)).records.find(
      (record) =>
        record.externalReference === `receivable:${delegatedInvoice.id}`,
    );
    assert(delegatedReceipt);
    await assert.rejects(access.directory(workspace.id, outsider, outsider));
    await assignFinance([readerRole.id]);
    await assert.rejects(
      command(outsider, {
        action: 'transition',
        id: delegatedReceipt.id,
        revision: delegatedReceipt.revision,
        status: 'VOID',
        note: 'Revoked edit',
        evidence: null,
      }),
    );
    await assignFinance([]);
    const revoked = await snapshot(outsider);
    assert.equal(revoked.financeAccess.read, false);
    assert.equal(revoked.finance.length, 0);
    assert.equal(revoked.financeProjects.length, 0);
    assert(!revoked.records.some((record) => record.kind === 'FINANCE'));
    assert(
      (await activity()).some(
        (event) =>
          event.actorId === outsider &&
          event.action === 'FINANCE_RECEIPT_CREATED',
      ),
    );
    // Conversation grants follow current named roles, including roles with no global capabilities.
    const makeConversationRole = async (name) => (await access.saveRole(workspace.id, admin, admin, {
      name, description: '', capabilities: [],
    })).roles.find((role) => role.name === name);
    const viewRole = await makeConversationRole('Client inbox viewer fixture');
    const replyRole = await makeConversationRole('Client inbox reply fixture');
    const assignConversationRoles = async (roleIds) => {
      const current = await access.directory(workspace.id, admin, admin);
      return access.assignRoles(workspace.id, admin, admin, {
        memberId: employee, roleIds,
        revision: current.members.find((member) => member.memberId === employee).revision,
        roleRevisions: current.roles.filter((role) => roleIds.includes(role.id)).map(({id, revision}) => ({id, revision})),
      });
    };
    const scopedFields = {...fields, title: 'Role scoped inbox fixture', grants: [], roleGrants: [
      {roleId: viewRole.id, read: true, send: false},
      {roleId: replyRole.id, read: true, send: true},
    ]};
    const scopedConversation = await create(admin, scopedFields);
    const currentConversation = async () => (await snapshot(admin)).records.find((record) => record.id === scopedConversation.id);
    const saveConversation = async (changes) => command(admin, {action: 'save', record: {
      ...scopedFields, id: scopedConversation.id, revision: (await currentConversation()).revision, ...changes,
    }});
    const postDraft = async () => command(employee, {action: 'inboxEntry', id: scopedConversation.id,
      revision: (await currentConversation()).revision, entryKind: 'DRAFT', text: 'Role permitted draft', sourceUrl: null});
    assert(!(await snapshot(employee)).records.some((record) => record.id === scopedConversation.id));
    await assignConversationRoles([viewRole.id]);
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, false);
    await assert.rejects(postDraft());
    await assignConversationRoles([viewRole.id, replyRole.id]);
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, true);
    await postDraft();
    await assignConversationRoles([replyRole.id]);
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, true);
    await command(employee, {action: 'seen', id: scopedConversation.id});
    await assignConversationRoles([]);
    const scopedRevoked = await snapshot(employee);
    assert(!scopedRevoked.records.some((record) => record.id === scopedConversation.id));
    assert(!scopedRevoked.inbox.some((entry) => entry.conversationId === scopedConversation.id));
    assert.equal(scopedRevoked.seen[scopedConversation.id], undefined);
    assert.equal(scopedRevoked.conversationAccess[scopedConversation.id], undefined);
    await assert.rejects(postDraft());
    await saveConversation({grants: [{memberId: employee, read: true, send: false}]});
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, false);
    await assignConversationRoles([replyRole.id]);
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, true);
    await saveConversation({private: true});
    assert(!(await snapshot(employee)).records.some((record) => record.id === scopedConversation.id));
    await assert.rejects(postDraft());
    await saveConversation({private: false});
    await assert.rejects(saveConversation({roleGrants: [{roleId: randomUUID(), read: true, send: true}]}));
    await assert.rejects(saveConversation({roleGrants: [scopedFields.roleGrants[0], scopedFields.roleGrants[0]]}));
    await assert.rejects(saveConversation({roleGrants: [{roleId: viewRole.id, read: false, send: true}]}));
    await assert.rejects(command(employee, {action: 'save', record: {...scopedFields, id: scopedConversation.id, revision: (await currentConversation()).revision}}));
    const {roleGrants: omitted, ...olderClientFields} = scopedFields;
    await command(admin, {action: 'save', record: {...olderClientFields, id: scopedConversation.id, revision: (await currentConversation()).revision}});
    assert.deepEqual((await currentConversation()).roleGrants, omitted, 'An older client must not silently erase role grants');
    assert((await activity()).some((event) => event.sourceId === scopedConversation.id && event.changes.some((change) => change.field === 'sendRoles' && change.after.includes(replyRole.name))));
    await command(admin, {action: 'inboxEntry', id: scopedConversation.id, revision: (await currentConversation()).revision,
      entryKind: 'INBOUND_NOTE', text: 'Selected inbound fixture for role revocation', sourceUrl: null});
    const roleSource = (await snapshot(employee)).inbox.find((entry) => entry.conversationId === scopedConversation.id && entry.kind === 'INBOUND_NOTE');
    const draftsBeforeRevocation = (await snapshot(admin)).inbox.filter((entry) => entry.conversationId === scopedConversation.id && entry.kind === 'DRAFT').length;
    const roleTestAgent = await runner.manager.getRepository(DeliveryAgentEntity).findOneByOrFail({ id: agent.id });
    roleTestAgent.configuration.dailyRunLimit = 100;
    await runner.manager.getRepository(DeliveryAgentEntity).save(roleTestAgent);
    modelHook = () => assignConversationRoles([]);
    await assert.rejects(command(employee, {action: 'aiDraft', id: scopedConversation.id, revision: (await currentConversation()).revision, agentId: agent.id, sourceIds: [roleSource.id]}));
    modelHook = null;
    assert.equal((await snapshot(admin)).inbox.filter((entry) => entry.conversationId === scopedConversation.id && entry.kind === 'DRAFT').length, draftsBeforeRevocation);
    assert(!(await snapshot(outsider)).records.some((record) => record.id === scopedConversation.id));
    // Removing an assistant role cannot save generated text even when conversation access remains.
    await assignConversationRoles([replyRole.id, viewRole.id]);
    const assistantRepository = runner.manager.getRepository(DeliveryAgentEntity);
    const namedReplyAgent = await assistantRepository.findOneByOrFail({ id: agent.id });
    namedReplyAgent.configuration.roleIds = [viewRole.id];
    await assistantRepository.save(namedReplyAgent);
    const namedDraft = async () => command(employee, { action: 'aiDraft', id: scopedConversation.id,
      revision: (await currentConversation()).revision, agentId: agent.id, sourceIds: [roleSource.id] });
    modelHook = () => assignConversationRoles([replyRole.id]);
    await assert.rejects(namedDraft(), /discarded/);
    modelHook = null;
    assert.equal((await snapshot(employee)).conversationAccess[scopedConversation.id].draft, true);
    await assert.rejects(namedDraft(), /role and this project/);
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [employee],
    );
    await assert.rejects(snapshot(employee));
    process.stdout.write(
      'PASS: role-scoped conversation unions/revocation/private override/legacy preservation/AI completion, business permissions and transitions; durable create/update/review/assignment, receipt/reversal and AI draft activity; denied/failed-write atomicity; actor/subject attribution and secret exclusion. Rolled back; no external calls.\n',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
