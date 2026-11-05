const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  originalDigest,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  readDeliveryKnowledgeContext,
} = require('../dist/modules/delivery/knowledge/delivery-knowledge-context');
const {
  PNG,
  PDF,
  digest,
  quote,
  seedKnowledgeAssets,
  knowledgeAssetServices,
  uploadInput,
  selection,
  sourceInput,
  temporaryKnowledgeStorage,
} = require('./check-delivery-knowledge-assets-support.cjs');

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker only performs rollback acceptance.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  let providerRequests = 0;
  for (const { owner, key } of transports)
    owner[key] = () => {
      providerRequests++;
      throw new Error('No providers are allowed in brand-file acceptance.');
    };
  let runner, storage, original, originalSchema;
  const sessions = new Set();
  const checks = [];
  const check = async (name, operation) => {
    await operation();
    checks.push(name);
  };
  try {
    await connectionSource.initialize();
    original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    originalSchema = await schemaFingerprint(connectionSource);
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let failActivity = false;
    const query = runner.query.bind(runner);
    runner.query = async (...args) => {
      if (
        failActivity &&
        /^\s*INSERT\b/i.test(args[0]) &&
        args[0].includes('otogrowActivityEvent')
      ) {
        failActivity = false;
        throw new Error('FIXTURE activity insertion failed.');
      }
      return query(...args);
    };
    const fixture = await seedKnowledgeAssets(runner.manager);
    storage = await temporaryKnowledgeStorage(fixture);
    let failNextTransaction = false;
    const source = {
      manager: runner.manager,
      query: (...args) => runner.query(...args),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (operation) =>
        runner.manager.transaction(async (manager) => {
          if (failNextTransaction) {
            failNextTransaction = false;
            throw new Error('FIXTURE interrupted finalization.');
          }
          return operation(manager);
        }),
      createQueryRunner: () => {
        const session = connectionSource.createQueryRunner();
        const release = session.release.bind(session);
        sessions.add(session);
        session.release = async () => {
          try {
            await release();
          } finally {
            sessions.delete(session);
          }
        };
        return session;
      },
    };
    const domain = knowledgeAssetServices(source, fixture, storage);
    const admin = fixture.people.admin,
      writer = fixture.people.writer,
      reader = fixture.people.reader;
    const upload = async (input, bytes = PNG, person = writer) => {
      storage.allocate(input);
      return domain.file(
        'upload',
        [input, { buffer: bytes, originalname: input.name }],
        person,
      );
    };
    const row = async (id) =>
      (
        await runner.query(
          'SELECT * FROM core."deliveryKnowledgeAsset" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, id],
        )
      )[0];
    const temporaryMetadata = async (operation) => {
      const rollback = new Error('FIXTURE rollback quota metadata.');
      await assert.rejects(
        () =>
          runner.manager.transaction(async () => {
            await operation();
            throw rollback;
          }),
        (error) => error === rollback,
      );
    };
    const reserveProjectBytes = async (templateId) => {
      const [current] = await runner.query(
        'SELECT sum(size)::bigint::text AS total FROM core."deliveryKnowledgeAsset" WHERE "workspaceId"=$1 AND "projectId"=$2 AND "cleanedAt" IS NULL',
        [fixture.workspaceId, fixture.projects.first],
      );
      let remaining = 1073741824 - Number(current.total);
      while (remaining > 0) {
        const size = Math.min(remaining, 20971520);
        await runner.query(
          `INSERT INTO core."deliveryKnowledgeAsset" (id,"workspaceId","projectId","sourceId","sourceRevision","companyId",name,size,sha256,"mimeType","uploadedBy","uploaderUserWorkspaceId","inputHash",state,"readyAt","failureReason","cleanedAt") SELECT $2,"workspaceId","projectId",$3,"sourceRevision","companyId",name,$4,sha256,"mimeType","uploadedBy","uploaderUserWorkspaceId","inputHash",'PENDING',NULL,NULL,NULL FROM core."deliveryKnowledgeAsset" WHERE id=$1`,
          [templateId, randomUUID(), randomUUID(), size],
        );
        remaining -= size;
      }
    };
    const actions = async (id) =>
      await runner.query(
        'SELECT action,"actorType","actorId" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND changes @> $2::jsonb ORDER BY "occurredAt",id',
        [
          fixture.workspaceId,
          JSON.stringify([{ field: 'assetId', after: id }]),
        ],
      );
    const download = (input, person = writer, version) =>
      domain.file(
        'download',
        [input.requestId, version ? fixture.sourceId : undefined, version],
        person,
      );
    const currentSource = async () =>
      (
        await runner.query(
          'SELECT * FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, fixture.sourceId],
        )
      )[0];
    const publish = async (value) =>
      domain.source(
        'publish',
        {
          projectId: fixture.projects.first,
          id: fixture.sourceId,
          revision: (await currentSource()).revision,
          publish: value,
        },
        admin,
      );
    const saved = uploadInput(fixture);

    await check(
      'An absent upload has an identity-bound null receipt',
      async () => {
        const status = await domain.file('status', [selection(saved)]);
        assert.equal(status.receipt, null);
        assert.equal(status.memberId, writer.memberId);
        assert.equal(status.projectId, fixture.projects.first);
      },
    );
    await check(
      'Exact PNG upload is READY with matching detected type, digest and private bytes',
      async () => {
        const result = await upload(saved);
        assert.equal(result.receipt.state, 'READY');
        assert.equal(result.receipt.mimeType, 'image/png');
        assert.equal(result.receipt.sha256, digest(PNG));
        assert.deepEqual((await download(saved)).bytes, PNG);
      },
    );
    await check(
      'Repeated upload recovers one receipt without writing the file again',
      async () => {
        const before = storage.calls.writes;
        const first = await domain.file('status', [selection(saved)]);
        const again = await upload(saved);
        assert.deepEqual(again, first);
        assert.equal(storage.calls.writes, before);
        assert.deepEqual(
          (await actions(saved.requestId)).map((event) => event.action).sort(),
          ['KNOWLEDGE_FILE_READY', 'KNOWLEDGE_FILE_UPLOAD_STARTED'],
        );
      },
    );
    await check(
      'Reusing a request with changed name or digest is rejected',
      async () => {
        await assert.rejects(() => upload({ ...saved, name: 'different.png' }));
        await assert.rejects(() =>
          domain.file('status', [
            { ...selection(saved), sha256: '0'.repeat(64) },
          ]),
        );
      },
    );
    await check(
      'Wrong extension, byte size and hash are rejected before storage',
      async () => {
        const before = storage.calls.writes;
        for (const change of [
          { name: 'wrong.pdf' },
          { size: PNG.length + 1 },
          { sha256: '0'.repeat(64) },
          { name: '../file.png' },
        ])
          await assert.rejects(() => upload(uploadInput(fixture, change)));
        assert.equal(storage.calls.writes, before);
      },
    );
    await check(
      'Foreign source, client and stale initial revision cannot create an upload',
      async () => {
        for (const change of [
          { projectId: fixture.projects.foreign },
          { expectedCompanyId: randomUUID() },
          { sourceRevision: 1 },
        ])
          await assert.rejects(() => upload(uploadInput(fixture, change)));
      },
    );
    await check(
      'Project staff cannot read a private upload or enumerate another uploader files',
      async () => {
        await assert.rejects(() => download(saved, reader));
        await assert.rejects(() =>
          domain.file('status', [selection(saved)], reader),
        );
        const list = await domain.file(
          'list',
          [{ projectId: fixture.projects.first }],
          reader,
        );
        assert.deepEqual(list.items, []);
        const own = await domain.file('list', [
          { projectId: fixture.projects.first },
        ]);
        assert.equal(own.items[0].id, saved.requestId);
      },
    );
    await check('A manager can inspect the scoped private upload', async () => {
      assert.deepEqual((await download(saved, admin)).bytes, PNG);
    });
    await check(
      'Wrong-category, duplicate and unknown attachment bindings fail without a source',
      async () => {
        for (const change of [
          { category: 'MEETING' },
          { attachments: [{ id: randomUUID(), sha256: saved.sha256 }] },
          {
            attachments: [
              { id: saved.requestId, sha256: saved.sha256 },
              { id: saved.requestId, sha256: saved.sha256 },
            ],
          },
        ])
          await assert.rejects(() =>
            domain.source('save', sourceInput(fixture, saved, 0, change)),
          );
        assert.equal(await currentSource(), undefined);
      },
    );
    await check(
      'The exact READY file binds to an immutable private knowledge version',
      async () => {
        await domain.source('save', sourceInput(fixture, saved));
        const detail = await domain.source('snapshot', {
          projectId: fixture.projects.first,
          sourceId: fixture.sourceId,
        });
        assert.equal(detail.detail.attachments[0].id, saved.requestId);
        assert.equal(detail.detail.attachments[0].sha256, saved.sha256);
        await assert.rejects(() =>
          domain.source(
            'snapshot',
            { projectId: fixture.projects.first, sourceId: fixture.sourceId },
            reader,
          ),
        );
        assert.equal(
          (await domain.file('list', [{ projectId: fixture.projects.first }]))
            .items.length,
          0,
        );
      },
    );
    await check(
      'Activity failure rolls back a knowledge version and its file binding',
      async () => {
        const before = await currentSource();
        failActivity = true;
        await assert.rejects(
          () =>
            domain.source(
              'save',
              sourceInput(fixture, saved, before.revision, {
                knowledge: 'FIXTURE should roll back.',
              }),
            ),
          /FIXTURE activity insertion failed/,
        );
        assert.deepEqual(await currentSource(), before);
        const versions = await runner.query(
          'SELECT version FROM core."deliveryKnowledgeVersion" WHERE "sourceId"=$1',
          [fixture.sourceId],
        );
        assert.deepEqual(
          versions.map((item) => item.version),
          [1],
        );
      },
    );
    await check(
      'A bound file cannot be discarded, including by its uploader',
      async () => {
        const before = storage.calls.deletes;
        await assert.rejects(() =>
          domain.file('recover', [selection(saved), true]),
        );
        assert.equal(storage.calls.deletes, before);
        assert.equal((await row(saved.requestId)).state, 'READY');
      },
    );
    await check(
      'Only a manager publishes; staff then downloads the exact published version',
      async () => {
        await assert.rejects(() =>
          domain.source('publish', {
            projectId: fixture.projects.first,
            id: fixture.sourceId,
            revision: 1,
            publish: true,
          }),
        );
        await publish(true);
        assert.deepEqual((await download(saved, reader, 1)).bytes, PNG);
        await assert.rejects(() => download(saved, reader));
        const detail = await domain.source(
          'snapshot',
          { projectId: fixture.projects.first, sourceId: fixture.sourceId },
          reader,
        );
        assert.equal(detail.detail.transcript, null);
        assert.equal(detail.detail.sourceUrl, '');
        assert.equal(detail.detail.attachments[0].sha256, saved.sha256);
      },
    );
    const replacement = uploadInput(
      fixture,
      { sourceRevision: 2, name: 'FIXTURE guideline.pdf' },
      PDF,
    );
    await check(
      'A newer private draft preserves the previously published file',
      async () => {
        await upload(replacement, PDF);
        assert.equal(
          (await row(replacement.requestId)).mimeType,
          'application/pdf',
        );
        await domain.source(
          'save',
          sourceInput(fixture, replacement, 2, {
            knowledge: 'Unpublished replacement usage rules.',
          }),
        );
        assert.deepEqual((await download(saved, reader, 1)).bytes, PNG);
        await assert.rejects(() => download(replacement, reader, 2));
        const context = await readDeliveryKnowledgeContext(
          runner.manager,
          fixture.workspaceId,
          fixture.projects.first,
        );
        assert(!JSON.stringify(context).includes('Unpublished replacement'));
        assert(!JSON.stringify(context).includes('PRIVATE'));
      },
    );
    await check(
      'Publishing a replacement denies prior staff URLs but retains authorized history',
      async () => {
        await publish(true);
        await assert.rejects(() => download(saved, reader, 1));
        assert.deepEqual((await download(replacement, reader, 2)).bytes, PDF);
        assert.deepEqual((await download(saved, writer, 1)).bytes, PNG);
      },
    );
    await check(
      'Withdrawal immediately removes staff bytes and assistant source context',
      async () => {
        await publish(false);
        await assert.rejects(() => download(replacement, reader, 2));
        assert.equal(
          (
            await readDeliveryKnowledgeContext(
              runner.manager,
              fixture.workspaceId,
              fixture.projects.first,
            )
          ).totalSources,
          0,
        );
        assert.deepEqual((await download(replacement, writer, 2)).bytes, PDF);
        await publish(true);
      },
    );
    await check(
      'Retained file history counts toward the project byte cap while exact retries remain available',
      () =>
        temporaryMetadata(async () => {
          await reserveProjectBytes(saved.requestId);
          const writes = storage.calls.writes;
          await assert.rejects(
            () => upload(uploadInput(fixture, { sourceId: randomUUID() })),
            /brand-file storage limit/,
          );
          assert.equal((await upload(saved)).receipt.id, saved.requestId);
          assert.equal(storage.calls.writes, writes);
        }),
    );
    await check(
      'Pending metadata reserves the finite project file-count capacity before storage',
      () =>
        temporaryMetadata(async () => {
          await runner.query(
            `INSERT INTO core."deliveryKnowledgeAsset" (id,"workspaceId","projectId","sourceId","sourceRevision","companyId",name,size,sha256,"mimeType","uploadedBy","uploaderUserWorkspaceId","inputHash",state,"readyAt","failureReason","cleanedAt") SELECT gen_random_uuid(),"workspaceId","projectId","sourceId","sourceRevision","companyId",name,1,sha256,"mimeType","uploadedBy","uploaderUserWorkspaceId","inputHash",'PENDING',NULL,NULL,NULL FROM core."deliveryKnowledgeAsset",generate_series(1,500) WHERE id=$1`,
            [saved.requestId],
          );
          const writes = storage.calls.writes;
          await assert.rejects(
            () => upload(uploadInput(fixture, { sourceId: randomUUID() })),
            /brand-file storage limit/,
          );
          assert.equal(storage.calls.writes, writes);
        }),
    );
    await check(
      'Exact unused-file cleanup frees the project byte allowance without touching retained files',
      () =>
        temporaryMetadata(async () => {
          const unused = uploadInput(fixture, { sourceId: randomUUID() });
          await upload(unused);
          await reserveProjectBytes(unused.requestId);
          const next = uploadInput(fixture, { sourceId: randomUUID() });
          await assert.rejects(() => upload(next), /brand-file storage limit/);
          assert.equal(
            (await domain.file('recover', [selection(unused), true])).receipt
              .cleanupPending,
            false,
          );
          assert.equal((await upload(next)).receipt.state, 'READY');
          assert.deepEqual((await download(saved, writer, 1)).bytes, PNG);
        }),
    );
    await check(
      'Client relink hides both file bytes and surrounding knowledge context',
      async () => {
        await runner.query(
          'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
          [fixture.projects.first, randomUUID()],
        );
        await assert.rejects(() => download(replacement, reader, 2));
        assert.equal(
          (
            await readDeliveryKnowledgeContext(
              runner.manager,
              fixture.workspaceId,
              fixture.projects.first,
            )
          ).totalSources,
          0,
        );
        await assert.rejects(() =>
          domain.source(
            'snapshot',
            { projectId: fixture.projects.first, sourceId: fixture.sourceId },
            reader,
          ),
        );
        await runner.query(
          'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
          [fixture.projects.first, fixture.companyId],
        );
      },
    );
    await check(
      'Membership removed during storage read prevents returning bytes',
      async () => {
        storage.hooks.beforeRead = async () => {
          storage.hooks.beforeRead = null;
          await runner.query(
            'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
            [fixture.projects.first, JSON.stringify([writer.memberId])],
          );
        };
        await assert.rejects(() => download(replacement, reader, 2));
        await runner.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
          [
            fixture.projects.first,
            JSON.stringify([
              writer.memberId,
              reader.memberId,
              fixture.people.secondWriter.memberId,
            ]),
          ],
        );
      },
    );
    await check(
      'Workspace membership loss prevents even an existing private file receipt',
      async () => {
        await runner.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          [writer.userWorkspaceId],
        );
        await assert.rejects(() => domain.file('status', [selection(saved)]));
        await runner.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
          [writer.userWorkspaceId],
        );
      },
    );
    const interrupted = uploadInput(fixture, { sourceId: randomUUID() });
    await check(
      'Losing source edit authority removes upload edit actions while preserving owner cleanup and published staff access',
      async () => {
        const sourceId = randomUUID();
        const ready = uploadInput(fixture, { sourceId });
        const pending = uploadInput(fixture, { sourceId });
        await upload(ready);
        storage.hooks.afterWrite = async () => {
          storage.hooks.afterWrite = null;
          failNextTransaction = true;
        };
        await assert.rejects(
          () => upload(pending),
          /FIXTURE interrupted finalization/,
        );
        const input = sourceInput(fixture, ready, 0, {
          id: sourceId,
          attachments: [],
        });
        await domain.source('save', input, admin);
        for (const uploadInput of [ready, pending]) {
          const receipt = (
            await domain.file('status', [selection(uploadInput)])
          ).receipt;
          assert.equal(receipt.canAttach, false);
          assert.equal(receipt.canRecover, false);
          assert.equal(receipt.canDiscard, true);
        }
        const list = await domain.file('list', [
          { projectId: fixture.projects.first, sourceId },
        ]);
        assert.equal(list.items.length, 2);
        assert(
          list.items.every(
            (item) => !item.canAttach && !item.canRecover && item.canDiscard,
          ),
        );
        await assert.rejects(() =>
          domain.file('recover', [selection(pending)]),
        );
        assert.equal(
          (await domain.file('recover', [selection(pending), true])).receipt
            .cleanupPending,
          false,
        );
        await domain.source(
          'save',
          {
            ...input,
            revision: 1,
            attachments: [{ id: ready.requestId, sha256: ready.sha256 }],
          },
          admin,
        );
        await domain.source(
          'publish',
          {
            id: sourceId,
            projectId: fixture.projects.first,
            revision: 2,
            publish: true,
          },
          admin,
        );
        assert.deepEqual(
          (
            await domain.file(
              'download',
              [ready.requestId, sourceId, 2],
              reader,
            )
          ).bytes,
          PNG,
        );
      },
    );
    await check(
      'A client relink during upload blocks late completion and leaves only redacted owner cleanup',
      async () => {
        const input = uploadInput(fixture, { sourceId: randomUUID() });
        storage.hooks.afterWrite = async () => {
          storage.hooks.afterWrite = null;
          await runner.query(
            'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
            [fixture.projects.first, randomUUID()],
          );
        };
        await assert.rejects(() => upload(input));
        assert.equal((await row(input.requestId)).state, 'PENDING');
        const receipt = (await domain.file('status', [selection(input)]))
          .receipt;
        assert.equal(receipt.availability, 'PREVIOUS_COMPANY');
        assert.equal(receipt.canRecover, false);
        assert.equal(receipt.canAttach, false);
        await assert.rejects(() => domain.file('recover', [selection(input)]));
        assert.equal(
          (await domain.file('recover', [selection(input), true])).receipt
            .cleanupPending,
          false,
        );
        await runner.query(
          'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
          [fixture.projects.first, fixture.companyId],
        );
      },
    );
    await check(
      'A failed claim activity leaves no upload row, bytes or activity',
      async () => {
        const input = uploadInput(fixture, { sourceId: randomUUID() });
        const writes = storage.calls.writes;
        failActivity = true;
        await assert.rejects(
          () => upload(input),
          /FIXTURE activity insertion failed/,
        );
        assert.equal(await row(input.requestId), undefined);
        assert.deepEqual(await actions(input.requestId), []);
        assert.equal(storage.calls.writes, writes);
      },
    );
    await check(
      'A failed READY activity preserves PENDING bytes and recovery records one transition',
      async () => {
        const input = uploadInput(fixture, { sourceId: randomUUID() });
        storage.hooks.afterWrite = async () => {
          storage.hooks.afterWrite = null;
          failActivity = true;
        };
        await assert.rejects(
          () => upload(input),
          /FIXTURE activity insertion failed/,
        );
        assert.equal((await row(input.requestId)).state, 'PENDING');
        assert.deepEqual(
          (await actions(input.requestId)).map((event) => event.action),
          ['KNOWLEDGE_FILE_UPLOAD_STARTED'],
        );
        const writes = storage.calls.writes;
        assert.equal(
          (await domain.file('recover', [selection(input)])).receipt.state,
          'READY',
        );
        await domain.file('recover', [selection(input)]);
        assert.equal(storage.calls.writes, writes);
        assert.deepEqual(
          (await actions(input.requestId)).map((event) => event.action).sort(),
          ['KNOWLEDGE_FILE_READY', 'KNOWLEDGE_FILE_UPLOAD_STARTED'],
        );
      },
    );
    await check(
      'Failed storage activity rolls back failure, then explicit recovery records automatic cleanup',
      async () => {
        const input = uploadInput(fixture, { sourceId: randomUUID() });
        storage.hooks.beforeWrite = async () => {
          storage.hooks.beforeWrite = null;
          failActivity = true;
          throw new Error('FIXTURE failed storage and activity.');
        };
        await assert.rejects(
          () => upload(input),
          /FIXTURE activity insertion failed/,
        );
        assert.equal((await row(input.requestId)).state, 'PENDING');
        const recovered = await domain.file('recover', [selection(input)]);
        assert.equal(recovered.receipt.state, 'FAILED');
        assert.equal(recovered.receipt.cleanupPending, false);
        const recorded = await actions(input.requestId);
        assert.deepEqual(recorded.map((event) => event.action).sort(), [
          'KNOWLEDGE_FILE_CLEANED',
          'KNOWLEDGE_FILE_UPLOAD_FAILED',
          'KNOWLEDGE_FILE_UPLOAD_STARTED',
        ]);
        for (const event of recorded.filter(
          (event) => event.action !== 'KNOWLEDGE_FILE_UPLOAD_STARTED',
        )) {
          assert.equal(event.actorType, 'SYSTEM');
          assert.equal(event.actorId, null);
        }
      },
    );
    await check(
      'Failed discard activity preserves READY bytes; cleanup activity failure remains retryable',
      async () => {
        const input = uploadInput(fixture, { sourceId: randomUUID() });
        await upload(input);
        const deletes = storage.calls.deletes;
        failActivity = true;
        await assert.rejects(
          () => domain.file('recover', [selection(input), true]),
          /FIXTURE activity insertion failed/,
        );
        assert.equal((await row(input.requestId)).state, 'READY');
        assert.equal(storage.calls.deletes, deletes);
        assert.deepEqual((await download(input)).bytes, PNG);
        storage.hooks.afterDelete = async () => {
          storage.hooks.afterDelete = null;
          failActivity = true;
        };
        const incomplete = await domain.file('recover', [
          selection(input),
          true,
        ]);
        assert.equal(incomplete.receipt.cleanupPending, true);
        assert.equal((await row(input.requestId)).cleanedAt, null);
        const complete = await domain.file('recover', [selection(input), true]);
        assert.equal(complete.receipt.cleanupPending, false);
        await domain.file('recover', [selection(input), true]);
        assert.deepEqual(
          (await actions(input.requestId)).map((event) => event.action).sort(),
          [
            'KNOWLEDGE_FILE_CLEANED',
            'KNOWLEDGE_FILE_DISCARDED',
            'KNOWLEDGE_FILE_READY',
            'KNOWLEDGE_FILE_UPLOAD_STARTED',
          ],
        );
      },
    );
    await check(
      'Interrupted finalization keeps an exact recoverable PENDING request',
      async () => {
        storage.hooks.afterWrite = async () => {
          storage.hooks.afterWrite = null;
          failNextTransaction = true;
        };
        await assert.rejects(
          () => upload(interrupted),
          /FIXTURE interrupted finalization/,
        );
        assert.equal((await row(interrupted.requestId)).state, 'PENDING');
        const before = storage.calls.writes;
        const recovered = await domain.file('recover', [
          selection(interrupted),
        ]);
        assert.equal(recovered.receipt.state, 'READY');
        assert.equal(storage.calls.writes, before);
      },
    );
    await check(
      'Explicit discard removes only the exact unused private file',
      async () => {
        const result = await domain.file('recover', [
          selection(interrupted),
          true,
        ]);
        assert.equal(result.receipt.state, 'FAILED');
        assert.equal(result.receipt.cleanupPending, false);
        assert.deepEqual((await download(saved, writer, 1)).bytes, PNG);
      },
    );
    const broken = uploadInput(fixture, { sourceId: randomUUID() });
    await check(
      'Failed writes retain a non-retryable identity and require a fresh upload',
      async () => {
        storage.hooks.beforeWrite = async () => {
          storage.hooks.beforeWrite = null;
          throw new Error('FIXTURE storage unavailable');
        };
        assert.equal((await upload(broken)).receipt.state, 'FAILED');
        const before = storage.calls.writes;
        assert.equal((await upload(broken)).receipt.state, 'FAILED');
        assert.equal(storage.calls.writes, before);
        const fresh = { ...broken, requestId: randomUUID() };
        assert.equal((await upload(fresh)).receipt.state, 'READY');
      },
    );
    const deletion = uploadInput(fixture, { sourceId: randomUUID() });
    await check(
      'Failed exact cleanup remains visible and safely retries without a new upload',
      async () => {
        await upload(deletion);
        storage.hooks.beforeDelete = async () => {
          storage.hooks.beforeDelete = null;
          throw new Error('FIXTURE delete unavailable');
        };
        assert.equal(
          (await domain.file('recover', [selection(deletion), true])).receipt
            .cleanupPending,
          true,
        );
        const visible = await domain.file('list', [
          { projectId: fixture.projects.first },
        ]);
        assert(visible.items.some((item) => item.id === deletion.requestId));
        const before = storage.calls.writes;
        assert.equal(
          (await domain.file('recover', [selection(deletion), true])).receipt
            .cleanupPending,
          false,
        );
        assert.equal(storage.calls.writes, before);
      },
    );
    await check(
      'Native project outsiders cannot list or download retained files',
      async () => {
        await assert.rejects(() =>
          domain.file(
            'list',
            [{ projectId: fixture.projects.first }],
            fixture.people.outsider,
          ),
        );
        await assert.rejects(() =>
          download(replacement, fixture.people.outsider, 2),
        );
      },
    );
    await check(
      'Prior-client unused files stay redacted and only their owner can clean them to free quota',
      async () => {
        const sourceId = randomUUID();
        const old = [];
        for (let index = 0; index < 20; index++) {
          const input = uploadInput(fixture, {
            sourceId,
            name: `PRIVATE previous brand ${index}.png`,
          });
          await upload(input);
          old.push(input);
        }
        const companyId = randomUUID();
        await runner.query(
          'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
          [fixture.projects.first, companyId],
        );
        const list = await domain.file('list', [
          { projectId: fixture.projects.first, sourceId },
        ]);
        assert.equal(list.items.length, 20);
        for (const item of list.items) {
          assert.equal(item.availability, 'PREVIOUS_COMPANY');
          assert(!item.name.includes('PRIVATE'));
          assert.equal(item.canAttach, false);
          assert.equal(item.canRecover, false);
          assert.equal(item.canDiscard, true);
        }
        const status = await domain.file('status', [selection(old[0])]);
        assert.equal(
          status.receipt.name,
          'Unused upload from an earlier brand',
        );
        await assert.rejects(() => download(old[0]));
        await assert.rejects(() => domain.file('recover', [selection(old[0])]));
        for (const person of [reader, admin])
          await assert.rejects(() =>
            domain.file('recover', [selection(old[0]), true], person),
          );
        const next = uploadInput(fixture, {
          sourceId,
          expectedCompanyId: companyId,
        });
        await assert.rejects(
          () => upload(next),
          /Remove unused private uploads/,
        );
        assert.equal(
          (await domain.file('recover', [selection(old[0]), true])).receipt
            .cleanupPending,
          false,
        );
        assert.equal((await upload(next)).receipt.state, 'READY');
        await runner.query(
          'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
          [fixture.projects.first, fixture.companyId],
        );
      },
    );
    await check(
      'A stale knowledge save cannot replace published bindings',
      async () => {
        await assert.rejects(() =>
          domain.source('save', sourceInput(fixture, saved, 1)),
        );
        assert.deepEqual((await download(replacement, reader, 2)).bytes, PDF);
      },
    );
    assert.equal(
      sessions.size,
      0,
      'Every upload/recovery session lock is released.',
    );
    assert.equal(providerRequests, 0);
  } finally {
    for (const session of sessions)
      if (!session.isReleased) await session.release();
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    if (connectionSource.isInitialized && original)
      assert.equal(
        await originalDigest((...args) => connectionSource.query(...args)),
        original,
        'Original schema/data changed.',
      );
    if (connectionSource.isInitialized && originalSchema)
      assert.equal(await schemaFingerprint(connectionSource), originalSchema);
    if (storage) await storage.cleanup();
    if (connectionSource.isInitialized) await connectionSource.destroy();
    for (const { owner, key, original: transport } of transports)
      owner[key] = transport;
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks: checks.length,
        evidence: checks,
        providerRequests,
        preservation:
          'All database changes rolled back; exact temporary files removed; original schema/data unchanged.',
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
