const assert = require('node:assert/strict');
const { Server } = require('node:http');
const {
  FILE,
  LIMIT,
  readPrivate,
  validateFixture,
  matchingCompanyInput,
  recordIntent,
} = require('./native-company-ui-proof.cjs');
const localHost = (value) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(value) ||
  value.endsWith('.localhost');
const localAddress = (value) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
function observeCompanyRequest(request, readCurrentFixture, fixture) {
  const chunks = [];
  let size = 0;
  // This listener precedes body-parser's end listener; fsync completes before it can dispatch the resolver.
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size <= LIMIT) chunks.push(Buffer.from(chunk));
    else chunks.length = 0;
  });
  request.once('end', () => {
    if (size > LIMIT) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return;
    }
    const current = readCurrentFixture();
    assert.equal(current.nonce, fixture.nonce);
    assert.equal(current.redis.url, fixture.redis.url);
    const input = matchingCompanyInput(payload, current);
    if (input) recordIntent(current, input);
  });
}
function installObserver() {
  assert.equal(
    process.env.OTOGROW_NATIVE_COMPANY_OBSERVER,
    'observe-precommit',
  );
  const server = new URL(process.env.SERVER_URL),
    database = new URL(process.env.PG_DATABASE_URL),
    queues = new URL(process.env.REDIS_QUEUE_URL);
  assert.equal(server.protocol, 'http:');
  assert(localHost(server.hostname) && localHost(database.hostname));
  assert.equal(queues.hostname, '127.0.0.1');
  const fixture = validateFixture(readPrivate(FILE));
  assert.equal(fixture.status, 'READY');
  assert.equal(queues.href, fixture.redis.url);
  assert.notEqual(process.env.REDIS_QUEUE_URL, process.env.REDIS_URL);
  const excluded = new Set(
    (process.env.WORKER_EXCLUDED_QUEUES ?? '').split(','),
  );
  const {
    MessageQueue,
  } = require('../dist/engine/core-modules/message-queue/message-queue.constants');
  assert(
    Object.values(MessageQueue).every((name) => excluded.has(name)),
    'Explicitly exclude every queue before the temporary API starts.',
  );
  const originalEmit = Server.prototype.emit;
  Server.prototype.emit = function (event, ...arguments_) {
    const [request] = arguments_;
    if (
      event !== 'request' ||
      request?.method !== 'POST' ||
      request.url?.split('?')[0] !== '/graphql' ||
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
    observeCompanyRequest(
      request,
      () => validateFixture(readPrivate(FILE)),
      fixture,
    );
    return originalEmit.call(this, event, ...arguments_);
  };
  console.warn(
    `Read-only native-company input observer enabled for isolated fixture ${fixture.nonce}; no credential or response is captured.`,
  );
}
if (process.env.OTOGROW_NATIVE_COMPANY_OBSERVER) installObserver();
module.exports = { installObserver, observeCompanyRequest };
