const assert = require('node:assert/strict');
const { lstatSync, readFileSync } = require('node:fs');
const { AiModelRegistryService } = require('../dist/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service');

const path = '/tmp/otogrow-activity-analysis-ui-fixture.json';
const metadata = lstatSync(path);
assert(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0);
const fixture = JSON.parse(readFileSync(path, 'utf8'));
assert.equal(fixture.status, 'READY');
assert.equal(fixture.includeCurrentWork, true);
assert.equal(fixture.workspaceId, '0a420537-0122-45c3-a2f5-18298b636227');
assert.match(fixture.nonce, /^[a-f0-9-]{36}$/);
const modelId = `__fixture_unregistered__/activity-${fixture.nonce}`;
const registry = AiModelRegistryService.prototype;
const getModel = registry.getModel;
const validate = registry.validateModelAvailability;
const model = Object.freeze({ specificationVersion: 'v3', provider: 'FIXTURE_READONLY', modelId,
  supportedUrls: {},
  doGenerate: async () => { throw new Error('No model dispatch is permitted in this readonly UI fixture.'); },
  doStream: async () => { throw new Error('No model dispatch is permitted in this readonly UI fixture.'); },
});
registry.getModel = function (id, ...arguments_) {
  return id === modelId ? { model, modelId } : getModel.call(this, id, ...arguments_);
};
registry.validateModelAvailability = function (id, workspace, ...arguments_) {
  if (id === modelId && workspace.id === fixture.workspaceId) return;
  return validate.call(this, id, workspace, ...arguments_);
};
