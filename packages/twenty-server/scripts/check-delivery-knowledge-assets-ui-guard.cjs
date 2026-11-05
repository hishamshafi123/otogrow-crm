const assert = require('node:assert/strict');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const { fingerprint } = require('./check-delivery-assistants-ui-fixture.cjs');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const expectedFileEvents = {
  KNOWLEDGE_FILE_UPLOAD_STARTED: {
    before: null,
    after: 'PENDING',
    summary: 'Started a private brand-file upload; it is not published.',
  },
  KNOWLEDGE_FILE_READY: {
    before: 'PENDING',
    after: 'READY',
    summary:
      'Verified an uploaded brand file; publication remains a separate review.',
  },
};
const sourceActions = {
  SAVE: {
    action: 'KNOWLEDGE_DRAFT_SAVED',
    summary: 'Saved a brand knowledge draft; published context is unchanged.',
    outcome: 'RECORDED',
  },
  PUBLISH: {
    action: 'KNOWLEDGE_PUBLISHED',
    summary:
      'Published reviewed brand knowledge for scoped project assistants.',
    outcome: 'APPROVED',
  },
  WITHDRAW: {
    action: 'KNOWLEDGE_WITHDRAWN',
    summary: 'Withdrew brand knowledge from new assistant context.',
    outcome: 'RECORDED',
  },
};
const iso = (value) => {
  const date = new Date(value);
  assert(Number.isFinite(date.getTime()), 'Fixture timestamp must be valid.');
  return date.toISOString();
};
const dateAtOrAfter = (value, lower) => {
  assert(new Date(iso(value)).getTime() >= new Date(iso(lower)).getTime());
};
const uploadMatches = (asset, upload, fixture) => {
  const input = upload.input;
  return (
    (!input.requestId || input.requestId === asset.id) &&
    asset.workspaceId === fixture.workspaceId &&
    asset.uploadedBy === fixture.actorId &&
    asset.uploaderUserWorkspaceId === fixture.userWorkspaceId &&
    asset.companyId === input.expectedCompanyId &&
    asset.mimeType === upload.mimeType &&
    ['projectId', 'sourceId', 'sourceRevision', 'name', 'size', 'sha256'].every(
      (field) => asset[field] === input[field],
    )
  );
};

