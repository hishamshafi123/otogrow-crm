const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');

const root = mkdtempSync(join(tmpdir(), 'otogrow backup check '));
const deployment = join(root, 'deployment with spaces');
const backups = join(root, 'backups with spaces');
const bin = join(root, 'stub commands');
const log = join(root, 'docker-arguments.jsonl');
for (const path of [deployment, backups, bin]) mkdirSync(path, { mode: 0o700 });
for (const file of ['backup.sh', 'restore.sh']) copyFileSync(join(__dirname, file), join(deployment, file));
writeFileSync(join(deployment, 'docker-compose.yml'), 'services: {}\n');
writeFileSync(join(deployment, '.env'), `PG_DATABASE_USER='test user'\nPG_DATABASE_NAME='test database'\nBACKUP_DIR='${backups.replace(/'/g, "'\\''")}'\nBACKUP_RETENTION_DAYS=14\n`, { mode: 0o600 });
const storage = join(root, 'storage');
mkdirSync(storage); writeFileSync(join(storage, 'brand asset.txt'), 'FIXTURE media');
const tar = spawnSync('tar', ['czf', '-', '-C', storage, '.']);
assert.equal(tar.status, 0); const archive = join(root, 'storage.tar.gz'); writeFileSync(archive, tar.stdout);
writeFileSync(join(bin, 'docker'), `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.BACKUP_TEST_LOG,JSON.stringify(args)+'\\n');const command=args[args.indexOf('db')+1];if(command==='pg_dump'){process.stdout.write('-- FIXTURE dump\\nSELECT 1;\\n');if(process.env.BACKUP_TEST_FAIL==='dump')process.exitCode=7;}else if(args.includes('app')&&args.includes('tar')){if(process.env.BACKUP_TEST_FAIL==='storage')process.exit(8);process.stdout.write(fs.readFileSync(process.env.BACKUP_TEST_ARCHIVE));}else if(command==='psql'){fs.readFileSync(0);if(process.env.BACKUP_TEST_FAIL==='restore')process.exitCode=9;}\n`, { mode: 0o700 });
const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_TEST_LOG: log, BACKUP_TEST_ARCHIVE: archive };
const run = (file, args = [], input = '', failure = '') => spawnSync('bash', [join(deployment, file), ...args], { env: { ...environment, BACKUP_TEST_FAIL: failure }, input, encoding: 'utf8' });
const calls = () => { try { return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const resetLog = () => writeFileSync(log, '');
const files = () => readdirSync(backups).sort();
try {
  const stale = join(backups, 'otogrow-db-old.sql.gz'); writeFileSync(stale, 'old'); utimesSync(stale, new Date('2000-01-01'), new Date('2000-01-01'));
  for (const failure of ['dump', 'storage']) {
    const result = run('backup.sh', [], '', failure);
    assert.notEqual(result.status, 0, `${failure} must fail`);
    assert.deepEqual(files(), ['otogrow-db-old.sql.gz'], 'A failed pair must not leave ready artifacts or prune old data.');
  }
  const backup = run('backup.sh'); assert.equal(backup.status, 0, backup.stderr);
  const ready = files(); assert.equal(ready.length, 3); assert.equal(ready.filter(file => file.endsWith('.complete')).length, 1);
  const dump = join(backups, ready.find(file => file.endsWith('.sql.gz')));
  assert.match(gunzipSync(readFileSync(dump)).toString(), /FIXTURE dump/);
  for (const file of ready) assert.equal(statSync(join(backups, file)).mode & 0o077, 0, 'Backups must be private.');
  for (const args of calls()) assert.deepEqual(args.slice(0, 5), ['compose', '-f', join(deployment, 'docker-compose.yml'), '--env-file', join(deployment, '.env')]);
  resetLog(); assert.notEqual(run('restore.sh', [dump], 'no\n').status, 0); assert.equal(calls().length, 0);
  assert.notEqual(run('restore.sh', [dump], '').status, 0); assert.equal(calls().length, 0);
  const corrupt = join(root, 'corrupt.sql.gz'); writeFileSync(corrupt, 'not gzip');
  assert.notEqual(run('restore.sh', [corrupt], 'restore\n').status, 0); assert.equal(calls().length, 0);
  const restore = run('restore.sh', [dump], 'restore\n'); assert.equal(restore.status, 0, restore.stderr);
  assert.deepEqual(calls().map(args => args.slice(5, 9)), [['stop', 'app', 'worker'], ['exec', '-T', 'db', 'dropdb'], ['exec', '-T', 'db', 'createdb'], ['exec', '-T', 'db', 'psql'], ['up', '-d']]);
  resetLog(); const failed = run('restore.sh', [dump], 'restore\n', 'restore'); assert.notEqual(failed.status, 0); assert(!calls().some(args => args[5] === 'up'), 'A failed restore cannot restart the app against partial data.');
  console.log('PASS backup/restore: actual Bash argument boundaries, private complete pairs, dump/storage failures, retention after success only, corrupt input/refusal/EOF before destructive work and failed restore leaves services stopped. Docker and live databases were not invoked.');
} finally { rmSync(root, { recursive: true, force: true }); }
