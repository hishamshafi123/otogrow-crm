const assert = require('node:assert/strict');
const {
  closeSync,
  constants,
  fstatSync,
  openSync,
  writeSync,
} = require('node:fs');
const { Server } = require('node:http');
const { isAbsolute } = require('node:path');

const destination = process.env.OTOGROW_TASK_READ_HTTP_LOG;

if (destination) {
  assert(isAbsolute(destination), 'Choose an absolute private audit path.');
  const descriptor = openSync(
    destination,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_APPEND |
      constants.O_NOFOLLOW,
    0o600,
  );
  const metadata = fstatSync(descriptor);
  assert(metadata.isFile() && (metadata.mode & 0o077) === 0);
  const originalEmit = Server.prototype.emit;
  const MAX_REQUEST_BYTES = 1024 * 1024;

  Server.prototype.emit = function (event, ...arguments_) {
    const [request, response] = arguments_;
    const path = request?.url?.split('?')[0];
    if (
      event !== 'request' ||
      request.method !== 'POST' ||
      !['/metadata', '/graphql'].includes(path)
    )
      return originalEmit.call(this, event, ...arguments_);

    const startedAt = new Date();
    const chunks = [];
    let requestBytes = 0;
    let responseBytes = 0;
    let operation = null;
    const originalWrite = response.write;
    const originalEnd = response.end;
    const byteLength = (value, encoding) =>
      typeof value === 'string'
        ? Buffer.byteLength(
            value,
            typeof encoding === 'string' ? encoding : 'utf8',
          )
        : Buffer.isBuffer(value) || value instanceof Uint8Array
          ? value.byteLength
          : 0;

    response.write = function (chunk, ...rest) {
      responseBytes += byteLength(chunk, rest[0]);
      return originalWrite.call(this, chunk, ...rest);
    };
    response.end = function (chunk, ...rest) {
      responseBytes += byteLength(chunk, rest[0]);
      return originalEnd.call(this, chunk, ...rest);
    };
    response.once('finish', () => {
      if (!operation) return;
      writeSync(
        descriptor,
        `${JSON.stringify({
          startedAt: startedAt.toISOString(),
          operation,
          path,
          status: response.statusCode,
          responseBytes,
          durationMilliseconds: Date.now() - startedAt.getTime(),
        })}\n`,
      );
    });

    // Observe after normal listeners are installed; never persist request bodies or headers.
    const result = originalEmit.call(this, event, ...arguments_);
    request.on('data', (chunk) => {
      requestBytes += byteLength(chunk);
      if (requestBytes <= MAX_REQUEST_BYTES) chunks.push(Buffer.from(chunk));
      else chunks.length = 0;
    });
    request.once('end', () => {
      try {
        if (requestBytes > MAX_REQUEST_BYTES) return;
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const candidate =
          parsed.operationName ??
          (typeof parsed.query === 'string'
            ? parsed.query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1]
            : null);
        if (
          typeof candidate === 'string' &&
          /^(?:Delivery|ChangeDelivery|SaveDelivery|PublishDelivery|AssignDelivery|ObserveDelivery|StartDelivery|CancelDelivery|SeeDelivery|AcknowledgeDelivery|OtogrowAccess|OtogrowActivity|StartOtogrowActivity|CancelOtogrowActivity)[A-Za-z0-9_]{0,120}$/.test(
            candidate,
          )
        )
          operation = candidate;
      } catch {
        operation = null;
      } finally {
        chunks.length = 0;
      }
    });
    return result;
  };

  process.once('exit', () => closeSync(descriptor));
}
