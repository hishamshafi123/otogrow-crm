const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { existsSync, lstatSync, unlinkSync } = require('node:fs');
const {
  WORKSPACE_ID,
  markerFor,
  titleFor,
  companyNameFor,
  matchingCompanyInput,
  proofPath,
  intentFor,
  recordIntent,
} = require('./native-company-ui-proof.cjs');
const {
  observeCompanyRequest,
} = require('./check-delivery-native-company-http-observer.cjs');
const query =
  'mutation CreateOneCompany($input: CompanyCreateInput!) { createCompany(data: $input) { id name } }';
const fixture = () => {
  const nonce = randomUUID();
  return {
    version: 1,
    nonce,
    workspaceId: WORKSPACE_ID,
    marker: markerFor(nonce),
    title: titleFor(nonce),
    status: 'READY',
    actorId: randomUUID(),
    actorUserId: randomUUID(),
    userWorkspaceId: randomUUID(),
    createdAt: new Date().toISOString(),
    baseline: {},
    seed: {},
    redis: { url: 'redis://127.0.0.1:45678/0' },
  };
};
const payloadFor = (owned) => ({
  query,
  operationName: 'CreateOneCompany',
  variables: { input: { id: randomUUID(), name: companyNameFor(owned) } },
});
function main() {
  assert(
    !process.env.OTOGROW_NATIVE_COMPANY_OBSERVER,
    'Run the pure observer proof without installing a real HTTP preload.',
  );
  const owned = fixture();
  try {
    const payload = payloadFor(owned);
    assert.deepEqual(
      matchingCompanyInput(payload, owned),
      payload.variables.input,
    );
    assert.equal(
      matchingCompanyInput(
        { ...payload, operationName: 'CreateManyCompanies' },
        owned,
      ),
      null,
    );
    assert.equal(
      matchingCompanyInput(
        {
          ...payload,
          query: query.replace(
            'createCompany(data:',
            'aliased:createCompany(data:',
          ),
        },
        owned,
      ),
      null,
    );
    assert.equal(
      matchingCompanyInput(
        {
          ...payload,
          query: query.replace('data: $input', 'data: {name:"inline"}'),
        },
        owned,
      ),
      null,
    );
    assert.equal(
      matchingCompanyInput(
        {
          ...payload,
          query: query.replace(
            '{ id name } }',
            '{ id name } other: createCompany(data:$input){id} }',
          ),
        },
        owned,
      ),
      null,
    );
    assert.equal(
      matchingCompanyInput(
        {
          ...payload,
          variables: {
            input: {
              ...payload.variables.input,
              createdBy: { source: 'MANUAL' },
            },
          },
        },
        owned,
      ),
      null,
    );
    assert.equal(
      matchingCompanyInput(
        {
          ...payload,
          variables: {
            input: {
              ...payload.variables.input,
              name: 'A real unrelated company',
            },
          },
        },
        owned,
      ),
      null,
    );
    const request = new EventEmitter();
    const body = Buffer.from(JSON.stringify(payload));
    observeCompanyRequest(request, () => owned, owned);
    let dispatched = false;
    request.once('end', () => {
      dispatched = true;
      const proof = intentFor(owned);
      assert.equal(proof.trust, 'UNTRUSTED_PRECOMMIT_INPUT');
      assert.deepEqual(proof.input, payload.variables.input);
      assert.equal(lstatSync(proofPath(owned)).mode & 0o077, 0);
      assert(!JSON.stringify(proof).includes('authorization'));
      assert(!JSON.stringify(proof).includes('Bearer'));
    });
    request.emit('data', body.subarray(0, 30));
    request.emit('data', body.subarray(30));
    request.emit('end');
    assert.equal(dispatched, true);
    const original = intentFor(owned);
    assert.deepEqual(
      recordIntent(owned, payload.variables.input),
      original,
      'Exact repeat must not replace the first precommit observation.',
    );
    assert.throws(
      () =>
        recordIntent(owned, { ...payload.variables.input, id: randomUUID() }),
      /original exact company identity/,
    );
    assert.deepEqual(intentFor(owned), original);
    const another = fixture();
    try {
      const invalid = new EventEmitter();
      observeCompanyRequest(invalid, () => another, another);
      invalid.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            ...payloadFor(another),
            operationName: 'Unrelated',
          }),
        ),
      );
      invalid.emit('end');
      assert.equal(existsSync(proofPath(another)), false);
      const oversized = new EventEmitter();
      observeCompanyRequest(oversized, () => another, another);
      oversized.emit('data', Buffer.alloc(16385, 'x'));
      oversized.emit('end');
      assert.equal(existsSync(proofPath(another)), false);
      const changed = new EventEmitter();
      observeCompanyRequest(
        changed,
        () => ({ ...another, nonce: randomUUID() }),
        another,
      );
      changed.emit('data', Buffer.from(JSON.stringify(payloadFor(another))));
      let reachedResolver = false;
      changed.once('end', () => {
        reachedResolver = true;
      });
      assert.throws(() => changed.emit('end'));
      assert.equal(
        reachedResolver,
        false,
        'A proof invariant failure must stop later body dispatch.',
      );
      assert.equal(existsSync(proofPath(another)), false);
    } finally {
      if (existsSync(proofPath(another))) unlinkSync(proofPath(another));
    }
    console.log(
      'Native input observer pure proof passed: exact bounded AST/input, private immutable untrusted identity journal before later body dispatch, exact retry, no credential/response mutation, unrelated/oversized requests and changed-fixture failure. No HTTP, Docker, database or provider calls.',
    );
  } finally {
    if (existsSync(proofPath(owned))) unlinkSync(proofPath(owned));
  }
}
if (require.main === module) main();
module.exports = { main };
