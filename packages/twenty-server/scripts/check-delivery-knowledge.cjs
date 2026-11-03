const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryKnowledgeService,
} = require('../dist/modules/delivery/knowledge/delivery-knowledge.service');
const {
  readDeliveryKnowledgeContext,
  assertDeliveryKnowledgeCurrent,
} = require('../dist/modules/delivery/knowledge/delivery-knowledge-context');
(async () => {
  assert(
    !process.argv.some((arg) => ['--live', '--browser-fixture'].includes(arg)),
    'This script is rollback-only.',
  );
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
    assert.match(workspace.databaseSchema, /^[a-zA-Z0-9_]+$/);
    const schema = `"${workspace.databaseSchema}"`;
    const founder = randomUUID(),
      editor = randomUUID(),
      outsider = randomUUID();
    const people = new Map();
    for (const [member, name] of [
      [founder, 'Founder'],
      [editor, 'Editor'],
      [outsider, 'Outsider'],
    ]) {
      const user = randomUUID();
      people.set(member, user);
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [member, user, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'Commitment fixture')`,
        [member, user, `${user}@example.invalid`, name],
      );
    }
    let failAfterWrite = false;
    const source = {
      manager: runner.manager,
      query: (...args) => runner.query(...args),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          const result = await callback(manager);
          if (failAfterWrite) {
            failAfterWrite = false;
            throw new Error('Synthetic commitment write failure');
          }
          return result;
        }),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === founder,
    });
    const delivery = new DeliveryService(source, access);

    const companyId = randomUUID();
    await runner.query(
      `INSERT INTO ${schema}.company (id,name) VALUES ($1,'Commitment fixture client')`,
      [companyId],
    );
    const createdProject = await delivery.command(workspace, founder, founder, {
      action: 'project',
      name: `Commitment fixture ${randomUUID()}`,
      companyId,
      memberIds: [editor],
    });
    const project = createdProject.projects.find(
      (item) => item.companyId === companyId,
    );
    const knowledge = new DeliveryKnowledgeService(source, delivery);
    const request = { projectId: project.id };
    const initial = await readDeliveryKnowledgeContext(
      runner.manager,
      workspace.id,
      project.id,
    );
    assert.equal(initial.totalSources, 0);
    const id = randomUUID();
    const input = {
      projectId: project.id,
      id,
      revision: 0,
      title: 'Strategy meeting',
      meetingDate: '2026-10-26',
      sourceUrl: 'https://fathom.video/share/synthetic',
      transcript: 'PRIVATE raw text: client decided to focus on booked calls.',
      knowledge:
        'Focus on qualified booked calls. Source: meeting at 03:20. Proposed task changes need approval.',
    };
    await knowledge.save(workspace, editor, editor, input);
    const own = await knowledge.snapshot(workspace, editor, editor, {
      ...request,
      sourceId: id,
    });
    assert.equal(own.detail.version, 1);
    assert.equal(own.detail.category, 'MEETING');
    assert.match(own.detail.transcript, /PRIVATE/);
    assert.equal(own.detail.publishedVersion, null);
    await assert.rejects(() =>
      knowledge.snapshot(workspace, outsider, outsider, request),
    );
    await assert.rejects(() =>
      knowledge.publish(workspace, editor, editor, {
        ...request,
        id,
        revision: 1,
        publish: true,
      }),
    );
    assert.equal(
      (
        await readDeliveryKnowledgeContext(
          runner.manager,
          workspace.id,
          project.id,
        )
      ).sources.length,
      0,
    );
    await knowledge.publish(workspace, founder, founder, {
      ...request,
      id,
      revision: 1,
      publish: true,
    });
    const approved = await readDeliveryKnowledgeContext(
      runner.manager,
      workspace.id,
      project.id,
    );
    assert.equal(approved.sources[0].sourceId, id);
    assert.equal(approved.sources[0].version, 1);
    assert(!JSON.stringify(approved).includes('PRIVATE'));
    assert(!JSON.stringify(approved).includes('fathom.video'));
    await assert.rejects(() =>
      assertDeliveryKnowledgeCurrent(
        runner.manager,
        workspace.id,
        project.id,
        initial,
      ),
    );
    await assertDeliveryKnowledgeCurrent(
      runner.manager,
      workspace.id,
      project.id,
      approved,
    );
    await knowledge.save(workspace, editor, editor, {
      ...input,
      revision: 2,
      knowledge: 'New draft strategy: increase webinar registrations.',
    });
    const withDraft = await readDeliveryKnowledgeContext(
      runner.manager,
      workspace.id,
      project.id,
    );
    assert.deepEqual(withDraft, approved);
    await assert.rejects(() =>
      knowledge.save(workspace, editor, editor, { ...input, revision: 2 }),
    );
    await assert.rejects(() =>
      knowledge.publish(workspace, founder, founder, {
        ...request,
        id,
        revision: 2,
        publish: true,
      }),
    );
    await knowledge.publish(workspace, founder, founder, {
      ...request,
      id,
      revision: 3,
      publish: true,
    });
    await assert.rejects(() =>
      assertDeliveryKnowledgeCurrent(
        runner.manager,
        workspace.id,
        project.id,
        approved,
      ),
    );
    const historical = await knowledge.snapshot(workspace, editor, editor, {
      ...request,
      sourceId: id,
      version: 1,
    });
    assert.equal(historical.detail.version, 1);
    assert.match(historical.detail.knowledge, /booked calls/);
    const otherId = randomUUID();
    await knowledge.save(workspace, founder, founder, {
      ...input,
      id: otherId,
      title: 'Private management meeting',
    });
    const employeeDrafts = await knowledge.snapshot(
      workspace,
      editor,
      editor,
      request,
    );
    assert(!employeeDrafts.items.some((item) => item.id === otherId));
    await assert.rejects(() =>
      knowledge.snapshot(workspace, editor, editor, {
        ...request,
        sourceId: otherId,
      }),
    );
    await knowledge.publish(workspace, founder, founder, {
      ...request,
      id: otherId,
      revision: 1,
      publish: true,
    });
    const employeeApproved = await knowledge.snapshot(
      workspace,
      editor,
      editor,
      { ...request, sourceId: otherId },
    );
    assert.equal(employeeApproved.detail.transcript, null);
    assert.equal(employeeApproved.detail.sourceUrl, '');
    assert.equal(employeeApproved.detail.canEdit, false);
    await knowledge.save(workspace, founder, founder, {
      ...input,
      id: otherId,
      revision: 2,
      transcript: 'Private revised notes',
      knowledge: 'Still a draft',
      category: 'VISUAL_RULES',
      title: 'Unpublished secret style',
    });
    await assert.rejects(() =>
      knowledge.snapshot(workspace, editor, editor, {
        ...request,
        sourceId: otherId,
        version: 2,
      }),
    );
    assert.equal(
      (
        await knowledge.snapshot(workspace, editor, editor, {
          ...request,
          sourceId: otherId,
        })
      ).detail.version,
      1,
    );
    assert.equal(
      (
        await knowledge.snapshot(workspace, editor, editor, {
          ...request,
          category: 'VISUAL_RULES',
        })
      ).items.length,
      0,
    );
    assert(
      (
        await knowledge.snapshot(workspace, editor, editor, {
          ...request,
          category: 'MEETING',
        })
      ).items.some((row) => row.id === otherId),
    );
    assert.equal(
      (
        await knowledge.snapshot(workspace, editor, editor, {
          ...request,
          search: 'Unpublished secret style',
        })
      ).items.length,
      0,
    );
    assert(
      (
        await knowledge.snapshot(workspace, founder, founder, {
          ...request,
          category: 'VISUAL_RULES',
          search: 'Unpublished secret style',
        })
      ).items.some((row) => row.id === otherId),
    );
    assert.equal(
      (
        await readDeliveryKnowledgeContext(
          runner.manager,
          workspace.id,
          project.id,
        )
      ).sources.find((row) => row.sourceId === otherId).category,
      'MEETING',
    );
    await knowledge.publish(workspace, founder, founder, {
      ...request,
      id: otherId,
      revision: 3,
      publish: true,
    });
    assert.equal(
      (
        await readDeliveryKnowledgeContext(
          runner.manager,
          workspace.id,
          project.id,
        )
      ).sources.find((row) => row.sourceId === otherId).category,
      'VISUAL_RULES',
    );
    assert.equal(
      (
        await knowledge.snapshot(workspace, editor, editor, {
          ...request,
          search: 'Private revised notes',
        })
      ).items.length,
      0,
    );
    await assert.rejects(() =>
      knowledge.save(workspace, founder, founder, {
        ...input,
        id: randomUUID(),
        category: 'INVENTED',
      }),
    );
    await knowledge.publish(workspace, founder, founder, {
      ...request,
      id,
      revision: 4,
      publish: false,
    });
    assert(
      !(
        await readDeliveryKnowledgeContext(
          runner.manager,
          workspace.id,
          project.id,
        )
      ).sources.some((item) => item.sourceId === id),
    );
    const linkOnly = randomUUID();
    await knowledge.save(workspace, editor, editor, {
      ...input,
      id: linkOnly,
      transcript: '',
      knowledge: 'Unverified',
    });
    await assert.rejects(
      () =>
        knowledge.publish(workspace, founder, founder, {
          ...request,
          id: linkOnly,
          revision: 1,
          publish: true,
        }),
      /source notes/,
    );
    await assert.rejects(() =>
      knowledge.save(workspace, editor, editor, {
        ...input,
        id: randomUUID(),
        sourceUrl: 'javascript:alert(1)',
      }),
    );
    await assert.rejects(() =>
      knowledge.save(workspace, editor, editor, {
        ...input,
        id: randomUUID(),
        transcript: 'x'.repeat(200001),
      }),
    );
    await assert.rejects(() =>
      knowledge.snapshot(workspace, editor, editor, {
        projectId: randomUUID(),
        sourceId: id,
      }),
    );
    const before = await runner.query(
      'SELECT id,revision FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 ORDER BY id',
      [workspace.id],
    );
    await knowledge.snapshot(workspace, editor, editor, request);
    assert.deepEqual(
      await runner.query(
        'SELECT id,revision FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 ORDER BY id',
        [workspace.id],
      ),
      before,
    );
    failAfterWrite = true;
    const rejectedId = randomUUID();
    await assert.rejects(
      () =>
        knowledge.save(workspace, editor, editor, { ...input, id: rejectedId }),
      /Synthetic/,
    );
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1',
          [rejectedId],
        )
      ).length,
      0,
    );
    const events = await runner.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=$2',
      [workspace.id, 'brand-knowledge'],
    );
    assert(events.length >= 8);
    assert(!JSON.stringify(events).includes('PRIVATE'));
    assert(!JSON.stringify(events).includes('qualified booked calls'));
    assert(!JSON.stringify(events).includes('fathom.video'));
    for (let index = 0; index < 32; index++) {
      const sourceId = randomUUID();
      await knowledge.save(workspace, founder, founder, {
        ...input,
        id: sourceId,
        title: `Bounded source ${index}`,
        meetingDate: '2026-10-27',
        knowledge: 'K'.repeat(8000),
      });
      await knowledge.publish(workspace, founder, founder, {
        ...request,
        id: sourceId,
        revision: 1,
        publish: true,
      });
    }
    const bounded = await readDeliveryKnowledgeContext(
      runner.manager,
      workspace.id,
      project.id,
    );
    assert.equal(bounded.totalSources, 33);
    assert.equal(
      bounded.sources.reduce((sum, item) => sum + item.knowledge.length, 0),
      20000,
    );
    assert(bounded.sources.every((item) => item.truncated));
    assert.equal(bounded.omittedSources, 29);
    const firstPage = await knowledge.snapshot(
      workspace,
      founder,
      founder,
      request,
    );
    assert.equal(firstPage.items.length, 30);
    assert(firstPage.nextCursor);
    const nextPage = await knowledge.snapshot(workspace, founder, founder, {
      ...request,
      after: firstPage.nextCursor,
    });
    assert.equal(nextPage.items.length, 5);
    assert.equal(
      new Set([...firstPage.items, ...nextPage.items].map((item) => item.id))
        .size,
      35,
    );
    assert.equal(nextPage.nextCursor, null);
    await knowledge.save(workspace, founder, founder, {
      ...input,
      id: otherId,
      revision: 4,
    });
    assert.equal(
      (
        await knowledge.snapshot(workspace, founder, founder, {
          ...request,
          sourceId: otherId,
        })
      ).detail.category,
      'VISUAL_RULES',
    );
    console.log(
      'PASS categories/visible-version filtering/search, legacy category preservation, meeting draft/publication/version history, raw-note privacy, scope, stale edits, bounded input, agent freshness/withdrawal, read-only snapshots and transactional audit rollback. No provider calls.',
    );
    await require('./helpers/check-delivery-fathom-knowledge.cjs').checkDeliveryFathomKnowledge({ runner, source, delivery, workspace, founder, editor });
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
