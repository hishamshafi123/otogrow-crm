const assert = require('node:assert/strict');
const {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { Server } = require('node:http');
const { dirname } = require('node:path');
const { brotliDecompressSync, gunzipSync, inflateSync } = require('node:zlib');
const { Kind, parse } = require('graphql');

function matchesFixtureMutation(query, operationName, fieldName) {
  if (typeof query !== 'string') return false;
  try {
    const operations = parse(query).definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    if (operations.length !== 1) return false;
    const operation = operations[0];
    const fields = operation.selectionSet.selections;
    if (
      operation.operation !== 'mutation' ||
      operation.name?.value !== operationName ||
      fields.length !== 1
    )
      return false;
    const field = fields[0];
    if (
      field.kind !== Kind.FIELD ||
      field.alias ||
      field.name.value !== fieldName
    )
      return false;
    const arguments_ = field.arguments ?? [];
    return (
      arguments_.length === 1 &&
      arguments_[0].name.value === 'input' &&
      arguments_[0].value.kind === Kind.VARIABLE &&
      arguments_[0].value.name.value === 'input'
    );
  } catch {
    return false;
  }
}

const knowledgeMode = Boolean(process.env.OTOGROW_KNOWLEDGE_HTTP_FAULT);
const enabled = knowledgeMode
  ? process.env.OTOGROW_KNOWLEDGE_HTTP_FAULT
  : process.env.OTOGROW_CLIENT_SETUP_HTTP_FAULT;
if (enabled) {
  assert(
    !(
      process.env.OTOGROW_KNOWLEDGE_HTTP_FAULT &&
      process.env.OTOGROW_CLIENT_SETUP_HTTP_FAULT
    ),
    'Arm only one exact fixture operation.',
  );
  assert.equal(
    enabled,
    'drop-once-after-commit',
    'Explicit local setup fault mode is required.',
  );
  const JOURNAL = knowledgeMode
    ? '/tmp/otogrow-knowledge-ui-fixture.json'
    : '/tmp/otogrow-client-setup-ui-fixture.json';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
  const OPERATION = knowledgeMode
    ? 'SaveDeliveryKnowledgeSource'
    : 'CreateDeliveryClientSetup';
  const LIMIT = 1024 * 1024;
  const HOUR = 60 * 60 * 1000;
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const localHost = (value) =>
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '[::1]' ||
    value.endsWith('.localhost');
  const localAddress = (value) =>
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
  for (const name of ['PG_DATABASE_URL', 'SERVER_URL']) {
    assert(
      process.env[name],
      `${name} must already be loaded before this preload.`,
    );
    let url;
    try {
      url = new URL(process.env[name]);
    } catch {
      throw new Error(`${name} must be a valid local URL.`);
    }
    assert(localHost(url.hostname), `${name} must point to localhost.`);
    if (name === 'SERVER_URL')
      assert.equal(
        url.protocol,
        'http:',
        'This local HTTP-only fixture cannot intercept a remote/TLS endpoint.',
      );
  }
  function readPrivate(path, maximumBytes) {
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const metadata = fstatSync(descriptor);
      assert(
        metadata.isFile() &&
          (metadata.mode & 0o077) === 0 &&
          metadata.size <= maximumBytes,
        'Use a bounded private regular proof/journal file.',
      );
      return JSON.parse(readFileSync(descriptor, 'utf8'));
    } finally {
      closeSync(descriptor);
    }
  }
  function fixtureNow() {
    const fixture = readPrivate(JOURNAL, 16 * LIMIT);
    assert.equal(fixture.version, 1);
    assert.equal(fixture.workspaceId, WORKSPACE_ID);
    assert.equal(
      fixture.status,
      'READY',
      'Use only the current fully prepared browser fixture.',
    );
    for (const key of ['nonce', 'actorId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert(
      fixture.baseline &&
        Array.isArray(fixture.baseline.tables) &&
        fixture.seed,
    );
    if (knowledgeMode) {
      assert.equal(fixture.marker, `knowledge-ui:${fixture.nonce}`);
      assert.equal(
        fixture.title,
        `Disposable Knowledge ${fixture.nonce.slice(0, 8)}`,
      );
      assert.match(fixture.plannedId, UUID);
      assert.match(fixture.projects?.[0], UUID);
      assert(object(fixture.plannedInput));
      assert.equal(fixture.plannedInput.category, 'MEETING');
      assert.equal(
        fixture.plannedInput.title,
        `${fixture.title} imported strategy meeting`,
      );
      assert(fixture.plannedInput.transcript.includes(fixture.marker));
      for (const key of ['projects', 'sources', 'versions'])
        assert.match(fixture.seed[key], /^[a-f0-9]{64}$/);
    } else {
      assert.match(fixture.companyId, UUID);
      assert.equal(fixture.marker, `client-setup-ui:${fixture.nonce}`);
      assert.equal(
        fixture.title,
        `Disposable Client Setup ${fixture.nonce.slice(0, 8)}`,
      );
      assert(!fixture.uiCompanyId, 'Native company commits are excluded.');
      assert(
        /^[a-f0-9]{64}$/.test(
          fixture.seed[`${fixture.schema}.company:${fixture.companyId}`] ?? '',
        ),
        'The exact seeded company must have its immutable ownership proof.',
      );
    }
    const created = Date.parse(fixture.createdAt);
    assert(
      Number.isFinite(created) &&
        created <= Date.now() &&
        Date.now() - created < 6 * HOUR,
      'A fresh active fixture is required.',
    );
    return fixture;
  }
  const fixture = fixtureNow();
  const proofPath = `/tmp/otogrow-${knowledgeMode ? 'knowledge' : 'client-setup'}-http-fault-${fixture.nonce}.json`;
  function sameFixture(current) {
    return (
      [
        'nonce',
        'workspaceId',
        'companyId',
        'actorId',
        'userWorkspaceId',
        'createdAt',
        'plannedId',
      ].every((key) => current[key] === fixture[key]) &&
      (!knowledgeMode ||
        (current.projects[0] === fixture.projects[0] &&
          JSON.stringify(current.plannedInput) ===
            JSON.stringify(fixture.plannedInput)))
    );
  }
  function assertProof(proof) {
    assert.equal(proof.version, 1);
    assert.equal(proof.operation, OPERATION);
    assert.equal(proof.nonce, fixture.nonce);
    assert.equal(proof.workspaceId, WORKSPACE_ID);
    assert.equal(proof.memberId, fixture.actorId);
    assert.equal(proof.userWorkspaceId, fixture.userWorkspaceId);
    if (knowledgeMode) {
      assert.equal(proof.phase, 'DURABLE_STATE_BEFORE_SOCKET_DESTROY');
      assert.equal(proof.sourceId, fixture.plannedId);
      assert.equal(proof.projectId, fixture.projects[0]);
      assert.equal(proof.sourceRevision, 1);
      assert.equal(proof.sourceVersion, 1);
      return;
    }
    assert.equal(proof.companyId, fixture.companyId);
    assert.equal(proof.phase, 'DURABLE_RECEIPT_BEFORE_SOCKET_DESTROY');
    for (const key of ['requestId', 'projectId', 'engagementId'])
      assert.match(proof[key], UUID);
    assert(proof.taskId === null || UUID.test(proof.taskId));
  }
  let consumed = false;
  if (existsSync(proofPath)) {
    assertProof(readPrivate(proofPath, 16384));
    consumed = true;
  }
  function durableProof(proof) {
    let descriptor;
    try {
      descriptor = openSync(
        proofPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (error.code === 'EEXIST') {
        assertProof(readPrivate(proofPath, 16384));
        consumed = true;
        return false;
      }
      throw error;
    }
    try {
      writeFileSync(descriptor, JSON.stringify(proof, null, 2));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const directory = openSync(dirname(proofPath), constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    consumed = true;
    return true;
  }
  const originalEmit = Server.prototype.emit;
  const decode = (body, encoding) => {
    if (encoding == null || encoding === '' || encoding === 'identity')
      return body;
    assert.equal(typeof encoding, 'string');
    const options = { maxOutputLength: LIMIT };
    if (encoding.trim().toLowerCase() === 'gzip')
      return gunzipSync(body, options);
    if (encoding.trim().toLowerCase() === 'br')
      return brotliDecompressSync(body, options);
    if (encoding.trim().toLowerCase() === 'deflate')
      return inflateSync(body, options);
    throw new Error(
      'Unsupported response compression; preserve the normal response.',
    );
  };
  const bytes = (chunk, encoding) =>
    typeof chunk === 'string'
      ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
      : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : Buffer.alloc(0);
  Server.prototype.emit = function (event, ...arguments_) {
    const [request, response] = arguments_;
    const path = request?.url?.split('?')[0];
    if (
      consumed ||
      event !== 'request' ||
      request?.method !== 'POST' ||
      path !== '/metadata' ||
      !localAddress(request.socket?.remoteAddress) ||
      !localAddress(request.socket?.localAddress)
    )
      return originalEmit.call(this, event, ...arguments_);
    let host;
    try {
      host = new URL(`http://${request.headers.host}`).hostname;
    } catch {
      return originalEmit.call(this, event, ...arguments_);
    }
    if (!localHost(host)) return originalEmit.call(this, event, ...arguments_);
    const startedAt = new Date().toISOString();
    let candidate = null,
      requestSize = 0,
      responseSize = 0,
      bypass = false;
    const requestChunks = [],
      responseChunks = [];
    const originalWrite = response.write,
      originalEnd = response.end;
    const flush = () => {
      for (const chunk of responseChunks) originalWrite.call(response, chunk);
      responseChunks.length = 0;
    };
    // Observe before body-parser's end listener so only the exact matching response is buffered.
    request.on('data', (chunk) => {
      const value = bytes(chunk);
      requestSize += value.length;
      if (requestSize <= LIMIT) requestChunks.push(value);
      else requestChunks.length = 0;
    });
    request.once('end', () => {
      try {
        if (requestSize > LIMIT) return;
        const parsed = JSON.parse(
          Buffer.concat(requestChunks).toString('utf8'),
        );
        if (
          object(parsed) &&
          parsed.operationName === OPERATION &&
          matchesFixtureMutation(
            parsed.query,
            OPERATION,
            knowledgeMode
              ? 'saveDeliveryKnowledgeSource'
              : 'createDeliveryClientSetup',
          ) &&
          object(parsed.variables) &&
          object(parsed.variables.input) &&
          (knowledgeMode
            ? parsed.variables.input.id === fixture.plannedId &&
              parsed.variables.input.projectId === fixture.projects[0] &&
              parsed.variables.input.revision === 0 &&
              Object.entries(fixture.plannedInput).every(
                ([key, value]) => parsed.variables.input[key] === value,
              )
            : parsed.variables.input.companyId === fixture.companyId &&
              typeof parsed.variables.input.requestId === 'string' &&
              UUID.test(parsed.variables.input.requestId))
        )
          candidate = knowledgeMode
            ? { sourceId: fixture.plannedId }
            : { requestId: parsed.variables.input.requestId };
      } catch {
        candidate = null;
      } finally {
        requestChunks.length = 0;
      }
    });
    response.write = function (chunk, ...rest) {
      if (!candidate || bypass || consumed) {
        if (responseChunks.length) flush();
        return originalWrite.call(this, chunk, ...rest);
      }
      const value = bytes(chunk, rest[0]);
      responseSize += value.length;
      if (responseSize > LIMIT) {
        bypass = true;
        flush();
        return originalWrite.call(this, chunk, ...rest);
      }
      responseChunks.push(value);
      const callback = rest.find((item) => typeof item === 'function');
      if (callback) process.nextTick(callback);
      return true;
    };
    response.end = function (chunk, ...rest) {
      if (!candidate || bypass || consumed) {
        flush();
        return originalEnd.call(this, chunk, ...rest);
      }
      const value = bytes(chunk, rest[0]);
      responseSize += value.length;
      if (responseSize > LIMIT) {
        bypass = true;
        flush();
        return originalEnd.call(this, chunk, ...rest);
      }
      let shouldDrop = false;
      try {
        const current = fixtureNow();
        assert(sameFixture(current), 'The active fixture changed.');
        const contentType = this.getHeader('content-type');
        assert(
          typeof contentType === 'string' &&
            /^application\/(?:json|graphql-response\+json)(?:;|$)/i.test(
              contentType,
            ),
        );
        assert(this.statusCode >= 200 && this.statusCode < 300);
        const decoded = decode(
          Buffer.concat([...responseChunks, value]),
          this.getHeader('content-encoding'),
        );
        assert(decoded.length <= LIMIT);
        const payload = JSON.parse(decoded.toString('utf8'));
        assert(
          object(payload) &&
            (!payload.errors ||
              (Array.isArray(payload.errors) && payload.errors.length === 0)) &&
            object(payload.data),
        );
        const receipt = knowledgeMode
          ? payload.data.saveDeliveryKnowledgeSource
          : payload.data.createDeliveryClientSetup;
        assert(object(receipt));
        assert.equal(receipt.workspaceId, WORKSPACE_ID);
        assert.equal(receipt.memberId, fixture.actorId);
        assert.equal(receipt.userWorkspaceId, fixture.userWorkspaceId);
        if (knowledgeMode) {
          assert.equal(receipt.project?.id, fixture.projects[0]);
          assert.equal(receipt.source?.id, candidate.sourceId);
          assert.equal(receipt.source.revision, 1);
          assert.equal(receipt.source.currentVersion, 1);
          assert.equal(receipt.source.canEdit, true);
          assert.equal(receipt.source.publishedVersion, null);
        } else {
          assert.equal(receipt.requestId, candidate.requestId);
          assert.equal(receipt.companyId, fixture.companyId);
          assert.equal(receipt.replayed, false);
          for (const key of ['projectId', 'engagementId'])
            assert.match(receipt[key], UUID);
          assert(receipt.taskId === null || UUID.test(receipt.taskId));
        }
        const created = Date.parse(
          knowledgeMode ? receipt.observedAt : receipt.createdAt,
        );
        assert(
          Number.isFinite(created) &&
            created >= Date.parse(fixture.createdAt) &&
            created <= Date.now() + 5000,
        );
        assert(this.socket && !this.socket.destroyed);
        const proof = {
          version: 1,
          operation: OPERATION,
          path: '/metadata',
          phase: knowledgeMode
            ? 'DURABLE_STATE_BEFORE_SOCKET_DESTROY'
            : 'DURABLE_RECEIPT_BEFORE_SOCKET_DESTROY',
          nonce: fixture.nonce,
          workspaceId: WORKSPACE_ID,
          companyId: fixture.companyId,
          memberId: fixture.actorId,
          userWorkspaceId: fixture.userWorkspaceId,
          requestId: receipt.requestId,
          projectId: receipt.projectId,
          engagementId: receipt.engagementId,
          taskId: receipt.taskId,
          createdAt: knowledgeMode ? receipt.observedAt : receipt.createdAt,
          startedAt,
          observedAt: new Date().toISOString(),
          status: this.statusCode,
          responseBytes: responseSize,
        };
        if (knowledgeMode)
          Object.assign(proof, {
            sourceId: receipt.source.id,
            projectId: receipt.project.id,
            sourceRevision: receipt.source.revision,
            sourceVersion: receipt.source.currentVersion,
          });
        shouldDrop = durableProof(proof);
      } catch {
        // Any uncertainty preserves normal HTTP behavior instead of corrupting another response.
        shouldDrop = false;
      }
      if (shouldDrop) {
        responseChunks.length = 0;
        this.socket.destroy();
        return this;
      }
      flush();
      return originalEnd.call(this, chunk, ...rest);
    };
    return originalEmit.call(this, event, ...arguments_);
  };
  console.warn(
    `Local ${knowledgeMode ? 'knowledge' : 'client-setup'} lost-response fault ${consumed ? 'already consumed; inactive' : 'armed once'}; private proof: ${proofPath}`,
  );
}

module.exports = { matchesFixtureMutation };
