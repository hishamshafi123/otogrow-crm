const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const { Kind, parse } = require('graphql');
const FILE = '/tmp/otogrow-native-client-setup-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LIMIT = 16384;
const markerFor = (nonce) => `native-client-setup-ui:${nonce}`;
const titleFor = (nonce) =>
  `Disposable Native Client Setup ${nonce.slice(0, 8)}`;
const companyNameFor = (fixture) => `${fixture.title} native company`;
const proofPath = (fixture) =>
  `/tmp/otogrow-native-company-intent-${fixture.nonce}.json`;
const inputHash = (input) =>
  createHash('sha256')
    .update(JSON.stringify({ id: input.id, name: input.name }))
    .digest('hex');
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function readPrivate(path, maximum = 32 * 1024 * 1024) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    assert(
      metadata.isFile() &&
        (metadata.mode & 0o077) === 0 &&
        metadata.size <= maximum,
      'Use a bounded private regular proof file.',
    );
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } finally {
    closeSync(descriptor);
  }
}
function validateFixture(fixture) {
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of ['nonce', 'actorId', 'actorUserId', 'userWorkspaceId'])
    assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.title, titleFor(fixture.nonce));
  return fixture;
}
function matchingCompanyInput(payload, fixture) {
  if (
    !object(payload) ||
    payload.operationName !== 'CreateOneCompany' ||
    typeof payload.query !== 'string' ||
    !object(payload.variables) ||
    !object(payload.variables.input)
  )
    return null;
  let document;
  try {
    document = parse(payload.query);
  } catch {
    return null;
  }
  const operations = document.definitions.filter(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (operations.length !== 1) return null;
  const operation = operations[0],
    fields = operation.selectionSet.selections;
  if (
    operation.operation !== 'mutation' ||
    operation.name?.value !== 'CreateOneCompany' ||
    fields.length !== 1
  )
    return null;
  const field = fields[0],
    arguments_ = field.arguments ?? [];
  if (
    field.kind !== Kind.FIELD ||
    field.alias ||
    field.name.value !== 'createCompany' ||
    arguments_.length !== 1 ||
    arguments_[0].name.value !== 'data' ||
    arguments_[0].value.kind !== Kind.VARIABLE ||
    arguments_[0].value.name.value !== 'input'
  )
    return null;
  const input = payload.variables.input;
  if (
    Object.keys(input).sort().join(',') !== 'id,name' ||
    typeof input.id !== 'string' ||
    !UUID.test(input.id) ||
    input.name !== companyNameFor(fixture)
  )
    return null;
  return { id: input.id, name: input.name };
}
function validateIntent(proof, fixture) {
  validateFixture(fixture);
  assert.equal(proof.version, 1);
  assert.equal(proof.trust, 'UNTRUSTED_PRECOMMIT_INPUT');
  assert.equal(proof.nonce, fixture.nonce);
  assert.equal(proof.workspaceId, fixture.workspaceId);
  assert.equal(proof.expectedActorId, fixture.actorId);
  assert.equal(proof.expectedUserWorkspaceId, fixture.userWorkspaceId);
  assert.equal(proof.operation, 'CreateOneCompany');
  assert.equal(proof.path, '/graphql');
  assert.match(proof.input?.id, UUID);
  assert.equal(proof.input.name, companyNameFor(fixture));
  assert.equal(proof.inputHash, inputHash(proof.input));
  const time = Date.parse(proof.observedAt);
  assert(
    Number.isFinite(time) &&
      time >= Date.parse(fixture.createdAt) &&
      time <= Date.now() + 5000,
  );
  return proof;
}
function intentFor(fixture) {
  return existsSync(proofPath(fixture))
    ? validateIntent(readPrivate(proofPath(fixture), LIMIT), fixture)
    : null;
}
function recordIntent(fixture, input) {
  validateFixture(fixture);
  assert.equal(fixture.status, 'READY');
  assert(
    fixture.baseline && fixture.seed && fixture.redis?.url,
    'Prepare the isolated fixture before observing a native write.',
  );
  const age = Date.now() - Date.parse(fixture.createdAt);
  assert(
    age >= 0 && age < 6 * 60 * 60 * 1000,
    'Use a fresh native-company fixture.',
  );
  assert.equal(input.name, companyNameFor(fixture));
  assert.match(input.id, UUID);
  const destination = proofPath(fixture);
  if (existsSync(destination)) {
    const existing = intentFor(fixture);
    assert.deepEqual(
      existing.input,
      input,
      'Only the original exact company identity may be observed again.',
    );
    return existing;
  }
  const proof = {
    version: 1,
    trust: 'UNTRUSTED_PRECOMMIT_INPUT',
    nonce: fixture.nonce,
    workspaceId: fixture.workspaceId,
    expectedActorId: fixture.actorId,
    expectedUserWorkspaceId: fixture.userWorkspaceId,
    operation: 'CreateOneCompany',
    path: '/graphql',
    input,
    inputHash: inputHash(input),
    observedAt: new Date().toISOString(),
  };
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, JSON.stringify(proof, null, 2));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    linkSync(temporary, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = intentFor(fixture);
    assert.deepEqual(
      existing.input,
      input,
      'A concurrent different company identity cannot replace the first intent.',
    );
  } finally {
    unlinkSync(temporary);
  }
  const directory = openSync(dirname(destination), constants.O_RDONLY);
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  return intentFor(fixture);
}
module.exports = {
  FILE,
  WORKSPACE_ID,
  UUID,
  LIMIT,
  markerFor,
  titleFor,
  companyNameFor,
  proofPath,
  readPrivate,
  validateFixture,
  matchingCompanyInput,
  validateIntent,
  intentFor,
  recordIntent,
};
