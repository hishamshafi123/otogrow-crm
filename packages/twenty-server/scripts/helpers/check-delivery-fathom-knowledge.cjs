const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { SecretEncryptionService } = require('../../dist/engine/core-modules/secret-encryption/secret-encryption.service');
const { DeliveryFathomService } = require('../../dist/modules/delivery/knowledge/fathom/delivery-fathom.service');
const { formatFathomTranscript } = require('../../dist/modules/delivery/knowledge/fathom/delivery-fathom.policy');
const { DeliveryKnowledgeService } = require('../../dist/modules/delivery/knowledge/delivery-knowledge.service');
const { DeliveryKnowledgeReadsService } = require('../../dist/modules/delivery/knowledge/reads/delivery-knowledge-reads.service');
const { readDeliveryKnowledgeContext } = require('../../dist/modules/delivery/knowledge/delivery-knowledge-context');

const checkDeliveryFathomKnowledge = async ({ runner, source, delivery, workspace, founder, editor }) => {
  assert(runner.isTransactionActive, 'Fathom acceptance requires the caller-owned rollback transaction.');
  assert.match(workspace.databaseSchema, /^[a-zA-Z0-9_]+$/);
  const schema = `"${workspace.databaseSchema}"`;
  const originalFetch = global.fetch;
  const originalConnection = await runner.query('SELECT * FROM core."deliveryFathomConnection" WHERE "workspaceId"=$1 ORDER BY id', [workspace.id]);
  const originalCounts = await runner.query(`SELECT
    (SELECT count(*)::int FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1) AS sources,
    (SELECT count(*)::int FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1) AS versions,
    (SELECT count(*)::int FROM core."deliveryProject" WHERE "workspaceId"=$1) AS projects,
    (SELECT count(*)::int FROM core."deliveryTask" WHERE "workspaceId"=$1) AS tasks,
    (SELECT count(*)::int FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1) AS events`, [workspace.id]);
  await runner.query('SAVEPOINT fathom_knowledge_acceptance');
  global.fetch = async () => { throw new Error('Live HTTP is forbidden in Fathom acceptance.'); };
  try {
    const companyId = randomUUID();
    const replacementCompanyId = randomUUID();
    await runner.query(`INSERT INTO ${schema}.company (id,name) VALUES ($1,'Synthetic Fathom original client'),($2,'Synthetic Fathom replacement client')`, [companyId, replacementCompanyId]);
    const created = await delivery.command(workspace, founder, founder, {
      action: 'project', name: `Synthetic Fathom ${randomUUID()}`, companyId, memberIds: [editor],
    });
    const project = created.projects.find((item) => item.companyId === companyId);
    assert(project);
    const taskBaseline = await runner.query('SELECT id FROM core."deliveryTask" WHERE "workspaceId"=$1 ORDER BY id', [workspace.id]);
    const syntheticKey = `synthetic-fathom-${randomBytes(24).toString('hex')}`;
    const encryptionKey = randomBytes(32).toString('hex');
    const encryption = new SecretEncryptionService({ get: (key) => key === 'ENCRYPTION_KEY' ? encryptionKey : undefined });
    const sourceId = randomUUID();
    const meeting = { recordingId: '987654321', title: 'Original provider title', recordedAt: '2026-11-01T09:00:00Z', sourceUrl: 'https://fathom.video/share/synthetic-import-proof' };
    const formatted = formatFathomTranscript({ transcript: [
      { timestamp: '00:00:03', speaker: { display_name: 'Client', email: 'private-synthetic@example.invalid' }, text: 'PRIVATE_FATHOM_TRANSCRIPT: focus on booked calls.' },
      { timestamp: '00:01:20', speaker: { display_name: 'Founder' }, text: 'Review this proposal before changing delivery work.' },
    ] });
    let meetingCalls = 0;
    let transcriptCalls = 0;
    const adapter = {
      meetings: async (key, input) => {
        assert.equal(key, syntheticKey);
        assert.equal(input.projectId, project.id);
        meetingCalls++;
        return { items: [meeting], nextCursor: null, scannedCount: 1 };
      },
      transcript: async (key, recordingId) => {
        assert.equal(key, syntheticKey);
        assert.equal(recordingId, meeting.recordingId);
        transcriptCalls++;
        return formatted;
      },
    };
    const fathom = new DeliveryFathomService(source, delivery, encryption, adapter);
    const knowledge = new DeliveryKnowledgeService(source, delivery, fathom);
    const reads = new DeliveryKnowledgeReadsService(source, delivery);
    const previous = await fathom.settings(workspace, founder, founder);
    const settings = await fathom.saveSettings(workspace, founder, founder, { revision: previous.revision, enabled: true, apiKey: syntheticKey });
    assert.equal(settings.enabled, true);
    assert.equal(settings.credentialConfigured, true);
    assert(!JSON.stringify(settings).includes(syntheticKey));
    const [connection] = await runner.query('SELECT * FROM core."deliveryFathomConnection" WHERE "workspaceId"=$1', [workspace.id]);
    assert.notEqual(connection.apiKey, syntheticKey);
    assert.equal(encryption.decryptVersionedOrThrow(connection.apiKey, { workspaceId: workspace.id }), syntheticKey);
    assert.throws(() => encryption.decryptVersionedOrThrow(connection.apiKey, { workspaceId: randomUUID() }));
    const search = { projectId: project.id, sourceId, createdAfter: '2026-11-01T00:00:00Z', createdBefore: '2026-11-02T00:00:00Z', exactUrl: meeting.sourceUrl };
    await assert.rejects(() => fathom.settings(workspace, editor, editor), /administrators/);
    await assert.rejects(() => fathom.meetings(workspace, editor, editor, search), /administrators/);
    await assert.rejects(() => fathom.preview(workspace, editor, editor, { projectId: project.id, sourceId, recordingId: meeting.recordingId }), /administrators/);
    assert.equal(meetingCalls + transcriptCalls, 0);
    const matches = await fathom.meetings(workspace, founder, founder, search);
    assert.equal(matches.items[0].recordingId, meeting.recordingId);
    const preview = await fathom.preview(workspace, founder, founder, { projectId: project.id, sourceId, recordingId: meeting.recordingId, meetingProof: matches.items[0].proof });
    assert.equal(preview.meeting.title, meeting.title);
    assert.equal(preview.transcript, formatted.transcript);
    assert(!preview.transcript.includes('private-synthetic@example.invalid'));
    assert.equal(preview.existingSourceId, null);
    assert.equal((await reads.list(workspace, founder, founder, { projectId: project.id })).totalCount, 0);
    const save = { projectId: project.id, id: sourceId, revision: 0, category: 'MEETING', title: 'Human-reviewed meeting label', meetingDate: '2026-11-01', sourceUrl: meeting.sourceUrl, transcript: preview.transcript, knowledge: 'Approved meeting interpretation: focus on booked calls.', fathomImportProof: preview.proof, fathomImportHash: preview.proofHash };
    await assert.rejects(() => knowledge.save(workspace, editor, editor, save), /administrators/);
    await assert.rejects(() => knowledge.save(workspace, founder, founder, { ...save, fathomImportHash: '0'.repeat(64) }), /evidence/);
    await knowledge.save(workspace, founder, founder, save);
    const saved = await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId });
    assert.equal(saved.detail.title, save.title);
    assert.equal(saved.detail.version, 1);
    assert.equal(saved.detail.publishedVersion, null);
    assert.equal(saved.detail.fathomProvenance.title, meeting.title);
    assert.equal(saved.detail.fathomProvenance.recordingId, meeting.recordingId);
    assert.equal(saved.detail.fathomProvenance.proofHash, preview.proofHash);
    assert.equal(saved.detail.fathomProvenance.humanEdited, false);
    assert.equal(saved.detail.fathomProvenance.companyId, companyId);
    assert.equal((await readDeliveryKnowledgeContext(runner.manager, workspace.id, project.id)).totalSources, 0);
    // Exact history resolves a lost save reply; replaying a stale revision cannot add another version.
    await assert.rejects(() => knowledge.save(workspace, founder, founder, save), /changed/);
    assert.equal((await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId })).detail.fathomProvenance.proofHash, preview.proofHash);
    assert.equal((await runner.query('SELECT version FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1 AND "sourceId"=$2', [workspace.id, sourceId])).length, 1);
    const duplicateId = randomUUID();
    const duplicate = await fathom.preview(workspace, founder, founder, { projectId: project.id, sourceId: duplicateId, recordingId: meeting.recordingId });
    assert.equal(duplicate.existingSourceId, sourceId);
    await assert.rejects(() => knowledge.save(workspace, founder, founder, { ...save, id: duplicateId, fathomImportProof: duplicate.proof, fathomImportHash: duplicate.proofHash }), /already imported/);
    assert.equal((await runner.query('SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1', [duplicateId])).length, 0);
    await knowledge.publish(workspace, founder, founder, { projectId: project.id, id: sourceId, revision: 1, publish: true });
    const published = await readDeliveryKnowledgeContext(runner.manager, workspace.id, project.id);
    assert.equal(published.totalSources, 1);
    assert.equal(published.sources[0].knowledge, save.knowledge);
    assert(!JSON.stringify(published).includes('PRIVATE_FATHOM_TRANSCRIPT'));
    assert(!JSON.stringify(published).includes('fathom.video'));
    const staff = await reads.detail(workspace, editor, editor, { projectId: project.id, sourceId });
    assert.equal(staff.detail.transcript, null);
    assert.equal(staff.detail.fathomProvenance, null);
    assert.equal(staff.detail.sourceUrl, '');
    const { fathomImportProof, fathomImportHash, ...manualEdit } = save;
    await knowledge.save(workspace, founder, founder, { ...manualEdit, revision: 2, transcript: `${save.transcript}\nHuman correction: use the reviewed brand terminology.` });
    const edited = await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId });
    assert.equal(edited.detail.version, 2);
    assert.equal(edited.detail.fathomProvenance.humanEdited, true);
    const historical = await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId, version: 1 });
    assert.equal(historical.detail.transcript, save.transcript);
    assert.equal(historical.detail.fathomProvenance.humanEdited, false);
    assert.equal((await readDeliveryKnowledgeContext(runner.manager, workspace.id, project.id)).sources[0].version, 1);
    await knowledge.publish(workspace, founder, founder, { projectId: project.id, id: sourceId, revision: 3, publish: true });
    const pendingSource = randomUUID();
    const pending = await fathom.preview(workspace, founder, founder, { projectId: project.id, sourceId: pendingSource, recordingId: meeting.recordingId });
    const callsBeforeDisable = transcriptCalls;
    const disabled = await fathom.saveSettings(workspace, founder, founder, { revision: settings.revision, enabled: false });
    await assert.rejects(() => fathom.preview(workspace, founder, founder, { projectId: project.id, sourceId: pendingSource, recordingId: meeting.recordingId }), /disabled/);
    await assert.rejects(() => knowledge.save(workspace, founder, founder, { ...save, id: pendingSource, fathomImportProof: pending.proof, fathomImportHash: pending.proofHash }), /disabled/);
    assert.equal(transcriptCalls, callsBeforeDisable);
    assert.equal((await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId })).detail.version, 2);
    await fathom.saveSettings(workspace, founder, founder, { revision: disabled.revision, enabled: true });
    await assert.rejects(() => knowledge.save(workspace, founder, founder, { ...save, id: pendingSource, fathomImportProof: pending.proof, fathomImportHash: pending.proofHash }), /connection changed/);
    const beforeRelink = await reads.list(workspace, founder, founder, { projectId: project.id });
    assert.equal(beforeRelink.totalCount, 1);
    await runner.query('SAVEPOINT fathom_client_relink');
    try {
      await runner.query('UPDATE core."deliveryProject" SET "companyId"=$1, revision=revision+1 WHERE "workspaceId"=$2 AND id=$3 AND "companyId"=$4', [replacementCompanyId, workspace.id, project.id, companyId]);
      const hidden = await reads.list(workspace, founder, founder, { projectId: project.id });
      assert.equal(hidden.totalCount, 0);
      assert.equal(hidden.items.length, 0);
      assert.equal((await reads.detail(workspace, founder, founder, { projectId: project.id, sourceId })).detail, null);
      assert.equal((await reads.detail(workspace, editor, editor, { projectId: project.id, sourceId })).detail, null);
      assert.equal((await readDeliveryKnowledgeContext(runner.manager, workspace.id, project.id)).totalSources, 0);
      await assert.rejects(() => knowledge.save(workspace, founder, founder, { ...manualEdit, revision: 4 }), /original client/);
      await assert.rejects(() => knowledge.publish(workspace, founder, founder, { projectId: project.id, id: sourceId, revision: 4, publish: true }), /original client/);
    } finally {
      await runner.query('ROLLBACK TO SAVEPOINT fathom_client_relink');
      await runner.query('RELEASE SAVEPOINT fathom_client_relink');
    }
    assert.equal((await reads.list(workspace, founder, founder, { projectId: project.id })).totalCount, 1);
    assert.equal((await readDeliveryKnowledgeContext(runner.manager, workspace.id, project.id)).totalSources, 1);
    assert.deepEqual(await runner.query('SELECT id FROM core."deliveryTask" WHERE "workspaceId"=$1 ORDER BY id', [workspace.id]), taskBaseline);
    const events = await runner.query('SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND ("sourceId"=$2 OR action=$3)', [workspace.id, sourceId, 'FATHOM_SETTINGS_CHANGED']);
    const audit = JSON.stringify(events);
    for (const privateValue of [syntheticKey, preview.proof, 'PRIVATE_FATHOM_TRANSCRIPT', 'private-synthetic@example.invalid', meeting.sourceUrl]) assert(!audit.includes(privateValue));
    assert.equal(meetingCalls, 1);
    assert.equal(transcriptCalls, 3);
    console.log('PASS actual Fathom/Knowledge rollback integration: encrypted synthetic key, current admin gate, authenticated metadata/transcript proof, exact-save recovery without duplicate versions, project deduplication, immutable/human-edited provenance, explicit publication, private notes excluded from staff/agent context, disabled and changed connection rejection, client-relink withholding before counts/context, no automatic task/provider call. Provider adapter only is mocked.');
  } finally {
    global.fetch = originalFetch;
    await runner.query('ROLLBACK TO SAVEPOINT fathom_knowledge_acceptance');
    await runner.query('RELEASE SAVEPOINT fathom_knowledge_acceptance');
    assert.deepEqual(await runner.query('SELECT * FROM core."deliveryFathomConnection" WHERE "workspaceId"=$1 ORDER BY id', [workspace.id]), originalConnection);
    assert.deepEqual(await runner.query(`SELECT
      (SELECT count(*)::int FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1) AS sources,
      (SELECT count(*)::int FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1) AS versions,
      (SELECT count(*)::int FROM core."deliveryProject" WHERE "workspaceId"=$1) AS projects,
      (SELECT count(*)::int FROM core."deliveryTask" WHERE "workspaceId"=$1) AS tasks,
      (SELECT count(*)::int FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1) AS events`, [workspace.id]), originalCounts);
  }
};

module.exports = { checkDeliveryFathomKnowledge };
