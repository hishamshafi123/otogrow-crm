const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  mkdtemp,
  readFile,
  writeFile,
  stat,
  unlink,
  readdir,
  rmdir,
} = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  createFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const quote = (value) => {
  assert.match(value, /^[A-Za-z0-9_]+$/);
  return `"${value}"`;
};
async function seedKnowledgeAssets(manager, prefix = 'knowledge_files') {
  const fixture = await createFixture(manager, prefix);
  await manager.query(
    `COMMENT ON SCHEMA ${quote(fixture.schemaName)} IS '${fixture.sentinel}'`,
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE "workspaceId"=$1',
    [
      fixture.workspaceId,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.reader.memberId,
        fixture.people.secondWriter.memberId,
      ]),
    ],
  );
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE "workspaceId"=$1',
    [fixture.workspaceId, []],
  );
  const [project] = await manager.query(
    'SELECT "companyId" FROM core."deliveryProject" WHERE id=$1',
    [fixture.projects.first],
  );
  fixture.companyId = project.companyId;
  fixture.sourceId = randomUUID();
  return fixture;
}
function knowledgeAssetServices(source, fixture, storage) {
  const {
    DeliveryKnowledgeAssetsService,
  } = require('../dist/modules/delivery/knowledge/assets/delivery-knowledge-assets.service');
  const {
    DeliveryKnowledgeService,
  } = require('../dist/modules/delivery/knowledge/delivery-knowledge.service');
  const {
    DeliveryKnowledgeReadsService,
  } = require('../dist/modules/delivery/knowledge/reads/delivery-knowledge-reads.service');
  const { delivery, access } = buildServices(source, fixture);
  const assets = new DeliveryKnowledgeAssetsService(source, delivery, storage);
  const knowledge = new DeliveryKnowledgeService(source, delivery);
  const reads = new DeliveryKnowledgeReadsService(source, delivery);
  const invoke = (service, method, args, person = fixture.people.writer) =>
    service[method](
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      ...args,
    );
  return {
    assets,
    knowledge,
    reads,
    delivery,
    access,
    file: (method, args, person) => invoke(assets, method, args, person),
    source: (method, input, person) =>
      invoke(knowledge, method, [input], person),
    read: (method, input, person) => invoke(reads, method, [input], person),
  };
}
function uploadInput(fixture, changes = {}, bytes = PNG) {
  return {
    requestId: randomUUID(),
    projectId: fixture.projects.first,
    sourceId: fixture.sourceId,
    sourceRevision: 0,
    expectedCompanyId: fixture.companyId,
    name: 'FIXTURE brand image.png',
    size: bytes.length,
    sha256: digest(bytes),
    ...changes,
  };
}
const selection = (input) => ({
  projectId: input.projectId,
  sourceId: input.sourceId,
  requestId: input.requestId,
  sha256: input.sha256,
});
const sourceInput = (fixture, input, revision = 0, changes = {}) => ({
  id: fixture.sourceId,
  projectId: fixture.projects.first,
  revision,
  title: 'FIXTURE published brand files',
  category: 'ASSET_REFERENCE',
  meetingDate: '2026-11-05',
  sourceUrl: '',
  transcript: 'PRIVATE fixture upload notes.',
  knowledge: 'Approved fixture logo usage instructions.',
  attachments: [{ id: input.requestId, sha256: input.sha256 }],
  ...changes,
});
async function temporaryKnowledgeStorage(fixture) {
  const root = await mkdtemp(join(tmpdir(), 'otogrow-knowledge-files-'));
  const files = new Map();
  const allocated = new Set();
  const calls = { writes: 0, reads: 0, deletes: 0 };
  const hooks = {
    beforeWrite: null,
    afterWrite: null,
    beforeRead: null,
    beforeDelete: null,
    afterDelete: null,
  };
  const path = (filePath) => {
    const match = filePath.match(
      /^([a-f0-9-]{36})\/delivery-knowledge\/([a-f0-9-]{36})$/,
    );
    assert(
      match && match[1] === fixture.workspaceId,
      'Storage path must belong to this disposable workspace.',
    );
    assert(
      allocated.has(match[2]),
      'A file ID must be allocated before storage access.',
    );
    return join(root, match[2]);
  };
  const driver = {
    writeFile: async ({ filePath, sourceFile }) => {
      const local = path(filePath);
      assert(Buffer.isBuffer(sourceFile));
      calls.writes++;
      await hooks.beforeWrite?.({ local, sourceFile });
      await writeFile(local, sourceFile, { mode: 0o600, flag: 'wx' });
      files.set(local, digest(sourceFile));
      await hooks.afterWrite?.({ local, sourceFile });
    },
    getFileMetadata: async ({ filePath }) => {
      try {
        const info = await stat(path(filePath));
        return { size: info.size, lastModified: info.mtime };
      } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }
    },
    checkFileExists: async ({ filePath }) => {
      try {
        await stat(path(filePath));
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    },
    readFile: async ({ filePath }) => {
      const local = path(filePath);
      calls.reads++;
      await hooks.beforeRead?.({ local });
      return createReadStream(local);
    },
    delete: async ({ folderPath, filename }) => {
      const local = path(`${folderPath}/${filename}`);
      calls.deletes++;
      await hooks.beforeDelete?.({ local });
      try {
        await unlink(local);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      files.delete(local);
      await hooks.afterDelete?.({ local });
    },
  };
  return {
    root,
    calls,
    hooks,
    driver,
    getCurrentDriver: () => driver,
    allocate: (input) => allocated.add(input.requestId),
    async cleanup() {
      const names = await readdir(root);
      assert.deepEqual(
        new Set(names),
        new Set([...files.keys()].map((file) => file.slice(root.length + 1))),
        'Unexpected storage bytes prevent cleanup.',
      );
      for (const [file, expected] of files) {
        assert.equal(
          digest(await readFile(file)),
          expected,
          'Changed bytes prevent exact cleanup.',
        );
        await unlink(file);
      }
      await rmdir(root);
    },
  };
}
module.exports = {
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
};
