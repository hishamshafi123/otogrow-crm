const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  seedInboxFixture,
  inboxServices,
  consentInput,
  manualInput,
  PRIVATE,
  HIDDEN,
  quote,
} = require('./check-delivery-inbox-support.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  DeliveryBusinessService,
} = require('../dist/modules/delivery/business/delivery-business.service');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  inboxHash,
} = require('../dist/modules/delivery/inbox/delivery-inbox.policy');
async function main() {
  assert.equal(process.argv.length, 2);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  connectionSource.setOptions({ logging: false });
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Inbox acceptance forbids network.');
  };
  let reading = false,
    depth = 0,
    failActivity = false,
    sequence = 0;
  const originalQuery = runner.query.bind(runner);
  runner.query = async (...args) => {
    if (reading)
      assert(
        !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(
          args[0],
        ),
        'Inbox read attempted mutation.',
      );
    if (
      failActivity &&
      /^\s*INSERT\b/i.test(args[0]) &&
      args[0].includes('otogrowActivityEvent')
    )
      throw new Error('Synthetic inbox activity failure');
    return originalQuery(...args);
  };
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='60s'");
    const dataBefore = await dataFingerprint(runner),
      schemaBefore = await schemaFingerprint(runner);
    await runner.query('SAVEPOINT inbox_all');
    const fixture = await seedInboxFixture(runner.manager);
    const schema = quote(fixture.schemaName);
    const source = {
      manager: runner.manager,
      query: (...args) => runner.query(...args),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          depth++;
          try {
            return await callback(manager);
          } finally {
            depth--;
          }
        }),
    };
    const options = {
      beforeSend: async () =>
        assert.equal(
          depth,
          0,
          'Provider must run after the workspace transaction ends.',
        ),
    };
    const services = inboxServices(source, fixture, options);
    const query = async (method, input, person) => {
      reading = true;
      try {
        return await services.call(method, input, person);
      } finally {
        reading = false;
      }
    };
    const isolated = async (operation) => {
      const name = `inbox_case_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const denied = (operation, statuses = [403, 404]) =>
      assert.rejects(operation, (error) =>
        statuses.includes(error.getStatus?.()),
      );
    const count = async (table) =>
      Number(
        (
          await runner.query(
            `SELECT count(*)::int AS count FROM core.${quote(table)} WHERE "workspaceId"=$1`,
            [fixture.workspaceId],
          )
        )[0].count,
      );
    const mailbox = await query('accounts', {});
    assert.equal(mailbox.totalCount, 1);
    assert.equal(mailbox.items[0].id, fixture.accounts.owner);
    assert(!JSON.stringify(mailbox).includes('accessToken'));
    await denied(() => query('threads', { accountId: fixture.accounts.other }));
    const threads = [];
    let after = null;
    do {
      const page = await query('threads', {
        accountId: fixture.accounts.owner,
        after,
      });
      assert.equal(page.totalCount, 55);
      assert(page.items.length <= 25);
      threads.push(...page.items);
      after = page.nextCursor;
    } while (after);
    assert.equal(
      new Set(threads.map((item) => item.threadExternalId)).size,
      55,
    );
    const selected = await query('threads', {
      accountId: fixture.accounts.owner,
      search: 'does-not-match',
      selectedChannelId: fixture.channels.owner,
      selectedThreadExternalId: fixture.thread,
    });
    assert.equal(selected.totalCount, 0);
    assert.equal(selected.selected.threadExternalId, fixture.thread);
    assert.equal(selected.selected.accountHandle, 'owner@example.invalid');
    const consent = await consentInput(services, fixture);
    const accepted = await services.call('consent', consent);
    assert.equal(accepted.receipt.action, 'CONSENTED');
    assert.equal(await count('deliveryInboxBinding'), 1);
    assert.deepEqual(
      (await services.call('consent', consent)).receipt,
      accepted.receipt,
    );
    assert.equal(await count('deliveryInboxConsent'), 1);
    await denied(
      () => services.call('consent', { ...consent, grants: [] }),
      [409],
    );
    await denied(
      () =>
        services.call('consent', {
          ...consent,
          id: randomUUID(),
          requestId: randomUUID(),
          conversationId: fixture.conversations[1].id,
        }),
      [409],
    );
    await denied(() =>
      services.reply(
        'request',
        { requestId: consent.requestId },
        fixture.people.writer,
      ),
    );
    const messages = [];
    after = null;
    let firstCursor;
    do {
      const page = await query(
        'messages',
        { conversationId: consent.conversationId, after },
        fixture.people.writer,
      );
      assert.equal(page.totalCount, 55);
      assert(page.items.length <= 25);
      assert(!JSON.stringify(page).includes(HIDDEN));
      assert(!JSON.stringify(page).includes('headerMessageId'));
      messages.push(...page.items);
      firstCursor ??= page.nextCursor;
      after = page.nextCursor;
    } while (after);
    assert.equal(new Set(messages.map((item) => item.id)).size, 55);
    assert.equal(messages.at(-1).receivedAt, null);
    assert(messages.some((item) => item.receivedAt?.endsWith('123456Z')));
    assert.deepEqual(
      messages
        .filter((item) => item.receivedAt)
        .map((item) => `${item.receivedAt}:${item.id}`),
      messages
        .filter((item) => item.receivedAt)
        .map((item) => `${item.receivedAt}:${item.id}`)
        .sort()
        .reverse(),
    );
    await denied(() =>
      query(
        'messages',
        { conversationId: consent.conversationId },
        fixture.people.outsider,
      ),
    );
    await isolated(async () => {
      await runner.query(
        `UPDATE ${schema}.message SET text=text||' changed',"updatedAt"=now() WHERE id=$1`,
        [fixture.selectedMessageId],
      );
      await denied(
        () =>
          query(
            'messages',
            { conversationId: consent.conversationId, after: firstCursor },
            fixture.people.writer,
          ),
        [400],
      );
    });
    await isolated(async () => {
      await runner.query(
        'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
        [fixture.projects.first, randomUUID()],
      );
      await denied(() =>
        query(
          'messages',
          { conversationId: consent.conversationId },
          fixture.people.writer,
        ),
      );
      assert.equal(
        (await query('conversations', {}, fixture.people.writer)).totalCount,
        54,
      );
    });
    await isolated(async () => {
      await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
        fixture.people.admin.userId,
      ]);
      await denied(() =>
        query(
          'messages',
          { conversationId: consent.conversationId },
          fixture.people.writer,
        ),
      );
      assert.equal(
        (await query('conversations', {}, fixture.people.writer)).totalCount,
        54,
      );
    });
    await isolated(async () => {
      await runner.query(
        `UPDATE core."deliveryOperations" SET state=jsonb_set(state,'{business,records,0,grants}','[]'::jsonb) WHERE "workspaceId"=$1`,
        [fixture.workspaceId],
      );
      await denied(() =>
        query(
          'messages',
          { conversationId: consent.conversationId },
          fixture.people.writer,
        ),
      );
    });
    const preparedInput = await manualInput(services, fixture);
    const prepared = await services.reply(
      'prepare',
      preparedInput,
      fixture.people.writer,
    );
    assert.equal(prepared.reply.status, 'DRAFT');
    assert.equal(prepared.reply.body.to, 'client@example.invalid');
    assert(!Object.hasOwn(prepared.reply.body, 'inReplyTo'));
    assert(!Object.hasOwn(prepared.reply.body, 'threadExternalId'));
    assert.equal(prepared.receipt.bodyFingerprint, inboxHash(preparedInput));
    assert.deepEqual(
      (await services.reply('prepare', preparedInput, fixture.people.writer))
        .receipt,
      prepared.receipt,
    );
    assert.equal(await count('deliveryInboxReply'), 1);
    await denied(
      () =>
        services.reply(
          'prepare',
          { ...preparedInput, text: 'Different exact body' },
          fixture.people.writer,
        ),
      [409],
    );
    const send = {
      id: preparedInput.id,
      requestId: randomUUID(),
      bodyFingerprint: prepared.reply.bodyFingerprint,
      sourceFingerprint: prepared.reply.sourceFingerprint,
    };
    await services.reply('send', send, fixture.people.writer);
    await services.reply('send', send, fixture.people.writer);
    assert.equal(services.enqueued.length, 1);
    await services.replies.execute(preparedInput.id);
    await services.replies.execute(preparedInput.id);
    assert.equal(services.calls.length, 1);
    assert.equal(
      services.calls[0].input.headerMessageId,
      `<otogrow-inbox-${preparedInput.id}@otogrow.invalid>`,
    );
    assert.equal(
      (
        await services.reply(
          'request',
          { requestId: send.requestId },
          fixture.people.writer,
        )
      ).reply.status,
      'SENT',
    );
    await isolated(async () => {
      const input = await manualInput(services, fixture);
      const value = await services.reply(
        'prepare',
        input,
        fixture.people.writer,
      );
      await services.reply(
        'send',
        {
          id: input.id,
          requestId: randomUUID(),
          bodyFingerprint: value.reply.bodyFingerprint,
          sourceFingerprint: value.reply.sourceFingerprint,
        },
        fixture.people.writer,
      );
      await services.call('revoke', {
        id: consent.id,
        requestId: randomUUID(),
        revision: 1,
      });
      const calls = services.calls.length;
      await services.replies.execute(input.id);
      assert.equal(services.calls.length, calls);
      assert.equal(
        (
          await runner.query(
            'SELECT status FROM core."deliveryInboxReply" WHERE id=$1',
            [input.id],
          )
        )[0].status,
        'FAILED',
      );
      await denied(() =>
        services.reply('detail', { id: input.id }, fixture.people.writer),
      );
    });
    await isolated(async () => {
      const input = await manualInput(services, fixture);
      const value = await services.reply(
        'prepare',
        input,
        fixture.people.writer,
      );
      await services.reply(
        'send',
        {
          id: input.id,
          requestId: randomUUID(),
          bodyFingerprint: value.reply.bodyFingerprint,
          sourceFingerprint: value.reply.sourceFingerprint,
        },
        fixture.people.writer,
      );
      options.failSend = true;
      try {
        await services.replies.execute(input.id);
      } finally {
        options.failSend = false;
      }
      assert.equal(
        (
          await services.reply(
            'detail',
            { id: input.id },
            fixture.people.writer,
          )
        ).status,
        'UNCERTAIN',
      );
      const calls = services.calls.length;
      await services.replies.execute(input.id);
      await services.reply(
        'reconcile',
        { id: input.id },
        fixture.people.writer,
      );
      assert.equal(services.calls.length, calls);
      assert.equal(
        (
          await services.reply(
            'detail',
            { id: input.id },
            fixture.people.writer,
          )
        ).status,
        'UNCERTAIN',
      );
      await runner.query(
        `UPDATE ${schema}.message SET "headerMessageId"=$2 WHERE id=$1`,
        [
          fixture.selectedMessageId,
          `<otogrow-inbox-${input.id}@otogrow.invalid>`,
        ],
      );
      await runner.query(
        `UPDATE ${schema}."messageChannelMessageAssociation" SET direction='OUTGOING' WHERE "messageId"=$1`,
        [fixture.selectedMessageId],
      );
      assert.equal(
        (
          await services.reply(
            'reconcile',
            { id: input.id },
            fixture.people.writer,
          )
        ).status,
        'SENT',
      );
    });
    await isolated(async () => {
      const next = await consentInput(services, fixture, 1, {
        threadExternalId: 'other-thread-1',
      });
      next.sourceFingerprint = (
        await services.call('threads', {
          accountId: fixture.accounts.owner,
          selectedChannelId: fixture.channels.owner,
          selectedThreadExternalId: 'other-thread-1',
        })
      ).selected.sourceFingerprint;
      const before = await count('deliveryInboxBinding');
      failActivity = true;
      try {
        await assert.rejects(
          () => services.call('consent', next),
          /Synthetic inbox activity/,
        );
      } finally {
        failActivity = false;
      }
      assert.equal(await count('deliveryInboxBinding'), before);
      assert.equal(
        (await services.reply('request', { requestId: next.requestId }))
          .receipt,
        null,
      );
    });
    let modelCalls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async (request) => {
        modelCalls++;
        assert(JSON.stringify(request.prompt).includes(PRIVATE));
        assert(!JSON.stringify(request.prompt).includes(HIDDEN));
        return {
          content: [
            {
              type: 'text',
              text: 'Synthetic editable response. [NEEDS CONFIRMATION: timeline]',
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
    const budget = await makeBudgetFixture(
      source,
      services.access,
      fixture.workspace,
      [{ modelId: 'inbox-mock', kind: 'TEXT' }],
    );
    const business = new DeliveryBusinessService(
      source,
      services.delivery,
      { getModel: () => ({ model }), validateModelAvailability: () => {} },
      budget,
      services.access,
    );
    const ai = inboxServices(source, fixture, { business });
    const agentId = randomUUID();
    await runner.manager.getRepository(DeliveryAgentEntity).insert({
      id: agentId,
      workspaceId: fixture.workspaceId,
      version: 1,
      configuration: {
        name: 'Synthetic inbox COPY',
        purpose: 'Mock selected-message reply',
        kind: 'COPY',
        enabled: true,
        instructions: 'Use selected evidence only',
        requiredInputs: [],
        outputFormat: 'findings_and_edits',
        tools: [],
        modelId: 'inbox-mock',
        projectIds: [fixture.projects.first],
        roles: ['MEMBER'],
        dailyRunLimit: 5,
        maxOutputTokens: 256,
        humanConfirmation: true,
      },
    });
    const base = await manualInput(ai, fixture);
    const previewInput = {
      id: base.id,
      conversationId: base.conversationId,
      bindingRevision: base.bindingRevision,
      sourceFingerprint: base.sourceFingerprint,
      replyToMessageId: base.replyToMessageId,
      agentId,
      sourceIds: [fixture.selectedMessageId],
    };
    const preview = await ai.reply(
      'preview',
      previewInput,
      fixture.people.writer,
    );
    assert(preview.budget.budgetReady);
    assert.equal(modelCalls, 0);
    assert.equal(await count('otogrowAiSpend'), 0);
    assert.equal(preview.sources[0].text.includes(PRIVATE), true);
    const generate = {
      ...base,
      text: '',
      agentId,
      sourceIds: previewInput.sourceIds,
      previewFingerprint: preview.previewFingerprint,
      agentVersion: preview.agentVersion,
      pricingRevision: preview.budget.pricingRevision,
    };
    const generated = await ai.reply(
      'prepare',
      generate,
      fixture.people.writer,
    );
    assert.equal(generated.reply.status, 'DRAFT');
    assert(generated.reply.body.text.includes('NEEDS CONFIRMATION'));
    assert.equal(modelCalls, 1);
    assert.equal(ai.calls.length, 0);
    assert.equal(
      (
        await runner.query(
          'SELECT state,"sourceRunId" FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].state,
      'SETTLED',
    );
    assert.equal(
      (
        await ai.reply(
          'request',
          { requestId: generate.requestId },
          fixture.people.writer,
        )
      ).receipt.requestId,
      generate.requestId,
    );
    const history = await ai.reply(
      'history',
      { conversationId: consent.conversationId },
      fixture.people.writer,
    );
    assert(history.items.every((item) => !Object.hasOwn(item, 'body')));
    assert(history.items.some((item) => item.actorName?.includes('writer')));
    const events = await runner.query(
      'SELECT to_jsonb(event)::text AS value FROM core."otogrowActivityEvent" event WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    assert(!JSON.stringify(events).includes(PRIVATE));
    assert(!JSON.stringify(events).includes('client@example.invalid'));
    assert.equal(networkCalls, 0);
    await runner.query('ROLLBACK TO SAVEPOINT inbox_all');
    assert.deepEqual(await dataFingerprint(runner), dataBefore);
    assert.equal(await schemaFingerprint(runner), schemaBefore);
    console.log(
      `PASS scoped Gmail service proof: 55 threads/55 selected messages with exact microsecond pages; owner-only account, explicit consent/grant/client/active-owner revocation; immutable request retries; current sender recheck; no network in transaction; uncertain positive-only reconciliation; real COPY SDK/budget ${modelCalls} mock call and no external sender call for AI; all original schema/data restored.`,
    );
  } finally {
    global.fetch = originalFetch;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
