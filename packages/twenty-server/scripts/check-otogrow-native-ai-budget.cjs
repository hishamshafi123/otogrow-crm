const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { MODULE_METADATA } = require('@nestjs/common/constants');
const { SystemPermissionFlag } = require('twenty-shared/constants');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  OtogrowNativeAiService,
} = require('../dist/modules/otogrow-ai-budget/otogrow-native-ai.service');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  OtogrowAiSpendEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');
const {
  OtogrowAiBudgetEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-budget.entity');
const {
  OtogrowAiPriceEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity');
const {
  PermissionsService,
} = require('../dist/engine/metadata-modules/permissions/permissions.service');
const {
  UserRoleService,
} = require('../dist/engine/metadata-modules/user-role/user-role.service');
const {
  RoleEntity,
} = require('../dist/engine/metadata-modules/role/role.entity');
const {
  RoleTargetEntity,
} = require('../dist/engine/metadata-modules/role-target/role-target.entity');
const {
  UserWorkspaceEntity,
} = require('../dist/engine/core-modules/user-workspace/user-workspace.entity');
const {
  ApplicationEntity,
} = require('../dist/engine/core-modules/application/application.entity');
const {
  WorkspaceScopedRepository,
} = require('../dist/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository');
const {
  AiModelRegistryService,
} = require('../dist/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service');
const {
  AiModelPreferencesService,
} = require('../dist/engine/metadata-modules/ai/ai-models/services/ai-model-preferences.service');
const {
  OTOGROW_NATIVE_AI_RECOVERY_GRACE_MS,
} = require('../dist/modules/otogrow-ai-budget/otogrow-native-ai.constants');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  WorkspaceCommandProviderModule,
} = require('../dist/database/commands/upgrade-version-command/workspace-command-provider.module');
const {
  UpgradeCommandRegistryService,
} = require('../dist/engine/core-modules/upgrade/services/upgrade-command-registry.service');
const {
  UpgradeSequenceReaderService,
} = require('../dist/engine/core-modules/upgrade/services/upgrade-sequence-reader.service');
const {
  UpgradeMigrationService,
} = require('../dist/engine/core-modules/upgrade/services/upgrade-migration.service');
const {
  UpgradeMigrationEntity,
} = require('../dist/engine/core-modules/upgrade/upgrade-migration.entity');
const {
  UpgradeAwareEntityMetadataAdapter,
} = require('../dist/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter');
const {
  RolePermissionFlagEntity,
} = require('../dist/engine/metadata-modules/role-permission-flag/role-permission-flag.entity');

const checks = [];
const MODEL_ID = 'rollback-native-ai-text';
const quote = (value) => {
  assert.match(value, /^\w+$/);
  return `"${value}"`;
};
const usage = {
  inputTokens: { total: 11, noCache: 11, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 7, text: 7, reasoning: 0 },
};
const generateResult = {
  content: [{ type: 'text', text: 'Synthetic response; no provider call.' }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  warnings: [],
};
const request = (changes = {}) => ({
  prompt: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Synthetic proof input' }],
    },
  ],
  maxOutputTokens: 64,
  ...changes,
});
const unused = new Proxy(
  {},
  {
    get: (_object, key) => () => {
      throw new Error(`Unexpected non-proof dependency: ${String(key)}`);
    },
  },
);

