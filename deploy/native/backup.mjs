import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const execute = promisify(execFile);
const MAGIC = Buffer.from('OTOGROW_BACKUP_1\n');
const SERVICES = ['otogrow-crm.service', 'otogrow-crm-worker.service'];
const RESUME_FILE = '/var/cache/otogrow-crm-backup/resume.json';
const OWNER = process.geteuid();
const run = async (command, arguments_, environment, input) => {
  if (input === undefined)
    return (
      await execute(command, arguments_, {
        env: environment,
        timeout: 900000,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout.trim();
  return new Promise((accept, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = [];
    const errors = [];
    child.stdout.on('data', (value) => output.push(value));
    child.stderr.on('data', (value) => errors.push(value));
    child.on('error', reject);
    child.on('close', (status) =>
      status === 0
        ? accept(Buffer.concat(output).toString().trim())
        : reject(
            new Error(
              `${command} failed (${status}): ${Buffer.concat(errors).toString().slice(0, 1000)}`,
            ),
          ),
    );
    child.stdin.on('error', reject);
    child.stdin.end(input);
  });
};
const privateFile = async (path, allowServiceGroup = false) => {
  const metadata = await lstat(path);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.uid === OWNER &&
      (metadata.mode & (allowServiceGroup ? 0o037 : 0o077)) === 0,
    'A regular private file with no group write or public access is required.',
  );
};
export const backupConfiguration = async (environment = process.env) => {
  assert(environment.PG_DATABASE_URL, 'PG_DATABASE_URL is required.');
  const url = new URL(environment.PG_DATABASE_URL);
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'The native backup is limited to the configured local PostgreSQL server.',
  );
  const database = decodeURIComponent(url.pathname.slice(1));
  const expected = environment.BACKUP_EXPECTED_DATABASE ?? 'crm';
  assert(
    database === expected && /^[a-z][a-z0-9_]{0,62}$/.test(database),
    'The configured database must match BACKUP_EXPECTED_DATABASE.',
  );
  assert(
    environment.BACKUP_KEY_FILE,
    'BACKUP_KEY_FILE is required; keep the32-byte key separate from backups.',
  );
  await privateFile(environment.BACKUP_KEY_FILE);
  const key = await readFile(environment.BACKUP_KEY_FILE);
  assert.equal(
    key.length,
    32,
    'The backup key must contain exactly32 raw bytes.',
  );
  const directory = resolve(
    environment.BACKUP_DIR ?? '/var/backups/otogrow-crm',
  );
  const keyPath = await realpath(environment.BACKUP_KEY_FILE);
  const actualDirectory = await realpath(directory).catch(() => directory);
  assert(
    keyPath !== actualDirectory && !keyPath.startsWith(`${actualDirectory}/`),
    'The recovery key must be stored outside the backup directory.',
  );
  const retentionDays = Number(environment.BACKUP_RETENTION_DAYS ?? '14');
  assert(
    Number.isSafeInteger(retentionDays) &&
      retentionDays >= 1 &&
      retentionDays <= 3650,
    'Backup retention must be1–3650 days.',
  );
  const connection = {
    ...environment,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer',
  };
  return {
    database,
    directory,
    key,
    retentionDays,
    connection,
    storage: resolve(
      environment.BACKUP_STORAGE_PATH ?? '/var/lib/otogrow-crm/storage',
    ),
    configFile: resolve(
      environment.BACKUP_CONFIG_PATH ?? '/etc/otogrow-crm/crm.env',
    ),
    environment,
  };
};
const quotedIdentifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const streamedTableDigest = async (connection, database, schema, table) => {
  const child = spawn(
    'psql',
    ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database],
    { env: connection, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let errors = '';
  let count = 0n;
  const hash = createHash('md5');
  child.stderr.on('data', (value) => {
    errors = (errors + value.toString()).slice(0, 1000);
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 900000);
  const exited = new Promise((accept, reject) => {
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (status) =>
      status === 0
        ? accept()
        : reject(new Error(`Backup table check failed (${status}): ${errors}`)),
    );
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const consume = async () => {
    for await (const line of lines) {
      assert(
        /^[a-f0-9]{32}$/.test(line),
        'Unexpected row digest from PostgreSQL.',
      );
      hash.update(line);
      count++;
    }
  };
  child.stdin.end(
    `SET TIME ZONE 'UTC';\nSELECT md5(to_jsonb(record)::text) FROM ${quotedIdentifier(schema)}.${quotedIdentifier(table)} record ORDER BY md5(to_jsonb(record)::text) COLLATE "C";\n`,
  );
  try {
    await Promise.all([consume(), exited]);
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  } finally {
    clearTimeout(timeout);
    lines.close();
  }
  return { schema, table, count: count.toString(), hash: hash.digest('hex') };
};
export const databaseSnapshot = async (connection, database) => {
  const sql = `SELECT json_build_object('schema',n.nspname,'table',c.relname)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname LIMIT 10001;`;
  const result = await run(
    'psql',
    ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database],
    connection,
    sql,
  );
  const tables = result
    ? result.split('\n').map((value) => JSON.parse(value))
    : [];
  assert(
    tables.length <= 10000,
    'The backup table directory exceeds its explicit bound.',
  );
  const snapshots = [];
  for (const table of tables)
    snapshots.push(
      await streamedTableDigest(
        connection,
        database,
        table.schema,
        table.table,
      ),
    );
  return snapshots;
};
const privateDirectory = async (path, create = false) => {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      metadata.uid === OWNER &&
      (metadata.mode & 0o077) === 0,
    'A private owned directory without symlinks, group or public access is required.',
  );
  return realpath(path);
};
const syncDirectory = async (path) => {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};
const resumePath = (environment) =>
  resolve(environment.BACKUP_RESUME_FILE ?? RESUME_FILE);
const writeResumeMarker = async (environment) => {
  const path = resumePath(environment);
  await privateDirectory(dirname(path), true);
  const marker = {
    version: 1,
    services: SERVICES,
    pid: process.pid,
    nonce: randomBytes(24).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(marker));
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(dirname(path));
  return marker;
};
export const resumeNativeBackup = async (
  environment = process.env,
  expectedNonce,
) => {
  const path = resumePath(environment);
  try {
    await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT')
      return { resumed: false, reason: 'NO_OWNED_WINDOW' };
    throw error;
  }
  await privateDirectory(dirname(path));
  await privateFile(path);
  const metadata = await lstat(path);
  assert(metadata.size <= 4096, 'Invalid backup recovery marker.');
  const marker = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(marker.version, 1);
  assert.deepEqual(marker.services, SERVICES);
  assert(
    Number.isSafeInteger(marker.pid) &&
      marker.pid > 0 &&
      /^[a-f0-9]{48}$/.test(marker.nonce) &&
      Number.isFinite(Date.parse(marker.createdAt)),
    'Invalid backup recovery ownership.',
  );
  if (expectedNonce !== undefined)
    assert.equal(
      marker.nonce,
      expectedNonce,
      'Backup recovery ownership changed.',
    );
  else {
    try {
      process.kill(marker.pid, 0);
      return { resumed: false, reason: 'BACKUP_OWNER_ACTIVE' };
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await run('systemctl', ['start', ...SERVICES], environment);
  for (const service of SERVICES)
    await run('systemctl', ['is-active', '--quiet', service], environment);
  await privateFile(path);
  assert.equal(
    JSON.parse(await readFile(path, 'utf8')).nonce,
    marker.nonce,
    'Backup recovery ownership changed.',
  );
  await rm(path);
  await syncDirectory(dirname(path));
  return { resumed: true, services: SERVICES };
};
const hashFile = async (path) => {
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
};
const storageSnapshot = async (directory) => {
  const files = [];
  const visit = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      assert(
        !entry.isSymbolicLink(),
        'Storage symlinks are not included in a recovery archive.',
      );
      if (entry.isDirectory()) await visit(full);
      else {
        assert(
          entry.isFile(),
          'Storage must contain regular files/directories only.',
        );
        files.push({
          path: relative(directory, full),
          hash: await hashFile(full),
        });
      }
    }
  };
  await visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
const tarToEncryptedFile = async (directory, output, key, connection) => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC);
  const stream = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  stream.write(Buffer.concat([MAGIC, nonce]));
  const child = spawn(
    'tar',
    [
      'cf',
      '-',
      '-C',
      directory,
      'database.dump',
      'storage.tar.gz',
      'runtime.env',
      'manifest.json',
    ],
    { env: connection, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (value) => {
    errors += value.toString().slice(0, 1000);
  });
  const exited = new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('close', (status) =>
      status === 0
        ? accept()
        : reject(new Error(`Backup archive failed (${status}): ${errors}`)),
    );
  });
  await Promise.all([pipeline(child.stdout, cipher, stream), exited]);
  await appendFile(output, cipher.getAuthTag());
  const file = await open(output, 'r+');
  await file.sync();
  await file.close();
};
export const createNativeBackup = async (config) => {
  assert.equal(
    config.environment.BACKUP_QUIESCE,
    'yes',
    'Set BACKUP_QUIESCE=yes for a coordinated API/worker maintenance window.',
  );
  await privateFile(config.configFile, true);
  assert(
    (await lstat(config.storage)).isDirectory(),
    'Configured local storage must exist.',
  );
  const directory = await privateDirectory(config.directory, true);
  const stage = await mkdtemp(join(directory, '.pending-'));
  let marker = null;
  try {
    for (const service of SERVICES)
      await run(
        'systemctl',
        ['is-active', '--quiet', service],
        config.connection,
      );
    marker = await writeResumeMarker(config.environment);
    await run(
      'systemctl',
      ['stop', SERVICES[1], SERVICES[0]],
      config.connection,
    );
    const actual = await run(
      'psql',
      [
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'SELECT current_database()',
      ],
      config.connection,
    );
    assert.equal(actual, config.database);
    const tables = await databaseSnapshot(config.connection, config.database);
    const storage = await storageSnapshot(config.storage);
    await run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--file',
        join(stage, 'database.dump'),
      ],
      config.connection,
    );
    await run(
      'pg_restore',
      ['--list', join(stage, 'database.dump')],
      config.connection,
    );
    await run(
      'tar',
      ['czf', join(stage, 'storage.tar.gz'), '-C', config.storage, '.'],
      config.connection,
    );
    await copyFile(config.configFile, join(stage, 'runtime.env'));
    const afterTables = await databaseSnapshot(
      config.connection,
      config.database,
    );
    assert.deepEqual(
      afterTables,
      tables,
      'Data changed during the quiesced backup.',
    );
    assert.deepEqual(
      await storageSnapshot(config.storage),
      storage,
      'Storage changed during the backup.',
    );
    const createdAt = new Date().toISOString();
    const manifest = {
      version: 1,
      createdAt,
      database: config.database,
      consistency: 'API_AND_WORKER_QUIESCED',
      tables,
      storage,
      hashes: {},
    };
    for (const name of ['database.dump', 'storage.tar.gz', 'runtime.env'])
      manifest.hashes[name] = await hashFile(join(stage, name));
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest), {
      mode: 0o600,
    });
    const name = `otogrow-native-${createdAt.replace(/[^0-9TZ]/g, '')}-${randomBytes(6).toString('hex')}.backup`;
    const pending = join(stage, 'archive');
    await tarToEncryptedFile(stage, pending, config.key, config.connection);
    const destination = join(directory, name);
    await rename(pending, destination);
    const cutoff = Date.now() - config.retentionDays * 86400000;
    for (const entry of await readdir(directory))
      if (/^otogrow-native-[0-9TZ]+-[a-f0-9]{12}\.backup$/.test(entry)) {
        const path = join(directory, entry);
        const info = await lstat(path);
        if (
          path !== destination &&
          info.isFile() &&
          !info.isSymbolicLink() &&
          info.mtimeMs < cutoff
        )
          await rm(path);
      }
    return {
      archive: destination,
      createdAt,
      tables: tables.length,
      files: storage.length,
      consistency: manifest.consistency,
    };
  } finally {
    try {
      if (marker) await resumeNativeBackup(config.environment, marker.nonce);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
};
const unpackBackup = async (config, archive, stage) => {
  const info = await lstat(archive);
  assert(
    info.isFile() && !info.isSymbolicLink() && info.size > MAGIC.length + 28,
    'Choose a complete regular encrypted backup.',
  );
  const input = await open(archive, 'r');
  const header = Buffer.alloc(MAGIC.length + 12);
  await input.read(header, 0, header.length, 0);
  assert(
    header.subarray(0, MAGIC.length).equals(MAGIC),
    'Unsupported backup format.',
  );
  const tag = Buffer.alloc(16);
  await input.read(tag, 0, 16, info.size - 16);
  await input.close();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    config.key,
    header.subarray(MAGIC.length),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const tarPath = join(stage, 'archive.tar');
  await pipeline(
    createReadStream(archive, { start: header.length, end: info.size - 17 }),
    decipher,
    createWriteStream(tarPath, { flags: 'wx', mode: 0o600 }),
  );
  const names = (await run('tar', ['tf', tarPath], config.connection))
    .split('\n')
    .sort();
  assert.deepEqual(names, [
    'database.dump',
    'manifest.json',
    'runtime.env',
    'storage.tar.gz',
  ]);
  const types = (await run('tar', ['tvf', tarPath], config.connection)).split(
    '\n',
  );
  assert(
    types.every((line) => line.startsWith('-')),
    'The outer archive must contain regular files only.',
  );
  await run('tar', ['xf', tarPath, '-C', stage], config.connection);
  const manifest = JSON.parse(
    await readFile(join(stage, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.version, 1);
  assert.equal(manifest.database, config.database);
  assert.equal(manifest.consistency, 'API_AND_WORKER_QUIESCED');
  for (const name of ['database.dump', 'storage.tar.gz', 'runtime.env']) {
    assert((await lstat(join(stage, name))).isFile());
    assert.equal(
      await hashFile(join(stage, name)),
      manifest.hashes[name],
      `Recovery checksum mismatch: ${name}`,
    );
  }
  await run(
    'pg_restore',
    ['--list', join(stage, 'database.dump')],
    config.connection,
  );
  return manifest;
};
export const verifyNativeBackup = async (config, archive, drill = false) => {
  const stage = await mkdtemp(join(tmpdir(), 'otogrow-recovery-'));
  const database = `otogrow_restore_${randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    const manifest = await unpackBackup(config, resolve(archive), stage);
    if (drill) {
      await run(
        'createdb',
        ['--template', 'template0', '--', database],
        config.connection,
      );
      created = true;
      await run(
        'psql',
        [
          '-X',
          '-qAt',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `REVOKE ALL ON DATABASE \"${database}\" FROM PUBLIC`,
        ],
        config.connection,
      );
      await run(
        'pg_restore',
        [
          '--exit-on-error',
          '--no-owner',
          '--no-acl',
          '--dbname',
          database,
          join(stage, 'database.dump'),
        ],
        config.connection,
      );
      assert.deepEqual(
        await databaseSnapshot(config.connection, database),
        manifest.tables,
        'Restored table contents differ from the backup.',
      );
      const media = join(stage, 'restored-storage');
      await mkdir(media, { mode: 0o700 });
      const entries = (
        await run(
          'tar',
          ['tzf', join(stage, 'storage.tar.gz')],
          config.connection,
        )
      ).split('\n');
      assert(
        entries.every(
          (name) => !name.startsWith('/') && !name.split('/').includes('..'),
        ),
        'Storage archive contains an unsafe path.',
      );
      const mediaTypes = (
        await run(
          'tar',
          ['tvzf', join(stage, 'storage.tar.gz')],
          config.connection,
        )
      ).split('\n');
      assert(
        mediaTypes.every(
          (line) => line.startsWith('-') || line.startsWith('d'),
        ),
        'Restored storage must contain regular files/directories only.',
      );
      await run(
        'tar',
        ['xzf', join(stage, 'storage.tar.gz'), '-C', media],
        config.connection,
      );
      assert.deepEqual(
        await storageSnapshot(media),
        manifest.storage,
        'Restored media differs from the backup.',
      );
    }
    return {
      valid: true,
      restoreDrill: drill,
      createdAt: manifest.createdAt,
      tables: manifest.tables.length,
      files: manifest.storage.length,
      runtimeSecretsIncluded: true,
    };
  } finally {
    try {
      if (created) await run('dropdb', ['--', database], config.connection);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
};
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, archive] = process.argv.slice(2);
    assert(
      ['create', 'check', 'drill', 'resume'].includes(command),
      'Usage: backup.mjs create | check <archive> | drill <archive> | resume',
    );
    if (command === 'resume')
      console.log(JSON.stringify(await resumeNativeBackup()));
    else {
      const config = await backupConfiguration();
      if (command !== 'create')
        assert(archive, 'Choose an encrypted backup archive.');
      console.log(
        JSON.stringify(
          command === 'create'
            ? await createNativeBackup(config)
            : await verifyNativeBackup(config, archive, command === 'drill'),
        ),
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Backup operation failed.',
    );
    process.exitCode = 1;
  }
}
