import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupConfiguration, createNativeBackup, verifyNativeBackup, resumeNativeBackup } from './backup.mjs';

const nonce = randomBytes(8).toString('hex');
const database = `otogrow_backup_source_${nonce}`;
const directory = await mkdtemp(join(tmpdir(), 'otogrow-native-backup-check-'));
const container = 'twenty-dev-db-1';
const marker = `otogrow-backup-proof:${nonce}`;
const journal = join(directory, 'ownership.json');
await writeFile(journal, JSON.stringify({ database, marker, container, directory }), { mode: 0o600 });
const sql = (query, name = database) => {
  assert(name === 'postgres' || name === database || /^otogrow_restore_[a-f0-9]{16}$/.test(name));
  const result = spawnSync('docker', ['exec', '-i', '--user', 'postgres', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', name], { input: query, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};
const originalRestoreDatabases = sql("SELECT datname FROM pg_database WHERE datname LIKE 'otogrow_restore_%' ORDER BY datname", 'postgres');
let created = false;
try {
  assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${database}'`, 'postgres'), '0');
  sql(`CREATE DATABASE "${database}" TEMPLATE template0;\nCOMMENT ON DATABASE "${database}" IS '${marker}';`, 'postgres'); created = true;
  sql(`CREATE SCHEMA core; CREATE SCHEMA brand_fixture; CREATE TABLE core.workspace(id integer primary key,name text,balance numeric(20,6),data jsonb); INSERT INTO core.workspace VALUES(1,'Disposable recovery data',12.340001,'{"nullable":null,"zero":0,"text":"品牌"}'); CREATE TABLE brand_fixture.task(id integer primary key,title text); INSERT INTO brand_fixture.task SELECT i,'FIXTURE '||i FROM generate_series(1,70)i;`);
  const before = sql('SELECT md5(string_agg(row_to_json(record)::text,\'\' ORDER BY id)) FROM core.workspace record');
  const storage = join(directory, 'media'); const backups = join(directory, 'backups'); const bin = join(directory, 'bin');
  for (const path of [storage, backups, bin]) await mkdir(path, { mode: 0o700 });
  await writeFile(join(storage, 'image fixture.txt'), 'FIXTURE product asset 品牌'); await mkdir(join(storage, 'nested')); await writeFile(join(storage, 'nested', 'video.bin'), randomBytes(4096));
  const configFile = join(directory, 'runtime.env'); const keyFile = join(directory, 'recovery.key'); const log = join(directory, 'systemctl.jsonl');
  await writeFile(configFile, 'APP_SECRET=DISPOSABLE_TEST_SECRET\nENCRYPTION_KEY=DISPOSABLE_TEST_KEY\n', { mode: 0o640 }); await writeFile(keyFile, randomBytes(32), { mode: 0o600 });
  const wrapper = `#!${process.execPath}\nconst{spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const command=path.basename(process.argv[1]);const args=process.argv.slice(2);const source=process.env.BACKUP_TEST_SOURCE;if(command==='systemctl'){fs.appendFileSync(process.env.BACKUP_TEST_LOG,JSON.stringify(args)+'\\n');if(args[0]==='is-active'&&process.env.BACKUP_TEST_INACTIVE==='worker'&&args.includes('otogrow-crm-worker.service'))process.exit(3);if(args[0]==='stop'&&process.env.BACKUP_TEST_FAIL==='stop')process.exit(4);process.exit(0);}if(command==='pg_dump'&&process.env.BACKUP_TEST_FAIL==='dump')process.exit(7);const allowed=name=>name===source||/^otogrow_restore_[a-f0-9]{16}$/.test(name);let input;let output;let values=[...args];if(command==='psql'){const index=values.indexOf('-d');const name=index<0?source:values[index+1];if(!allowed(name))throw new Error('Nonfixture database denied');if(index<0)values.push('-d',name);input=values.includes('-c')?undefined:fs.readFileSync(0);}else if(command==='pg_dump'){if(!allowed(process.env.PGDATABASE))throw new Error('Nonfixture source denied');values.push('--dbname',process.env.PGDATABASE);const index=values.indexOf('--file');output=values[index+1];values.splice(index,2);}else if(command==='pg_restore'){const file=values.pop();input=fs.readFileSync(file);const index=values.indexOf('--dbname');if(index>=0&&!allowed(values[index+1]))throw new Error('Nonfixture restore denied');}else{const name=values[values.length-1];if(!/^otogrow_restore_[a-f0-9]{16}$/.test(name))throw new Error('Nonfixture create/drop denied');}const result=spawnSync('docker',['exec','-i','--user','postgres',process.env.BACKUP_TEST_CONTAINER,command,'-U','postgres',...values],{input,encoding:undefined,maxBuffer:32*1024*1024});if(result.error)throw result.error;if(output&&result.status===0)fs.writeFileSync(output,result.stdout,{mode:0o600});else if(!output)process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');process.exit(result.status??1);\n`;
  for (const command of ['systemctl', 'psql', 'pg_dump', 'pg_restore', 'createdb', 'dropdb']) await writeFile(join(bin, command), wrapper, { mode: 0o700 });
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PG_DATABASE_URL: `postgres://postgres@127.0.0.1:5444/${database}`, BACKUP_EXPECTED_DATABASE: database, BACKUP_DIR: backups, BACKUP_STORAGE_PATH: storage, BACKUP_CONFIG_PATH: configFile, BACKUP_KEY_FILE: keyFile, BACKUP_RETENTION_DAYS: '14', BACKUP_QUIESCE: 'yes', BACKUP_RESUME_FILE: join(directory, 'needs-resume.json'), BACKUP_TEST_LOG: log, BACKUP_TEST_CONTAINER: container, BACKUP_TEST_SOURCE: database };
  const configuration = await backupConfiguration(environment);
  const result = await createNativeBackup(configuration); assert.equal(result.files, 2); assert.equal((await stat(result.archive)).mode & 0o077, 0);
  assert(!((await readFile(result.archive)).includes(Buffer.from('DISPOSABLE_TEST_SECRET'))));
  const verified = await verifyNativeBackup(configuration, result.archive); assert.equal(verified.valid, true); assert.equal(verified.restoreDrill, false);
  const restored = await verifyNativeBackup(configuration, result.archive, true); assert.equal(restored.restoreDrill, true); assert.equal(restored.tables, 2); assert.equal(restored.files, 2);
  assert.equal(sql('SELECT md5(string_agg(row_to_json(record)::text,\'\' ORDER BY id)) FROM core.workspace record'), before, 'Source data must remain exact.');
  assert.equal(sql("SELECT datname FROM pg_database WHERE datname LIKE 'otogrow_restore_%' ORDER BY datname", 'postgres'), originalRestoreDatabases, 'The proof must remove only its owned restored database.');
  const corrupted = join(directory, 'corrupt.backup'); const bytes = await readFile(result.archive); bytes[bytes.length-20] ^= 1; await writeFile(corrupted, bytes, { mode: 0o600 });
  await assert.rejects(() => verifyNativeBackup(configuration, corrupted, true));
  await assert.rejects(() => verifyNativeBackup({ ...configuration, key: randomBytes(32) }, result.archive));
  await utimes(result.archive, new Date('2000-01-01'), new Date('2000-01-01'));
  const retained = await readdir(backups);
  await assert.rejects(() => createNativeBackup({ ...configuration, connection: { ...configuration.connection, BACKUP_TEST_FAIL: 'dump' } }));
  assert.deepEqual(await readdir(backups), retained, 'Failed backup cannot prune or publish incomplete data.');
  await writeFile(log, '');
  await assert.rejects(() => createNativeBackup({ ...configuration, connection: { ...configuration.connection, BACKUP_TEST_INACTIVE: 'worker' } }));
  const calls = (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); assert(!calls.some(args => ['start','stop'].includes(args[0])), 'An inactive worker must not be enabled by backup.');
  await symlink(configFile, join(storage, 'unsafe-link')); await assert.rejects(() => createNativeBackup(configuration)); await rm(join(storage, 'unsafe-link'));
  assert.deepEqual(await readdir(backups), retained);
  await writeFile(log, '');
  await assert.rejects(() => createNativeBackup({ ...configuration, connection: { ...configuration.connection, BACKUP_TEST_FAIL: 'stop' } }));
  const stoppedCalls = (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); assert(stoppedCalls.some(args=>args[0]==='start'), 'A partial stop failure must resume the original active services.');
  await assert.rejects(() => stat(environment.BACKUP_RESUME_FILE), { code: 'ENOENT' });
  const resumeMarker = { version: 1, pid: 2147483647, nonce: randomBytes(24).toString('hex'), createdAt: new Date().toISOString(), services: ['otogrow-crm.service','otogrow-crm-worker.service'] };
  await writeFile(environment.BACKUP_RESUME_FILE, JSON.stringify(resumeMarker), { mode: 0o600 });
  assert.equal((await resumeNativeBackup(environment)).resumed, true);
  assert.equal((await resumeNativeBackup(environment)).resumed, false);
  await writeFile(environment.BACKUP_RESUME_FILE, JSON.stringify({ ...resumeMarker, services: ['bon.service'] }), { mode: 0o600 });
  await assert.rejects(()=>resumeNativeBackup(environment)); await rm(environment.BACKUP_RESUME_FILE);
  const metadata = await stat(journal); assert.equal(metadata.mode & 0o077, 0);
  console.log('PASS native encrypted backup and actual PostgreSQL16 restore drill: table/media/configuration checksums, authenticated encryption and tamper/wrong-key rejection, private artifacts, failures/retention, inactive-unit preservation and exact scratch cleanup. Only disposable local databases and mocked systemctl were used.');
} finally {
  if (created) {
    const comment = sql(`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${database}'`, 'postgres');
    assert.equal(comment, marker, `Preserve ${journal}; the source database ownership changed.`);
    sql(`DROP DATABASE "${database}";`, 'postgres');
  }
  const remaining = sql(`SELECT count(*) FROM pg_database WHERE datname='${database}'`, 'postgres'); assert.equal(remaining,'0');
  await rm(directory, { recursive: true, force: true });
}