async function applyRuntimeUpgradeMetadata(manager) {
  const workspaceModules = Reflect.getMetadata(
    MODULE_METADATA.IMPORTS,
    WorkspaceCommandProviderModule,
  );
  const commandClasses = [
    ...INSTANCE_COMMANDS,
    ...workspaceModules.flatMap(
      (module) => Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [],
    ),
  ];
  // The CLI datasource omits Nest startup; discover actual command metadata
  // without constructing or executing any upgrade command.
  const registry = new UpgradeCommandRegistryService({
    getProviders: () =>
      commandClasses.map((metatype) => ({
        metatype,
        instance: Object.create(metatype.prototype),
      })),
  });
  registry.onModuleInit();
  const sequenceReader = new UpgradeSequenceReaderService(registry);
  const migrations = new UpgradeMigrationService(
    manager.getRepository(UpgradeMigrationEntity),
  );
  const current = await migrations.getLastAttemptedInstanceCommand();
  assert(current, 'A recorded runtime upgrade cursor is required.');
  assert.equal(current.status, 'completed');
  assert(
    sequenceReader
      .getUpgradeSequence()
      .some((step) => step.name === current.name),
    'The recorded upgrade cursor must exist in the actual registered sequence.',
  );
  const adapter = new UpgradeAwareEntityMetadataAdapter(
    connectionSource,
    sequenceReader,
    migrations,
  );
  await adapter.onModuleInit();
  await adapter.refresh();
  assert(
    adapter.getHiddenColumnPropertyNames(RolePermissionFlagEntity).has('flag'),
  );
  assert(
    !connectionSource
      .getMetadata(RolePermissionFlagEntity)
      .columns.some((column) => column.propertyName === 'flag'),
  );
  checks.push(
    'Actual recorded upgrade cursor shapes runtime authorization metadata',
  );
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only proof; no commit or apply mode.',
  );
  assert.equal(
    process.env.OTOGROW_NATIVE_AI_PROOF_SERVICES_STOPPED,
    '1',
    'Pause the local API/workers before this whole-database preservation proof.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  let providerRequests = 0;
  const denyProvider = () => {
    providerRequests++;
    throw new Error(
      'External requests are forbidden during native AI budget proof.',
    );
  };
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports) owner[key] = denyProvider;
  let runner;
  let drainTransactions = async () => undefined;
  try {
    await connectionSource.initialize();
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const originalTables = await userTables(runner);
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const originalSchema = await schemaFingerprint(runner);
    const originalData = await dataFingerprint(runner);
    await applyRuntimeUpgradeMetadata(runner.manager);
    assert.equal(
      await runner.manager.getRepository(OtogrowAiSpendEntity).count({
        where: [
          { sourceKind: 'NATIVE_CRM', state: 'RESERVED' },
          { sourceKind: 'NATIVE_CRM', state: 'DISPATCHED' },
        ],
      }),
      0,
      'Finish or reconcile existing active native requests before this global recovery proof.',
    );
    await runner.query('SAVEPOINT native_ai_fixture');
    const fixture = await createFixture(runner.manager, 'native_ai_proof_');
    const { workspace, people } = fixture;
    const manager = runner.manager;
    let transactionTail = Promise.resolve();
    drainTransactions = async () => {
      let current;
      do {
        current = transactionTail;
        await current;
        await new Promise((resolve) => setImmediate(resolve));
      } while (current !== transactionTail);
    };
    const source = {
      manager,
      getRepository: (entity) => manager.getRepository(entity),
      query: (...arguments_) => manager.query(...arguments_),
      // Runtime transactions own separate connections. The rollback proof owns
      // one connection, so concurrent stream cleanup must queue its savepoints.
      transaction: (operation) => {
        const transaction = transactionTail.then(() => {
          assert(runner.isTransactionActive);
          return manager.transaction(operation);
        });
        transactionTail = transaction.catch(() => undefined);
        return transaction;
      },
    };
    const nativeRoles = {};
    for (const person of Object.values(people)) {
      const roleId = randomUUID();
      nativeRoles[person.name] = roleId;
      await manager.query(
        `INSERT INTO core.role(id,"workspaceId",label,"canAccessAllTools","canUpdateAllSettings","universalIdentifier","applicationId")
         VALUES($1,$2,$3,$4,$4,$1,$5)`,
        [
          roleId,
          workspace.id,
          `Native proof ${person.name}`,
          person.name === 'admin',
          workspace.workspaceCustomApplicationId,
        ],
      );
      const targetId = randomUUID();
      await manager.query(
        `INSERT INTO core."roleTarget"(id,"workspaceId","roleId","userWorkspaceId","universalIdentifier","applicationId")
         VALUES($1,$2,$3,$4,$1,$5)`,
        [
          targetId,
          workspace.id,
          roleId,
          person.userWorkspaceId,
          workspace.workspaceCustomApplicationId,
        ],
      );
    }
    const permissionId = randomUUID(),
      roleFlagId = randomUUID();
    await manager.query(
      `INSERT INTO core."permissionFlag"(id,"workspaceId",key,label,"permissionType","universalIdentifier","applicationId")
       VALUES($1,$2,'AI','Rollback AI access','tool',$3,$4)`,
      [
        permissionId,
        workspace.id,
        SystemPermissionFlag.AI,
        workspace.workspaceCustomApplicationId,
      ],
    );
    await manager.query(
      `INSERT INTO core."rolePermissionFlag"(id,"workspaceId","roleId","permissionFlagId","universalIdentifier","applicationId")
       VALUES($1,$2,$3,$4,$1,$5)`,
      [
        roleFlagId,
        workspace.id,
        nativeRoles.writer,
        permissionId,
        workspace.workspaceCustomApplicationId,
      ],
    );
    const userRoles = new UserRoleService(
      new WorkspaceScopedRepository(manager.getRepository(RoleTargetEntity)),
      manager.getRepository(UserWorkspaceEntity),
      unused,
      unused,
      unused,
      unused,
    );
    const permissions = new PermissionsService(
      userRoles,
      unused,
      unused,
      new WorkspaceScopedRepository(manager.getRepository(RoleEntity)),
      manager.getRepository(ApplicationEntity),
    );
    assert.equal(
      permissions.checkRolePermissions,
      PermissionsService.prototype.checkRolePermissions,
    );
    const access = new OtogrowAccessService(source, permissions);
    const budget = await makeBudgetFixture(source, access, workspace, [
      { modelId: MODEL_ID, kind: 'TEXT' },
    ]);
    let modelDisabled = false;
    const modelPreferences = new AiModelPreferencesService({
      get: (key) => {
        assert(
          [
            'AI_MODELS_DEFAULT_FAST',
            'AI_MODELS_DEFAULT_SMART',
            'AI_MODELS_DEFAULT_RECOMMENDED',
            'AI_MODELS_DEFAULT_DISABLED',
          ].includes(key),
        );
        return key === 'AI_MODELS_DEFAULT_DISABLED' && modelDisabled
          ? [MODEL_ID]
          : [];
      },
    });
    const models = new AiModelRegistryService(
      unused,
      unused,
      modelPreferences,
      unused,
    );
    assert.equal(
      models.validateModelAvailability,
      AiModelRegistryService.prototype.validateModelAvailability,
    );
    await manager.query(
      'UPDATE core.workspace SET "useRecommendedModels"=false,"enabledAiModelIds"=$2 WHERE id=$1',
      [workspace.id, [MODEL_ID]],
    );
    const native = new OtogrowNativeAiService(
      source,
      budget,
      permissions,
      models,
    );
    const context = (person = people.writer, changes = {}) => ({
      workspaceId: workspace.id,
      userWorkspaceId: person.userWorkspaceId,
      modelId: MODEL_ID,
      modelConfig: {
        modelId: MODEL_ID,
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 1000,
      },
      ...changes,
    });
    const spent = () =>
      manager.getRepository(OtogrowAiSpendEntity).find({
        where: { workspaceId: workspace.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    let modelRequests = 0;
    const wrapped = (overrides = {}, owner = context()) =>
      native.wrap(
        {
          specificationVersion: 'v3',
          provider: 'rollback-fixture',
          modelId: MODEL_ID,
          supportedUrls: {},
          doGenerate: async (params) => {
            modelRequests++;
            assert.equal(params.maxOutputTokens, 64);
            return generateResult;
          },
          doStream: async () => {
            modelRequests++;
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: 'text-start', id: 'text' });
                  controller.enqueue({
                    type: 'text-delta',
                    id: 'text',
                    delta: 'Synthetic streamed response',
                  });
                  controller.enqueue({ type: 'text-end', id: 'text' });
                  controller.enqueue({
                    type: 'finish',
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage,
                  });
                  controller.close();
                },
              }),
            };
          },
          ...overrides,
        },
        owner,
      );
    const consume = async (stream) => {
      const chunks = [];
      const reader = stream.getReader();
      while (true) {
        const value = await reader.read();
        if (value.done) return chunks;
        chunks.push(value.value);
      }
    };
    let sequence = 0;
    const isolated = async (label, operation) => {
      const savepoint = `native_ai_case_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        await operation();
        await drainTransactions();
        checks.push(label);
      } finally {
        await drainTransactions();
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    const deniesBeforeProvider = async (operation) => {
      const before = modelRequests;
      await assert.rejects(operation);
      assert.equal(modelRequests, before);
      assert.deepEqual(await spent(), []);
    };

    await isolated(
      'Real native role permission flag authorizes exact workspace/member spend and actual token settlement',
      async () => {
        const result = await wrapped().doGenerate(request());
        assert.deepEqual(result, generateResult);
        const [spend] = await spent();
        assert.equal(spend.sourceKind, 'NATIVE_CRM');
        assert.equal(spend.actorId, people.writer.memberId);
        assert.equal(spend.clientId, null);
        assert.equal(spend.taskId, null);
        assert.equal(spend.state, 'SETTLED');
        assert.equal(spend.actualMicroUsd, '18');
        assert.equal(spend.reservedMicroUsd, '1000064');
        const events = await manager.query(
          'SELECT action FROM core."otogrowAiSpendEvent" WHERE "spendId"=$1 ORDER BY "createdAt",id',
          [spend.id],
        );
        assert.deepEqual(
          new Set(events.map((event) => event.action)),
          new Set(['RESERVED', 'DISPATCHED', 'SETTLED']),
        );
      },
    );
    await isolated(
      'Native all-tools role uses actual role policy and remains attributable to its person',
      async () => {
        await wrapped({}, context(people.admin)).doGenerate(request());
        assert.equal((await spent())[0].actorId, people.admin.memberId);
      },
    );
    await isolated(
      'A model disabled by current workspace settings cannot dispatch',
      async () => {
        await manager.query(
          'UPDATE core.workspace SET "enabledAiModelIds"=$2 WHERE id=$1',
          [workspace.id, []],
        );
        await deniesBeforeProvider(() => wrapped().doGenerate(request()));
      },
    );
    await isolated(
      'An instance administrator-disabled model cannot dispatch',
      async () => {
        modelDisabled = true;
        try {
          await deniesBeforeProvider(() => wrapped().doGenerate(request()));
        } finally {
          modelDisabled = false;
        }
      },
    );
    for (const [label, query, values] of [
      [
        'Revoked native AI flag',
        'DELETE FROM core."rolePermissionFlag" WHERE id=$1',
        [roleFlagId],
      ],
      [
        'Revoked native role assignment',
        'DELETE FROM core."roleTarget" WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2',
        [workspace.id, people.writer.userWorkspaceId],
      ],
      [
        'Disabled person',
        'UPDATE core."user" SET disabled=true WHERE id=$1',
        [people.writer.userId],
      ],
      [
        'Deleted membership',
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [people.writer.userWorkspaceId],
      ],
      [
        'Deleted workspace member',
        `UPDATE ${quote(fixture.schemaName)}."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
        [people.writer.memberId],
      ],
      [
        'Inactive workspace',
        'UPDATE core.workspace SET "activationStatus"=$2 WHERE id=$1',
        [workspace.id, 'INACTIVE'],
      ],
    ])
      await isolated(
        `${label} denies before reservation/provider work`,
        async () => {
          await manager.query(query, values);
          await deniesBeforeProvider(() => wrapped().doGenerate(request()));
        },
      );
    await isolated(
      'Unowned/API-only native calls cannot assume a human budget owner',
      async () => {
        await deniesBeforeProvider(() =>
          wrapped(
            {},
            context(people.writer, { userWorkspaceId: null }),
          ).doGenerate(request()),
        );
      },
    );
    await isolated(
      'Cross-workspace identity cannot charge this workspace',
      async () => {
        await deniesBeforeProvider(() =>
          wrapped(
            {},
            context(people.writer, { workspaceId: fixture.foreignWorkspaceId }),
          ).doGenerate(request()),
        );
      },
    );
    for (const [label, update] of [
      [
        'Missing workspace allowance',
        () =>
          manager
            .getRepository(OtogrowAiBudgetEntity)
            .delete({ workspaceId: workspace.id }),
      ],
      [
        'Disabled workspace allowance',
        () =>
          manager
            .getRepository(OtogrowAiBudgetEntity)
            .update({ workspaceId: workspace.id }, { enabled: false }),
      ],
      [
        'Zero workspace allowance',
        () =>
          manager
            .getRepository(OtogrowAiBudgetEntity)
            .update({ workspaceId: workspace.id }, { capMicroUsd: '0' }),
      ],
      [
        'Missing model tariff',
        () =>
          manager
            .getRepository(OtogrowAiPriceEntity)
            .delete({ workspaceId: workspace.id }),
      ],
      [
        'Disabled model tariff',
        () =>
          manager
            .getRepository(OtogrowAiPriceEntity)
            .update({ workspaceId: workspace.id }, { enabled: false }),
      ],
    ])
      await isolated(`${label} blocks a model call`, async () => {
        await update();
        await deniesBeforeProvider(() => wrapped().doGenerate(request()));
      });
    await isolated(
      'A tariff below the full model context bound is not accepted',
      async () => {
        await deniesBeforeProvider(() =>
          wrapped(
            {},
            context(people.writer, {
              modelConfig: {
                modelId: MODEL_ID,
                contextWindowTokens: 1_000_001,
                maxOutputTokens: 1000,
              },
            }),
          ).doGenerate(request()),
        );
      },
    );
    await isolated(
      'A mismatched registered model cannot use another tariff',
      async () => {
        await deniesBeforeProvider(() =>
          wrapped(
            {},
            context(people.writer, { modelId: 'wrong-model' }),
          ).doGenerate(request()),
        );
      },
    );
    await isolated(
      'Aborted preparation never dispatches or reserves',
      async () => {
        const controller = new AbortController();
        controller.abort();
        await deniesBeforeProvider(() =>
          wrapped().doGenerate(request({ abortSignal: controller.signal })),
        );
      },
    );
    await isolated(
      'Provider failure preserves the whole dispatched uncertainty hold',
      async () => {
        await assert.rejects(() =>
          wrapped({
            doGenerate: async () => {
              modelRequests++;
              throw new Error('Synthetic provider lost response');
            },
          }).doGenerate(request()),
        );
        const [spend] = await spent();
        assert.equal(spend.state, 'UNCERTAIN');
        assert.equal(spend.actualMicroUsd, null);
        assert.equal(spend.reservedMicroUsd, '1000064');
      },
    );
    await isolated(
      'Revocation after paid generation withholds output while preserving its actual cost',
      async () => {
        await assert.rejects(() =>
          wrapped({
            doGenerate: async () => {
              modelRequests++;
              await manager.query(
                'DELETE FROM core."rolePermissionFlag" WHERE id=$1',
                [roleFlagId],
              );
              return generateResult;
            },
          }).doGenerate(request()),
        );
        const [spend] = await spent();
        assert.equal(spend.state, 'SETTLED');
        assert.equal(spend.actualMicroUsd, '18');
      },
    );
    await isolated(
      'A completed text stream records exact usage after validated publication',
      async () => {
        const result = await wrapped().doStream(request());
        const chunks = await consume(result.stream);
        assert(chunks.some((chunk) => chunk.type === 'text-delta'));
        const [spend] = await spent();
        assert.equal(spend.state, 'SETTLED');
        assert.equal(spend.actualMicroUsd, '18');
      },
    );
    await isolated(
      'A stream without complete usage retains uncertainty rather than inventing free usage',
      async () => {
        const result = await wrapped({
          doStream: async () => {
            modelRequests++;
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.close();
                },
              }),
            };
          },
        }).doStream(request());
        await consume(result.stream);
        assert.equal((await spent())[0].state, 'UNCERTAIN');
      },
    );
    await isolated(
      'Cancelling a dispatched stream keeps its uncertainty hold',
      async () => {
        let cancelled = false;
        const result = await wrapped({
          doStream: async () => {
            modelRequests++;
            return {
              stream: new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
            };
          },
        }).doStream(request());
        await result.stream.cancel('Synthetic user cancellation');
        assert(cancelled);
        assert.equal((await spent())[0].state, 'UNCERTAIN');
      },
    );
    await isolated(
      'Revocation before the first provider chunk prevents any streamed text exposure',
      async () => {
        const result = await wrapped({
          doStream: async () => {
            modelRequests++;
            await manager.query(
              'DELETE FROM core."rolePermissionFlag" WHERE id=$1',
              [roleFlagId],
            );
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    type: 'text-delta',
                    id: 'text',
                    delta: 'Must remain withheld',
                  });
                  controller.close();
                },
              }),
            };
          },
        }).doStream(request());
        await assert.rejects(() => result.stream.getReader().read());
        assert.equal((await spent())[0].state, 'UNCERTAIN');
      },
    );
    await isolated(
      'Unsupported media/options/provider tools fail before any model or ledger action',
      async () => {
        for (const parameters of [
          request({ headers: { 'x-provider-addon': 'unbounded' } }),
          request({ providerOptions: { openai: { serviceTier: 'priority' } } }),
          request({
            tools: [
              {
                type: 'provider',
                id: 'openai.web_search',
                name: 'web_search',
                args: {},
              },
            ],
          }),
          request({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    mediaType: 'image/png',
                    data: new Uint8Array([1]),
                  },
                ],
              },
            ],
          }),
        ])
          await deniesBeforeProvider(() => wrapped().doGenerate(parameters));
      },
    );
    await isolated(
      'Recovery releases stale undispatched work, holds dispatched cost, skips fresh/settled work and accepts late usage',
      async () => {
        const beforeRequests = modelRequests;
        const reservation = async () =>
          source.transaction((transaction) =>
            budget.reserveNative(transaction, {
              workspaceId: workspace.id,
              actorId: people.writer.memberId,
              sourceRunId: randomUUID(),
              modelId: MODEL_ID,
              maxOutputTokens: 64,
              modelContextWindowTokens: 1_000_000,
              modelMaxOutputTokens: 1000,
            }),
          );
        const sourceOf = (spend) => ({
          workspaceId: spend.workspaceId,
          sourceKind: spend.sourceKind,
          sourceRunId: spend.sourceRunId,
        });
        const undispatched = await reservation();
        const dispatched = await reservation();
        const fresh = await reservation();
        const freshlyDispatched = await reservation();
        const settled = await reservation();
        for (const spend of [dispatched, freshlyDispatched, settled])
          await budget.dispatch(
            sourceOf(spend),
            people.writer.userWorkspaceId,
            async (transaction) => {
              assert.equal(
                await native.actor(transaction, context()),
                people.writer.memberId,
              );
            },
          );
        await budget.settle(sourceOf(settled), {
          inputTokens: 11,
          outputTokens: 7,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        });
        const expired = new Date(
          Date.now() - OTOGROW_NATIVE_AI_RECOVERY_GRACE_MS - 60_000,
        );
        await manager.query(
          'UPDATE core."otogrowAiSpend" SET "createdAt"=$2 WHERE id=ANY($1::uuid[])',
          [
            [undispatched.id, dispatched.id, freshlyDispatched.id, settled.id],
            expired,
          ],
        );
        await manager.query(
          'UPDATE core."otogrowAiSpend" SET "dispatchedAt"=$2 WHERE id=ANY($1::uuid[])',
          [[dispatched.id, settled.id], expired],
        );
        const repository = manager.getRepository(OtogrowAiSpendEntity);
        const freshBefore = await repository.findOneByOrFail({ id: fresh.id });
        const freshlyDispatchedBefore = await repository.findOneByOrFail({
          id: freshlyDispatched.id,
        });
        const settledBefore = await repository.findOneByOrFail({
          id: settled.id,
        });
        await budget.recoverNativeSpends();
        const released = await repository.findOneByOrFail({
          id: undispatched.id,
        });
        const held = await repository.findOneByOrFail({ id: dispatched.id });
        assert.equal(released.state, 'RELEASED');
        assert.equal(released.actualMicroUsd, null);
        assert.equal(held.state, 'UNCERTAIN');
        assert.equal(held.actualMicroUsd, null);
        assert.equal(held.reservedMicroUsd, '1000064');
        assert.deepEqual(
          await repository.findOneByOrFail({ id: fresh.id }),
          freshBefore,
        );
        assert.deepEqual(
          await repository.findOneByOrFail({ id: freshlyDispatched.id }),
          freshlyDispatchedBefore,
        );
        assert.deepEqual(
          await repository.findOneByOrFail({ id: settled.id }),
          settledBefore,
        );
        const eventRows = () =>
          manager.query(
            'SELECT * FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 ORDER BY id',
            [workspace.id],
          );
        const stateAfterRecovery = await spent(),
          eventsAfterRecovery = await eventRows();
        await budget.recoverNativeSpends();
        assert.deepEqual(await spent(), stateAfterRecovery);
        assert.deepEqual(await eventRows(), eventsAfterRecovery);
        await budget.settle(sourceOf(dispatched), {
          inputTokens: 11,
          outputTokens: 7,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        });
        const late = await repository.findOneByOrFail({ id: dispatched.id });
        assert.equal(late.state, 'SETTLED');
        assert.equal(late.actualMicroUsd, '18');
        assert.equal(late.reservedMicroUsd, '1000064');
        assert.equal(modelRequests, beforeRequests);
      },
    );

    assert.equal(providerRequests, 0);
    await runner.query('ROLLBACK TO SAVEPOINT native_ai_fixture');
    await runner.query('RELEASE SAVEPOINT native_ai_fixture');
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    await runner.rollbackTransaction();
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    checks.push(
      `Original schema/data preserved across ${originalTables.length} installed tables`,
    );
    process.stdout.write(
      `${JSON.stringify({ passed: checks.length, checks, modelRequests, providerRequests, committedWrites: 0 }, null, 2)}\n`,
    );
  } finally {
    try {
      await drainTransactions();
      if (runner?.isTransactionActive) await runner.query('ROLLBACK');
    } finally {
      if (runner && !runner.isReleased) await runner.release();
      if (connectionSource.isInitialized) await connectionSource.destroy();
      for (const { owner, key, original } of transports) owner[key] = original;
    }
  }
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
