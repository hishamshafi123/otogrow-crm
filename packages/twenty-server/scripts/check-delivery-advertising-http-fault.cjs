const assert = require('node:assert/strict');
const {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  existsSync,
} = require('node:fs');
const { dirname } = require('node:path');
const { Server } = require('node:http');
const { gunzipSync, inflateSync, brotliDecompressSync } = require('node:zlib');
const {
  matchesFixtureMutation,
} = require('./check-delivery-client-setup-http-fault.cjs');

if (process.env.OTOGROW_ADVERTISING_HTTP_FAULT) {
  assert.equal(
    process.env.OTOGROW_ADVERTISING_HTTP_FAULT,
    'drop-once-after-commit',
  );
  assert(
    !process.env.OTOGROW_KNOWLEDGE_HTTP_FAULT &&
      !process.env.OTOGROW_CLIENT_SETUP_HTTP_FAULT,
  );
  const {
    advertisingHash,
  } = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
  const {
    saveAdvertisingReviewSchema,
    assignAdvertisingReviewSchema,
    observeAdvertisingActionSchema,
  } = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.types');
  const LIMIT = 1024 * 1024;
  const JOURNAL = '/tmp/otogrow-advertising-ui-fixture.json';
  const operation = process.env.OTOGROW_ADVERTISING_HTTP_FAULT_OPERATION;
  assert(['SAVE', 'ASSIGN', 'OBSERVE'].includes(operation));
  const identifier =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const localHost = (hostname) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
    hostname.endsWith('.localhost');
  for (const name of ['PG_DATABASE_URL', 'SERVER_URL'])
    assert(
      localHost(new URL(process.env[name]).hostname),
      `${name} must be local.`,
    );
  assert.equal(new URL(process.env.SERVER_URL).protocol, 'http:');
  const read = (path, limit) => {
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const metadata = fstatSync(descriptor);
      assert(
        metadata.isFile() &&
          (metadata.mode & 0o077) === 0 &&
          metadata.size <= limit,
      );
      return JSON.parse(readFileSync(descriptor, 'utf8'));
    } finally {
      closeSync(descriptor);
    }
  };
  const fixture = read(JOURNAL, 16 * LIMIT);
  assert.equal(fixture.version, 1);
  assert.equal(fixture.status, 'READY');
  assert.equal(fixture.workspaceId, '0a420537-0122-45c3-a2f5-18298b636227');
  assert.equal(fixture.marker, `advertising-ui:${fixture.nonce}`);
  assert(
    Date.now() >= Date.parse(fixture.createdAt) &&
      Date.now() - Date.parse(fixture.createdAt) < 6 * 60 * 60 * 1000,
  );
  for (const field of ['nonce', 'actorId', 'userWorkspaceId', 'projectId'])
    assert.match(fixture[field], identifier);
  const kinds = {
    SAVE: {
      operation: 'SaveDeliveryAdvertisingReview',
      field: 'saveDeliveryAdvertisingReview',
      action: 'SAVED',
      schema: saveAdvertisingReviewSchema,
    },
    ASSIGN: {
      operation: 'AssignDeliveryAdvertisingReview',
      field: 'assignDeliveryAdvertisingReview',
      action: 'ASSIGNED',
      schema: assignAdvertisingReviewSchema,
    },
    OBSERVE: {
      operation: 'ObserveDeliveryAdvertisingAction',
      field: 'observeDeliveryAdvertisingAction',
      action: 'OBSERVED',
      schema: observeAdvertisingActionSchema,
    },
  };
  const target = kinds[operation];
  assert(target);
  const previousProof = new RegExp(
    `^otogrow-advertising-http-fault-${fixture.nonce}-[a-f0-9-]{36}\\.json$`,
  );
  assert(
    !readdirSync('/tmp').some((name) => previousProof.test(name)),
    'A prior request-specific fault proof exists; do not arm another drop for this fixture.',
  );
  const proofPath = `/tmp/otogrow-advertising-http-fault-${fixture.nonce}-${operation}.json`;
  let consumed = existsSync(proofPath);
  if (consumed) {
    const proof = read(proofPath, LIMIT);
    assert.equal(proof.nonce, fixture.nonce);
    assert.equal(proof.operation, target.operation);
    const plan = fixture.plans.find(
      (item) =>
        item.operation === operation &&
        item.input.requestId === proof.requestId,
    );
    assert(plan);
    assert.equal(proof.inputHash, plan.hash);
    assert.equal(plan.hash, advertisingHash(target.schema.parse(plan.input)));
    assert.equal(proof.phase, 'DURABLE_RECEIPT_BEFORE_SOCKET_DESTROY');
  }
  const originalEmit = Server.prototype.emit;
  const bytes = (chunk, encoding) =>
    typeof chunk === 'string'
      ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
      : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
        ? Buffer.from(chunk)
        : Buffer.alloc(0);
  const localAddress = (address) =>
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  Server.prototype.emit = function (event, ...arguments_) {
    const [request, response] = arguments_;
    if (
      event !== 'request' ||
      consumed ||
      request.method !== 'POST' ||
      request.url?.split('?')[0] !== '/metadata' ||
      !localAddress(request.socket.remoteAddress) ||
      !localAddress(request.socket.localAddress)
    )
      return originalEmit.call(this, event, ...arguments_);
    let local = false;
    try {
      local = localHost(new URL(`http://${request.headers.host}`).hostname);
    } catch {}
    if (!local) return originalEmit.call(this, event, ...arguments_);
    const chunks = [],
      responseChunks = [];
    const receivedAt = Date.now();
    let requestId = null,
      plan = null;
    let requestSize = 0,
      responseSize = 0,
      candidate = false,
      passthrough = false;
    const originalWrite = response.write;
    const originalEnd = response.end;
    const flush = () => {
      for (const chunk of responseChunks) originalWrite.call(response, chunk);
      responseChunks.length = 0;
    };
    response.write = function (chunk, ...rest) {
      if (!candidate || consumed || passthrough) {
        if (responseChunks.length) flush();
        passthrough = true;
        return originalWrite.call(this, chunk, ...rest);
      }
      const value = bytes(chunk, rest[0]);
      responseSize += value.length;
      if (responseSize > LIMIT) {
        flush();
        passthrough = true;
        return originalWrite.call(this, chunk, ...rest);
      }
      responseChunks.push(value);
      const callback = rest.find((item) => typeof item === 'function');
      if (callback) queueMicrotask(callback);
      return true;
    };
    response.end = function (chunk, ...rest) {
      if (!candidate || consumed || passthrough) {
        flush();
        return originalEnd.call(this, chunk, ...rest);
      }
      const value = bytes(chunk, rest[0]);
      responseSize += value.length;
      try {
        assert(responseSize <= LIMIT && response.statusCode === 200);
        assert(
          /^application\/(?:json|graphql-response\+json)(?:;|$)/i.test(
            String(response.getHeader('content-type')),
          ),
        );
        const current = read(JOURNAL, 16 * LIMIT);
        assert.equal(current.status, 'READY');
        assert.equal(current.nonce, fixture.nonce);
        assert.equal(current.actorId, fixture.actorId);
        assert.equal(current.userWorkspaceId, fixture.userWorkspaceId);
        assert.equal(
          current.plans.find((item) => item.input.requestId === requestId)
            ?.hash,
          plan.hash,
        );
        let body = Buffer.concat([...responseChunks, value]);
        const encoding = String(
          response.getHeader('content-encoding') ?? '',
        ).toLowerCase();
        if (encoding === 'gzip')
          body = gunzipSync(body, { maxOutputLength: LIMIT });
        else if (encoding === 'deflate')
          body = inflateSync(body, { maxOutputLength: LIMIT });
        else if (encoding === 'br')
          body = brotliDecompressSync(body, { maxOutputLength: LIMIT });
        else assert(!encoding || encoding === 'identity');
        const parsed = JSON.parse(body.toString('utf8'));
        assert(!parsed.errors?.length);
        const result = parsed.data?.[target.field];
        assert.equal(result?.workspaceId, fixture.workspaceId);
        assert.equal(result?.memberId, fixture.actorId);
        assert.equal(result?.userWorkspaceId, fixture.userWorkspaceId);
        const receipt = result.receipt;
        assert.equal(receipt.requestId, requestId);
        assert.equal(receipt.actorId, fixture.actorId);
        assert.equal(receipt.action, target.action);
        assert.equal(
          receipt.reviewId,
          plan.operation === 'OBSERVE' ? plan.input.reviewId : plan.input.id,
        );
        assert(
          Array.isArray(receipt.actionTasks) &&
            receipt.actionTasks.length <= 20,
        );
        assert(Number.isSafeInteger(receipt.revision) && receipt.revision > 0);
        const createdAt = Date.parse(receipt.createdAt);
        assert(
          Number.isFinite(createdAt) &&
            createdAt >= Date.parse(fixture.createdAt) &&
            createdAt <= Date.now() + 1000,
        );
        assert.equal(
          receipt.state,
          plan.operation === 'SAVE' ? 'DRAFT' : 'ASSIGNED',
        );
        assert.equal(
          receipt.observationId,
          plan.operation === 'OBSERVE' ? plan.input.id : null,
        );
        if (plan.operation !== 'OBSERVE')
          assert.equal(receipt.revision, plan.input.revision + 1);
        for (const link of receipt.actionTasks) {
          assert.match(link.actionId, identifier);
          assert.match(link.taskId, identifier);
        }
        assert.equal(
          new Set(receipt.actionTasks.map((link) => link.actionId)).size,
          receipt.actionTasks.length,
        );
        assert.equal(
          new Set(receipt.actionTasks.map((link) => link.taskId)).size,
          receipt.actionTasks.length,
        );
        if (plan.operation === 'SAVE')
          assert.equal(receipt.actionTasks.length, 0);
        if (plan.operation === 'ASSIGN') {
          const saved = current.plans.find(
            (item) =>
              item.operation === 'SAVE' &&
              item.input.id === plan.input.id &&
              item.input.revision + 1 === plan.input.revision,
          );
          assert(saved);
          assert.deepEqual(
            receipt.actionTasks.map((link) => link.actionId).sort(),
            saved.input.actions.map((action) => action.id).sort(),
          );
        }
        const proof = {
          phase: 'DURABLE_RECEIPT_BEFORE_SOCKET_DESTROY',
          nonce: fixture.nonce,
          requestId,
          inputHash: plan.hash,
          operation: target.operation,
          receipt,
          responseBytes: responseSize,
          capturedAt: new Date().toISOString(),
        };
        const descriptor = openSync(
          proofPath,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          writeFileSync(descriptor, JSON.stringify(proof));
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
        responseChunks.length = 0;
        request.socket.destroy();
        return this;
      } catch {
        flush();
        return originalEnd.call(this, chunk, ...rest);
      }
    };
    const result = originalEmit.call(this, event, ...arguments_);
    request.on('data', (chunk) => {
      requestSize += chunk.length;
      if (requestSize <= LIMIT) chunks.push(Buffer.from(chunk));
      else chunks.length = 0;
    });
    request.once('end', () => {
      try {
        assert(requestSize <= LIMIT);
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const current = read(JOURNAL, 16 * LIMIT);
        assert.equal(current.status, 'READY');
        assert.equal(current.nonce, fixture.nonce);
        assert.equal(current.actorId, fixture.actorId);
        assert.equal(current.userWorkspaceId, fixture.userWorkspaceId);
        plan = current.plans.find(
          (item) =>
            item.operation === operation &&
            item.input.requestId === parsed.variables?.input?.requestId,
        );
        assert(plan, 'The exact command must be journalled before it is sent.');
        assert(
          Date.parse(plan.plannedAt) >= Date.parse(fixture.createdAt) &&
            Date.parse(plan.plannedAt) <= receivedAt,
        );
        assert.equal(
          plan.hash,
          advertisingHash(target.schema.parse(plan.input)),
        );
        requestId = plan.input.requestId;
        candidate =
          parsed.operationName === target.operation &&
          matchesFixtureMutation(
            parsed.query,
            target.operation,
            target.field,
          ) &&
          advertisingHash(target.schema.parse(parsed.variables?.input)) ===
            plan.hash;
      } catch {
        candidate = false;
      } finally {
        chunks.length = 0;
      }
    });
    return result;
  };
  console.log(
    `Local advertising lost-response fault ${consumed ? 'already consumed; inactive' : 'armed once'}; private proof: ${proofPath}`,
  );
}