async function validateOwnedRows(manager, fixture) {
  for (const id of [
    fixture.workspaceId,
    fixture.projectId,
    fixture.actorId,
    fixture.userWorkspaceId,
  ])
    assert.match(id, UUID);
  assert(Array.isArray(fixture.uploads) && fixture.uploads.length <= 2);
  assert(Array.isArray(fixture.commands) && fixture.commands.length <= 8);
  if (fixture.sourceId) assert.match(fixture.sourceId, UUID);
  else assert(fixture.uploads.length === 0 && fixture.commands.length === 0);
  for (const upload of fixture.uploads) {
    assert.equal(upload.input.projectId, fixture.projectId);
    assert.equal(upload.input.sourceId, fixture.sourceId);
    assert.equal(upload.input.expectedCompanyId, fixture.projectSeed.companyId);
    assert.equal(upload.input.sourceRevision, 0);
    assert(upload.declaredAt, 'Declare the exact upload before submission.');
    iso(upload.declaredAt);
    if (upload.input.requestId) assert.match(upload.input.requestId, UUID);
    assert(upload.input.name && upload.input.name === upload.input.name.trim());
    assert(Number.isInteger(upload.input.size) && upload.input.size > 0);
    assert(upload.input.size <= 20 * 1024 * 1024);
    assert.match(upload.input.sha256, /^[a-f0-9]{64}$/);
    assert(['image/png', 'application/pdf'].includes(upload.mimeType));
  }
  for (const [index, command] of fixture.commands.entries()) {
    assert(command.declaredAt);
    iso(command.declaredAt);
    assert(['SAVE', 'PUBLISH'].includes(command.kind));
    assert.equal(command.input.id, fixture.sourceId);
    assert.equal(command.input.projectId, fixture.projectId);
    assert.equal(command.input.revision, index);
    if (command.kind === 'PUBLISH')
      assert.equal(typeof command.input.publish, 'boolean');
    else {
      assert.equal(command.input.category, 'ASSET_REFERENCE');
      for (const key of ['title', 'sourceUrl', 'transcript', 'knowledge'])
        assert.equal(command.input[key], command.input[key].trim());
      assert(
        !command.input.fathomImportProof && !command.input.fathomImportHash,
      );
      assert(Array.isArray(command.input.attachments));
      assert(command.input.attachments.length <= 2);
    }
  }
  const rows = {
    projects: await manager.query(
      'SELECT * FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=$2 ORDER BY id',
      [fixture.workspaceId, fixture.projectId],
    ),
    sources: await manager.query(
      'SELECT * FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
      [fixture.workspaceId, fixture.projectId],
    ),
    versions: await manager.query(
      'SELECT version.*,version."meetingDate"::text AS "meetingDate" FROM core."deliveryKnowledgeVersion" version WHERE version."workspaceId"=$1 AND version."sourceId"=$2 ORDER BY version.version',
      [fixture.workspaceId, fixture.sourceId],
    ),
    assets: await manager.query(
      'SELECT * FROM core."deliveryKnowledgeAsset" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
      [fixture.workspaceId, fixture.projectId],
    ),
    events: await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "occurredAt",id',
      [fixture.workspaceId, fixture.projectId],
    ),
  };
  if (!rows.projects.length) {
    for (const key of ['sources', 'versions', 'assets', 'events'])
      assert.equal(rows[key].length, 0);
    return rows;
  }
  assert.equal(rows.projects.length, 1);
  assert.equal(fingerprint(rows.projects[0]), fingerprint(fixture.projectSeed));
  assert(rows.sources.length <= 1);
  assert(rows.assets.length <= fixture.uploads.length);
  const matchedUploads = new Set();
  for (const asset of rows.assets) {
    assert.match(asset.id, UUID);
    const matches = fixture.uploads.filter((upload) =>
      uploadMatches(asset, upload, fixture),
    );
    assert.equal(
      matches.length,
      1,
      'Only one exact declared upload may match.',
    );
    const upload = matches[0];
    assert(!matchedUploads.has(upload), 'A file slot permits only one upload.');
    matchedUploads.add(upload);
    dateAtOrAfter(
      asset.createdAt,
      upload.declaredDatabaseAt ?? fixture.projectSeed.createdAt,
    );
    dateAtOrAfter(asset.updatedAt, asset.createdAt);
    assert.equal(
      asset.inputHash,
      advertisingHash({ ...upload.input, requestId: asset.id }),
    );
    if (upload.input.requestId && upload.inputHash)
      assert.equal(asset.inputHash, upload.inputHash);
    assert(['PENDING', 'READY'].includes(asset.state));
    assert.equal(asset.failureReason, null);
    assert.equal(asset.cleanedAt, null);
    assert.equal(asset.readyAt !== null, asset.state === 'READY');
    if (asset.readyAt) dateAtOrAfter(asset.readyAt, upload.declaredAt);
  }
  const source = rows.sources[0];
  const applied = source?.revision ?? 0;
  assert(Number.isInteger(applied) && applied <= fixture.commands.length);
  const commands = fixture.commands.slice(0, applied);
  const saved = commands.filter((command) => command.kind === 'SAVE');
  let currentVersion = 0;
  let publishedVersion = null;
  let lastPublication = null;
  for (const command of commands) {
    if (command.kind === 'SAVE') currentVersion++;
    else {
      assert(
        currentVersion > 0,
        'Publication requires an exact saved version.',
      );
      publishedVersion = command.input.publish ? currentVersion : null;
      lastPublication = command;
    }
  }
  if (source) {
    assert(applied >= 1 && commands[0].kind === 'SAVE');
    assert.equal(source.id, fixture.sourceId);
    assert.equal(source.workspaceId, fixture.workspaceId);
    assert.equal(source.projectId, fixture.projectId);
    assert.equal(source.createdBy, fixture.actorId);
    assert.equal(source.fathomRecordingId, null);
    dateAtOrAfter(
      source.createdAt,
      commands[0].declaredDatabaseAt ?? fixture.projectSeed.createdAt,
    );
    assert.equal(source.currentVersion, currentVersion);
    assert.equal(source.publishedVersion, publishedVersion);
    assert.equal(source.publishedBy, publishedVersion ? fixture.actorId : null);
    assert.equal(source.publishedAt !== null, publishedVersion !== null);
    if (source.publishedAt)
      dateAtOrAfter(source.publishedAt, lastPublication.declaredAt);
    if (lastPublication) assert.equal(lastPublication.kind, 'PUBLISH');
  }
  assert.equal(rows.versions.length, saved.length);
  for (const [index, version] of rows.versions.entries()) {
    const input = saved[index].input;
    assert.match(version.id, UUID);
    assert.equal(version.workspaceId, fixture.workspaceId);
    assert.equal(version.sourceId, fixture.sourceId);
    assert.equal(version.version, index + 1);
    assert.equal(version.createdBy, fixture.actorId);
    assert.equal(version.fathomProvenance, null);
    dateAtOrAfter(
      version.createdAt,
      saved[index].declaredDatabaseAt ?? fixture.projectSeed.createdAt,
    );
    for (const key of [
      'title',
      'category',
      'meetingDate',
      'sourceUrl',
      'transcript',
      'knowledge',
    ])
      assert.equal(version[key], input[key]);
    assert.deepEqual(version.attachments, input.attachments);
    for (const binding of version.attachments)
      assert(
        rows.assets.some(
          (asset) =>
            asset.id === binding.id &&
            asset.sha256 === binding.sha256 &&
            asset.state === 'READY',
        ),
      );
  }
  const fileEvents = new Map();
  const sourceEvents = new Map();
  for (const event of rows.events) {
    assert.match(event.id, UUID);
    assert.equal(event.workspaceId, fixture.workspaceId);
    assert.equal(event.projectId, fixture.projectId);
    assert.equal(event.projectName, fixture.projectSeed.name);
    assert.equal(event.clientId, fixture.projectSeed.companyId);
    assert.equal(event.taskId, null);
    assert.equal(event.taskName, null);
    assert.equal(event.agentName, null);
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.category, 'CLIENT');
    const fileEvent = expectedFileEvents[event.action];
    if (fileEvent) {
      const asset = rows.assets.find((item) => item.id === event.sourceId);
      assert(asset, 'File activity must belong to the exact retained upload.');
      assert.equal(event.sourceType, 'knowledge-upload');
      assert.equal(event.subjectMemberId, fixture.actorId);
      assert.equal(event.outcome, 'RECORDED');
      assert.equal(event.summary, fileEvent.summary);
      assert.deepEqual(event.changes, [
        { field: 'assetId', before: null, after: asset.id },
        { field: 'state', before: fileEvent.before, after: fileEvent.after },
      ]);
      const upload = fixture.uploads.find((item) =>
        uploadMatches(asset, item, fixture),
      );
      dateAtOrAfter(event.occurredAt, upload.declaredAt);
      dateAtOrAfter(event.recordedAt, asset.createdAt);
      const key = `${asset.id}:${event.action}`;
      assert(!fileEvents.has(key), 'A file transition may occur only once.');
      fileEvents.set(key, event);
    } else {
      assert.equal(event.sourceId, fixture.sourceId);
      assert.equal(event.sourceType, 'brand-knowledge');
      assert.equal(event.subjectMemberId, null);
      assert.equal(event.subjectName, null);
      assert.equal(event.changes.length, 1);
      const revision = Number(event.changes[0].after);
      assert(Number.isInteger(revision) && revision > 0 && revision <= applied);
      assert(
        !sourceEvents.has(revision),
        'A source revision records one event.',
      );
      const command = commands[revision - 1];
      dateAtOrAfter(event.occurredAt, command.declaredAt);
      const expected =
        sourceActions[
          command.kind === 'SAVE'
            ? 'SAVE'
            : command.input.publish
              ? 'PUBLISH'
              : 'WITHDRAW'
        ];
      assert.equal(event.action, expected.action);
      assert.equal(event.summary, expected.summary);
      assert.equal(event.outcome, expected.outcome);
      assert.deepEqual(event.changes, [
        {
          field: 'revision',
          before: String(revision - 1),
          after: String(revision),
        },
      ]);
      sourceEvents.set(revision, event);
    }
  }
  assert.equal(sourceEvents.size, applied);
  for (const asset of rows.assets) {
    assert(fileEvents.has(`${asset.id}:KNOWLEDGE_FILE_UPLOAD_STARTED`));
    assert.equal(
      fileEvents.has(`${asset.id}:KNOWLEDGE_FILE_READY`),
      asset.state === 'READY',
    );
    if (asset.state === 'READY') {
      const started = fileEvents.get(
        `${asset.id}:KNOWLEDGE_FILE_UPLOAD_STARTED`,
      );
      const ready = fileEvents.get(`${asset.id}:KNOWLEDGE_FILE_READY`);
      dateAtOrAfter(asset.readyAt, started.occurredAt);
      dateAtOrAfter(ready.occurredAt, asset.readyAt);
      dateAtOrAfter(ready.recordedAt, started.recordedAt);
    }
  }
  assert.equal(rows.events.length, sourceEvents.size + fileEvents.size);
  return rows;
}

module.exports = { validateOwnedRows, expectedFileEvents };
