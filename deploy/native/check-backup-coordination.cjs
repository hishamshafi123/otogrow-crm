const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdtemp, readFile, writeFile, mkdir, chmod, rm, lstat, realpath } = require('node:fs/promises');
const { tmpdir, homedir } = require('node:os');
const { join, isAbsolute } = require('node:path');

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const execute = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Coordination proof timed out: ${output}`)); }, 60000);
  child.once('error', (error) => { clearTimeout(timeout); reject(error); });
  child.once('exit', (status) => { clearTimeout(timeout); status === 0 ? resolve(output) : reject(new Error(`Coordination proof failed (${status}): ${output}`)); });
});
const main = async () => {
  const configuredRoot = process.env.OTOGROW_LOCK_TEST_SCRATCH_ROOT;
  const scratchRoot = configuredRoot || (process.platform === 'darwin' ? join(homedir(), '.otogrow-native-proofs') : await realpath(tmpdir()));
  assert(isAbsolute(scratchRoot), 'The proof scratch root must be absolute.');
  if (configuredRoot || process.platform === 'darwin') {
    await mkdir(scratchRoot, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const rootMetadata = await lstat(scratchRoot);
    assert(rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink(), 'The private scratch root must be a real directory.');
    assert.equal(rootMetadata.uid, process.getuid(), 'The private scratch root must belong to the current user.');
    assert.equal(rootMetadata.mode & 0o077, 0, 'The private scratch root must exclude other users.');
    assert.equal(await realpath(scratchRoot), scratchRoot, 'The private scratch root must not traverse symbolic links.');
  }
  const directory = await mkdtemp(join(scratchRoot, 'otogrow-backup-lock-proof-'));
  await chmod(directory, 0o700);
  const directoryMetadata = await lstat(directory);
  const nonce = randomBytes(12).toString('hex');
  const container = `otogrow-backup-lock-${nonce}`;
  let containerCreated = false;
  try {
    const scheduled = await readFile(join(__dirname, 'otogrow-crm-backup.service'), 'utf8');
    const beforeDeploy = await readFile(join(__dirname, 'otogrow-crm-backup-before-deploy.service'), 'utf8');
    const installerSource = await readFile(join(__dirname, 'otogrow-crm-install-release'), 'utf8');
    const setting = (source, key) => {
      const lines = source.split('\n').filter((line) => line.startsWith(`${key}=`));
      assert.equal(lines.length, 1, `Expected exactly one ${key}`);
      return lines[0].slice(key.length + 1);
    };
    assert(setting(scheduled, 'ExecStart').includes('/run/lock/otogrow-crm-deploy.lock /usr/bin/flock'));
    assert(!setting(beforeDeploy, 'ExecStart').includes('otogrow-crm-deploy.lock'));
    for (const unit of [scheduled, beforeDeploy]) {
      assert(setting(unit, 'ExecStart').includes('/run/lock/otogrow-crm-backup.lock /opt/nodejs/24/bin/node /usr/local/lib/otogrow-crm/backup.mjs create'));
      assert(setting(unit, 'ExecStopPost').includes('/run/lock/otogrow-crm-backup.lock /opt/nodejs/24/bin/node /usr/local/lib/otogrow-crm/backup.mjs resume'));
      for (const [key, value] of Object.entries({ User: 'root', Group: 'root', MemoryMax: '512M', MemoryHigh: '384M', NoNewPrivileges: 'true', ProtectSystem: 'strict', CacheDirectory: 'otogrow-crm-backup', CacheDirectoryMode: '0700' })) assert.equal(setting(unit, key), value);
      assert(!unit.includes('/opt/otogrow-crm/current/'), 'Privileged backup must not execute untrusted application-release code.');
    }
    const fixturePath = process.platform === 'linux' ? directory : '/proof';
    const replaceExactly = (source, original, replacement) => {
      assert.equal(source.split(original).length, 2, `Source fixture replacement drift: ${original}`);
      return source.replace(original, replacement);
    };
    let installer = installerSource;
    for (const [original, replacement] of [
      ["base='/opt/otogrow-crm'", `base=${quote(`${fixturePath}/app`)}`],
      ["storage_dir='/var/lib/otogrow-crm/storage'", `storage_dir=${quote(`${fixturePath}/storage`)}`],
      ["cache_dir='/var/cache/otogrow-crm'", `cache_dir=${quote(`${fixturePath}/cache`)}`],
      ["lock='/run/lock/otogrow-crm-deploy.lock'", `lock=${quote(`${fixturePath}/deploy.lock`)}`],
      ["deploy_user='crmdeploy'", 'deploy_user="$(id -u)"'],
      ["service_user='crmapp'", 'service_user="$(id -u)"'],
      ["stat -c '%U'", "stat -c '%u'"],
      ['incoming="/home/$deploy_user/incoming"', `incoming=${quote(`${fixturePath}/incoming`)}`],
    ]) installer = replaceExactly(installer, original, replacement);
    const unitCommand = (unit, key) => setting(unit, key)
      .replaceAll('/run/lock/otogrow-crm-deploy.lock', `${fixturePath}/deploy.lock`)
      .replaceAll('/run/lock/otogrow-crm-backup.lock', `${fixturePath}/backup.lock`)
      .replace('/opt/nodejs/24/bin/node /usr/local/lib/otogrow-crm/backup.mjs', `/bin/bash ${quote(`${fixturePath}/fake-backup.sh`)}`)
      .replace('--wait 1800', '--wait 3').replace('--wait 80', '--wait 3');
    await mkdir(join(directory, 'bin'));
    await writeFile(join(directory, 'ownership.json'), JSON.stringify({ nonce, directory, container, purpose: 'No database or actual service; copied installer and real flock only' }), { mode: 0o600 });
    await writeFile(join(directory, 'installer'), installer, { mode: 0o700 });
    for (const [file, unit, key] of [['scheduled', scheduled, 'ExecStart'], ['before-deploy', beforeDeploy, 'ExecStart'], ['resume', beforeDeploy, 'ExecStopPost']]) await writeFile(join(directory, `${file}.sh`), `#!/bin/bash\nset -euo pipefail\nexec ${unitCommand(unit, key)}\n`, { mode: 0o700 });
    await writeFile(join(directory, 'fake-backup.sh'), `#!/bin/bash
set -euo pipefail
[[ "$PROOF" == ${quote(fixturePath)} ]]
mkdir "$PROOF/exclusive-body" || { echo 'OVERLAPPING BACKUP OR RECOVERY' >&2; exit 99; }
trap 'rmdir "$PROOF/exclusive-body"' EXIT
echo "START \${CASE_ID:-fixture} $1" >> "$PROOF/backup.log"
if [[ -n "\${WAIT_FILE:-}" && "$1" == create ]]; then
  for attempt in $(seq 1 100); do [[ -e "$WAIT_FILE" ]] && break; sleep 0.02; done
  [[ -e "$WAIT_FILE" ]]
fi
if [[ "\${FAIL_BACKUP:-0}" == 1 && "$1" == create ]]; then exit 17; fi
sleep 0.03
echo "END \${CASE_ID:-fixture} $1" >> "$PROOF/backup.log"
`, { mode: 0o700 });
    await writeFile(join(directory, 'bin', 'systemctl'), `#!/bin/bash
set -euo pipefail
echo "$*" >> "$PROOF/systemctl.log"
case "$1" in
  cat)
    [[ "$2" == otogrow-crm-backup.service ]] && exit 0
    [[ "$2" == otogrow-crm-backup-before-deploy.service && "\${MISSING_COMPANION:-0}" == 0 ]] && exit 0
    exit 1;;
  start)
    if [[ "$2" == otogrow-crm-backup-before-deploy.service ]]; then
      # A systemd service does not inherit the installer's deployment-lock descriptor.
      exec 9>&-
      set +e
      /bin/bash "$PROOF/before-deploy.sh"
      status=$?
      /bin/bash "$PROOF/resume.sh"
      resume=$?
      [[ "$status" == 0 ]] && status=$resume
      exit "$status"
    fi
    [[ "$2" != otogrow-crm-backup.service ]] || { echo 'Self-blocking legacy unit was called' >&2; exit 98; }
    exit 0;;
  is-active)
    [[ "\${WORKER_DOWN:-0}" == 1 && "\${*: -1}" == otogrow-crm-worker.service ]] && exit 3
    exit 0;;
  restart|stop) exit 0;;
esac
exit 97
`, { mode: 0o700 });
    await writeFile(join(directory, 'bin', 'install'), `#!/bin/bash
set -euo pipefail
values=()
while [[ $# -gt 0 ]]; do
  case "$1" in -o|-g) shift 2;; *) values+=("$1"); shift;; esac
done
exec /usr/bin/install "\${values[@]}"
`, { mode: 0o700 });
    for (const command of ['chown', 'curl', 'journalctl']) await writeFile(join(directory, 'bin', command), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
    const harness = `#!/bin/bash
set -euo pipefail
export PROOF=${quote(fixturePath)}
export PATH="$PROOF/bin:/usr/bin:/bin"
touch "$PROOF/deploy.lock" "$PROOF/backup.lock" "$PROOF/backup.log" "$PROOF/systemctl.log"
wait_for() { for attempt in $(seq 1 100); do grep -Fq "$1" "$PROOF/backup.log" && return; sleep 0.02; done; return 1; }
exec 9>"$PROOF/deploy.lock"
/usr/bin/flock 9
if /usr/bin/flock --nonblock "$PROOF/deploy.lock" true; then echo 'The legacy self-lock must conflict' >&2; exit 1; fi
CASE_ID=inside-deploy /bin/bash "$PROOF/before-deploy.sh" 9>&-
if /bin/bash "$PROOF/scheduled.sh" 9>&-; then echo 'Scheduled backup must exclude deployment' >&2; exit 1; fi
exec 9>&-

# An orphaned systemd backup keeps the backup lock after its installer releases deploy.
: > "$PROOF/backup.log"
exec 9>"$PROOF/deploy.lock"; /usr/bin/flock 9
CASE_ID=orphan WAIT_FILE="$PROOF/release-orphan" /bin/bash "$PROOF/before-deploy.sh" 9>&- & orphan=$!
wait_for 'START orphan create'
exec 9>&-
(
  exec 9>"$PROOF/deploy.lock"; /usr/bin/flock --wait 3 9
  CASE_ID=next-installer /bin/bash "$PROOF/before-deploy.sh" 9>&-
  echo activated >> "$PROOF/activation.log"
) & next=$!
sleep 0.06
! grep -Fq 'START next-installer' "$PROOF/backup.log"
[[ ! -e "$PROOF/activation.log" ]]
touch "$PROOF/release-orphan"
wait "$orphan"; wait "$next"
[[ "$(grep -n 'END orphan create' "$PROOF/backup.log" | cut -d: -f1)" -lt "$(grep -n 'START next-installer create' "$PROOF/backup.log" | cut -d: -f1)" ]]

# Scheduled work also uses the same backup lock, and blocks a later installer via deploy.
: > "$PROOF/backup.log"
CASE_ID=scheduled WAIT_FILE="$PROOF/release-scheduled" /bin/bash "$PROOF/scheduled.sh" & scheduled=$!
wait_for 'START scheduled create'
if /usr/bin/flock --nonblock "$PROOF/deploy.lock" true; then exit 1; fi
if /usr/bin/flock --nonblock "$PROOF/backup.lock" true; then exit 1; fi
touch "$PROOF/release-scheduled"; wait "$scheduled"

revision=$(printf '%040d' 1)
deps=$(printf '%064d' 2)
prepare_installer() {
  rm -rf -- "$PROOF/app" "$PROOF/incoming" "$PROOF/code" "$PROOF/storage" "$PROOF/cache"
  mkdir -p "$PROOF/app/releases/previous" "$PROOF/app/deps/$deps/node_modules" "$PROOF/incoming" "$PROOF/code/packages/twenty-server/dist/front"
  ln -s "$PROOF/app/releases/previous" "$PROOF/app/current"
  printf '%s' "$revision" > "$PROOF/code/REVISION"
  printf '%s' "$deps" > "$PROOF/code/DEPS_KEY"
  printf 'synthetic only' > "$PROOF/code/packages/twenty-server/dist/main.js"
  printf 'synthetic only' > "$PROOF/code/packages/twenty-server/dist/front/index.html"
  tar -czf "$PROOF/incoming/otogrow-crm-$revision.tar.gz" -C "$PROOF/code" .
  : > "$PROOF/systemctl.log"
}
prepare_installer
if MISSING_COMPANION=1 /bin/bash "$PROOF/installer" "$revision" > "$PROOF/missing.log" 2>&1; then exit 1; fi
[[ "$(readlink "$PROOF/app/current")" == "$PROOF/app/releases/previous" ]]
! grep -q '^start ' "$PROOF/systemctl.log"
[[ ! -e "$PROOF/app/releases/$revision" ]]

prepare_installer
if FAIL_BACKUP=1 /bin/bash "$PROOF/installer" "$revision" > "$PROOF/failure.log" 2>&1; then exit 1; fi
[[ "$(readlink "$PROOF/app/current")" == "$PROOF/app/releases/previous" ]]
! grep -q 'otogrow-crm-migrate.service' "$PROOF/systemctl.log"
[[ ! -e "$PROOF/app/releases/$revision" ]]

prepare_installer
if WORKER_DOWN=1 /bin/bash "$PROOF/installer" "$revision" > "$PROOF/worker.log" 2>&1; then exit 1; fi
[[ "$(readlink "$PROOF/app/current")" == "$PROOF/app/releases/previous" ]]
grep -q 'worker is not running; rolling' "$PROOF/worker.log"
! grep -q '^Activated ' "$PROOF/worker.log"
[[ -f "$PROOF/incoming/otogrow-crm-$revision.tar.gz" ]]

prepare_installer
/bin/bash "$PROOF/installer" "$revision" > "$PROOF/success.log" 2>&1
[[ "$(readlink "$PROOF/app/current")" == "$PROOF/app/releases/$revision" ]]
grep -q '^Activated ' "$PROOF/success.log"
grep -q '^start otogrow-crm-backup-before-deploy.service$' "$PROOF/systemctl.log"
! grep -q '^start otogrow-crm-backup.service$' "$PROOF/systemctl.log"
! grep -qE 'bon|otogrow-install|redis-otogrow.service' "$PROOF/systemctl.log"
echo 'PASS real flock: deployment/pre-release exclusion, scheduled lock order, interrupted-caller serialization, missing companion/failed backup block activation, worker failure rolls back with nonzero status, healthy API+worker success. No actual systemd/database/provider calls.'
`;
    await writeFile(join(directory, 'harness.sh'), harness, { mode: 0o700 });
    if (process.platform === 'linux') {
      console.log(await execute('/bin/bash', [join(directory, 'harness.sh')]));
    } else {
      const image = process.env.OTOGROW_LOCK_TEST_IMAGE || 'postgres:16';
      const inspected = spawnSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8' });
      assert.equal(inspected.status, 0, 'A locally installed Linux image with bash, GNU coreutils and util-linux flock is required. Set OTOGROW_LOCK_TEST_IMAGE; this proof never pulls images.');
      const imageId = inspected.stdout.trim();
      assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
      const created = spawnSync('docker', ['create', '--name', container, '--user', `${process.getuid()}:${process.getgid()}`, '--label', `otogrow.backup-lock-proof=${nonce}`, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '256m', '--cpus', '1', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--mount', `type=bind,src=${directory},dst=/proof`, '--entrypoint', '/bin/bash', imageId, '/proof/harness.sh'], { encoding: 'utf8' });
      assert.equal(created.status, 0, created.stderr); containerCreated = true;
      console.log(await execute('docker', ['start', '--attach', container]));
      const completed = spawnSync('docker', ['inspect', '--format', '{{.State.ExitCode}}', container], { encoding: 'utf8' });
      assert.equal(completed.status, 0, completed.stderr);
      assert.equal(completed.stdout.trim(), '0', 'The isolated lock harness must complete successfully.');
    }
  } catch (error) {
    for (const filename of ['missing.log', 'failure.log', 'worker.log', 'success.log', 'backup.log', 'systemctl.log']) {
      const diagnostic = await readFile(join(directory, filename), 'utf8').catch(() => '');
      if (diagnostic) console.error(`${filename}:\n${diagnostic.slice(-6000)}`);
    }
    throw error;
  } finally {
    if (containerCreated) {
      const inspected = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "otogrow.backup-lock-proof" }}', container], { encoding: 'utf8' });
      assert.equal(inspected.status, 0, `Inspect ownership before cleanup: ${directory}`);
      assert.equal(inspected.stdout.trim(), nonce, `Container ownership changed; preserve ${directory}`);
      const removed = spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
      assert.equal(removed.status, 0, removed.stderr);
    }
    const cleanupMetadata = await lstat(directory);
    assert(cleanupMetadata.isDirectory() && !cleanupMetadata.isSymbolicLink(), 'Proof directory ownership changed; preserve it.');
    assert.equal(cleanupMetadata.uid, directoryMetadata.uid);
    assert.equal(cleanupMetadata.ino, directoryMetadata.ino);
    assert.equal(cleanupMetadata.dev, directoryMetadata.dev);
    await rm(directory, { recursive: true, force: true });
  }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
