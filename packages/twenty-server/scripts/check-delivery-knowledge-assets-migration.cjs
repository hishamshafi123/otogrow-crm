const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { basename } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  getRegisteredInstanceCommandMetadata,
} = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');

const TABLE = 'deliveryKnowledgeAsset';
const VERSION_TABLE = 'deliveryKnowledgeVersion';
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const checks = [];

async function main() {
  const filename = process.argv[2];
  assert.equal(process.argv.length, 3);
  assert.equal(filename, basename(filename));
  assert.match(
    filename,
    /^2-34-instance-command-fast-\d+-add-knowledge-brand-files\.js$/,
  );
  assert.equal(process.env.OTOGROW_KNOWLEDGE_FILES_PROOF_SERVICES_STOPPED, '1');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const module = require(
    `../dist/database/commands/upgrade-version-command/2-34/${filename}`,
  );
  const candidates = Object.values(module).filter(
    (candidate) => typeof candidate === 'function' && candidate.prototype?.up,
  );
  assert.equal(candidates.length, 1);
  const Migration = candidates[0];
  assert.equal(
    INSTANCE_COMMANDS.filter((candidate) => candidate === Migration).length,
    1,
  );
  const metadata = getRegisteredInstanceCommandMetadata(Migration);
  assert.equal(metadata.version, '2.34.0');
  assert.equal(metadata.type, 'fast');
  assert(metadata.timestamp > 1793810789786);
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const tables = await userTables(runner);
    assert(
      !tables.some((table) => table.schema === 'core' && table.name === TABLE),
      'Run before installation; never drop installed brand files for a test.',
    );
    const [{ present }] = await runner.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name=$1 AND column_name='attachments') AS present`,
      [VERSION_TABLE],
    );
    assert.equal(present, false);
    for (const table of tables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const originalData = await dataFingerprint(runner);
    const originalSchema = await schemaFingerprint(runner);
    const unaffectedData = await dataFingerprint(runner, [
      TABLE,
      VERSION_TABLE,
    ]);
    const unaffectedSchema = await schemaFingerprint(runner, false, [], '', [
      TABLE,
      VERSION_TABLE,
    ]);
    const versionRows = async (strip) =>
      runner.query(
        `SELECT (${strip ? "to_jsonb(record)-'attachments'" : 'to_jsonb(record)'})::text AS value FROM core."deliveryKnowledgeVersion" record ORDER BY value`,
      );
    const originalVersions = await versionRows(false);
    const migration = new Migration();
    await migration.up(runner);
    assert.deepEqual(
      await dataFingerprint(runner, [TABLE, VERSION_TABLE]),
      unaffectedData,
    );
    assert.deepEqual(await versionRows(true), originalVersions);
    assert.equal(
      await schemaFingerprint(runner, false, [], '', [TABLE, VERSION_TABLE]),
      unaffectedSchema,
    );
    const columns = await runner.query(
      `SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='core' AND table_name=$1 AND column_name='attachments'`,
      [VERSION_TABLE],
    );
    assert.equal(columns.length, 1);
    assert.equal(columns[0].data_type, 'jsonb');
    assert.equal(columns[0].is_nullable, 'NO');
    assert.match(columns[0].column_default, /\[\]/);
    const [{ changed }] = await runner.query(
      `SELECT count(*)::int AS changed FROM core."deliveryKnowledgeVersion" WHERE attachments<>'[]'::jsonb`,
    );
    assert.equal(changed, 0);
    checks.push(
      'additive schema preserves every original row and defaults old versions to no attachments',
    );
    const constraints = await runner.query(
      'SELECT contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass',
      [`core."${TABLE}"`],
    );
    assert(constraints.every((row) => row.convalidated));
    assert(
      constraints.some(
        (row) =>
          row.contype === 'f' &&
          row.definition.includes('"workspaceId", "projectId"') &&
          row.definition.includes('RESTRICT'),
      ),
    );
    assert(constraints.filter((row) => row.contype === 'c').length >= 6);
    checks.push(
      'validated workspace/project foreign keys and file lifecycle checks',
    );
    await runner.query('SAVEPOINT retained_file');
    const fixture = await createFixture(runner.manager, 'kfile_mig');
    const fileId = randomUUID();
    const sourceId = randomUUID();
    await runner.query(
      `INSERT INTO core."deliveryKnowledgeAsset"(id,"workspaceId","projectId","companyId","sourceId","sourceRevision","uploadedBy","uploaderUserWorkspaceId","inputHash",name,"mimeType",size,sha256,state) VALUES($1,$2,$3,NULL,$4,0,$5,$6,$7,'fixture.png','image/png',1,$7,'PENDING')`,
      [
        fileId,
        fixture.workspaceId,
        fixture.projects.first,
        sourceId,
        fixture.people.writer.memberId,
        fixture.people.writer.userWorkspaceId,
        'a'.repeat(64),
      ],
    );
    const expectRetained = async () => {
      await runner.query('SAVEPOINT down_rejected');
      const query = runner.query.bind(runner);
      runner.query = async (sql, ...parameters) => {
        assert(
          /^\s*SELECT\b/.test(sql),
          'Retained evidence rejects before DDL.',
        );
        return query(sql, ...parameters);
      };
      try {
        await assert.rejects(
          migration.down(runner),
          /Cannot remove retained knowledge files/,
        );
      } finally {
        runner.query = query;
      }
      await runner.query('ROLLBACK TO SAVEPOINT down_rejected');
      await runner.query('RELEASE SAVEPOINT down_rejected');
      assert.equal(
        (
          await runner.query(
            `SELECT to_regclass('core."${TABLE}"') IS NOT NULL AS retained`,
          )
        )[0].retained,
        true,
      );
    };
    await expectRetained();
    checks.push(
      'downgrade refuses a retained pending upload before any destructive operation',
    );
    await runner.query('ROLLBACK TO SAVEPOINT retained_file');
    await runner.query('RELEASE SAVEPOINT retained_file');
    await runner.query('SAVEPOINT retained_version');
    const versionFixture = await createFixture(
      runner.manager,
      'kversion_mig',
    );
    const versionSource = randomUUID();
    await runner.query(
      `INSERT INTO core."deliveryKnowledgeSource"(id,"workspaceId","projectId","createdBy",revision,"currentVersion") VALUES($1,$2,$3,$4,1,1)`,
      [
        versionSource,
        versionFixture.workspaceId,
        versionFixture.projects.first,
        versionFixture.people.writer.memberId,
      ],
    );
    await runner.query(
      `INSERT INTO core."deliveryKnowledgeVersion"(id,"workspaceId","sourceId",version,title,category,"meetingDate","sourceUrl",transcript,knowledge,"createdBy",attachments) VALUES($1,$2,$3,1,'Fixture','ASSET_REFERENCE','2026-11-05','','','Fixture',$4,$5)`,
      [
        randomUUID(),
        versionFixture.workspaceId,
        versionSource,
        versionFixture.people.writer.memberId,
        JSON.stringify([{ id: randomUUID(), sha256: 'b'.repeat(64) }]),
      ],
    );
    await expectRetained();
    checks.push(
      'downgrade independently refuses retained version bindings even with no upload row',
    );
    await runner.query('ROLLBACK TO SAVEPOINT retained_version');
    await runner.query('RELEASE SAVEPOINT retained_version');
    for (const evidence of [
      { sourceType: 'knowledge-upload', action: 'FIXTURE_RETAINED' },
      { sourceType: 'brand-knowledge', action: 'KNOWLEDGE_FILE_READY' },
    ]) {
      await runner.query('SAVEPOINT retained_activity');
      const activityFixture = await createFixture(
        runner.manager,
        'knowledge_audit',
      );
      await runner.query(
        `INSERT INTO core."otogrowActivityEvent"("workspaceId","occurredAt","actorId","actorName","actorType",category,outcome,summary,"sourceId","sourceType",action,changes) VALUES($1,now(),$2,'FIXTURE uploader','HUMAN','DELIVERY','RECORDED','FIXTURE retained knowledge upload',$3,$4,$5,'[]'::jsonb)`,
        [
          activityFixture.workspaceId,
          activityFixture.people.writer.memberId,
          randomUUID(),
          evidence.sourceType,
          evidence.action,
        ],
      );
      await expectRetained();
      checks.push(
        `retained activity ${evidence.sourceType}/${evidence.action} rejects downgrade independently`,
      );
      await runner.query('ROLLBACK TO SAVEPOINT retained_activity');
      await runner.query('RELEASE SAVEPOINT retained_activity');
    }
    await migration.down(runner);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    checks.push('empty downgrade restores the full original schema and data');
    await migration.up(runner);
    await migration.down(runner);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    checks.push('repeated empty up/down remains reversible');
    await runner.rollbackTransaction();
    assert.deepEqual(await dataFingerprint(runner), originalData);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    console.log(
      JSON.stringify(
        { checks, originalTables: tables.length, writesCommitted: false },
        null,
        2,
      ),
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
