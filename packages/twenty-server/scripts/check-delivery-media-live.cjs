const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const axios = require('axios');
const { DeliveryGoogleMediaAdapter } = require('../dist/modules/delivery/creative/delivery-google-media.adapter');

(async () => {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const key = (await input.question('Test credential (terminal echo disabled): ')).trim();
  assert(key && !key.includes(' '));
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const options = { headers: { 'x-goog-api-key': key }, timeout: 30000, maxRedirects: 0, proxy: false };
  const catalog = await axios.get(`${base}/models`, options);
  const models = catalog.data.models.filter((model) => /nano-banana|flash-image|omni/.test(model.name));
  console.log(JSON.stringify(models.map(({name, outputTokenLimit, supportedGenerationMethods}) => ({name, outputTokenLimit, supportedGenerationMethods})), null, 2));
  const command = await input.question('Type run to execute the bounded test, otherwise exit: ');
  input.close();
  if (command.trim() !== 'run') return;
  const directory = path.resolve('artifacts/phase3-media-acceptance');
  fs.mkdirSync(directory, { recursive: true });
  const ledgerPath = path.join(directory, 'usage.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assert.equal(ledger.budgetUsd, 2);
  const retryVideo = process.argv.includes('--retry-video');
  assert.equal(ledger.requests.length, retryVideo ? 3 : 1, 'Unexpected ledger state: inspect before retrying');
  assert.equal(ledger.requests[0].httpStatus, 429);
  assert.equal(ledger.requests[0].status, 'failed');
  if (retryVideo) {
    const imageUsage = ledger.requests[1].usage;
    const videoUsage = ledger.requests[2].usage;
    assert.equal(ledger.requests[1].status, 'succeeded');
    assert.equal(ledger.requests[2].status, 'failed');
    assert.equal(imageUsage.candidatesTokensDetails[0].tokenCount, 1120);
    assert.equal(videoUsage.total_output_tokens, 17376);
    ledger.requests[1].estimatedCostUsd = imageUsage.promptTokenCount * 0.5 / 1e6 + 1120 * 60 / 1e6 + (imageUsage.candidatesTokenCount - 1120) * 3 / 1e6;
    ledger.requests[2].estimatedCostUsd = videoUsage.total_input_tokens * 1.5 / 1e6 + videoUsage.total_output_tokens * 17.5 / 1e6 + videoUsage.total_thought_tokens * 9 / 1e6;
    ledger.requests[2].failureReason = 'Completed paid response rejected locally because store=false omitted the optional interaction ID. Count this usage.';
  }
  ledger.resumedAt = new Date().toISOString();
  ledger.resumeReason = 'User updated billing tier. Retain prior reservation conservatively; total reservations remain <= USD 2.';
  const save = () => fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  save();
  let active;
  axios.interceptors.response.use((response) => {
    if (active) {
      fs.writeFileSync(path.join(directory, `${active.kind.toLowerCase()}-response.json`), JSON.stringify(response.data));
      active.usage = response.data.usageMetadata ?? response.data.usage ?? null;
      active.responseId = response.data.responseId ?? response.data.id ?? null;
      save();
    }
    return response;
  });
  axios.interceptors.request.use((config) => {
    if (config.url === `${base}/interactions`) {
      config.data.generation_config.max_output_tokens = 45000;
    }
    return config;
  });
  const adapter = new DeliveryGoogleMediaAdapter();
  async function generate(request, reserveUsd, filename) {
    assert(ledger.requests.reduce((sum, entry) => sum + (entry.estimatedCostUsd ?? entry.reserveUsd), 0) + reserveUsd <= 2);
    active = { kind: request.kind, model: request.model, reserveUsd, status: 'requested' };
    ledger.requests.push(active);
    save();
    try {
      const result = await adapter.generate({ ...request, apiKey: key });
      const output = path.join(directory, `${filename}.${result.extension}`);
      fs.writeFileSync(output, result.bytes);
      Object.assign(active, { status: 'succeeded', file: output, bytes: result.bytes.length, mimeType: result.mimeType, providerJobId: result.providerJobId });
      save();
      console.log(JSON.stringify(active));
      return result;
    } catch (error) {
      Object.assign(active, { status: 'failed', httpStatus: error.response?.status ?? null, providerStatus: error.response?.data?.error?.status ?? null, message: String(error.response?.data?.error?.message ?? error.message).split(key).join('[redacted]').slice(0, 500) });
      save();
      console.log(JSON.stringify(active));
      return null;
    }
  }
  const imageModel = 'gemini-3.1-flash-image';
  assert(models.some((model) => model.name === `models/${imageModel}`));
  const image = retryVideo ? { mimeType: 'image/jpeg', bytes: fs.readFileSync(path.join(directory, 'shirt.jpg')) } : await generate({ model: imageModel, kind: 'IMAGE', references: [], prompt: 'Generate one photorealistic studio product photograph: a plain cobalt blue cotton crew-neck T-shirt hanging on a wooden hanger against a warm light gray background. One shirt, two sleeves, realistic seams and fabric texture. No people, no brand, no lettering. Soft side lighting, centered composition.' }, 0.55, 'shirt');
  if (!image) return;
  // Inspect the generated image before authorizing the video request in this same process.
  const review = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const decision = await review.question('Type video after reviewing the generated image, otherwise exit: ');
  review.close();
  if (decision.trim() !== 'video') return;
  await generate({ model: 'gemini-omni-1.1-flash', kind: 'CLIP', references: [{ mimeType: image.mimeType, data: image.bytes.toString('base64') }], prompt: 'Animate this product photograph as one continuous 3-second studio shot. Very gentle camera push-in only. Preserve the single blue shirt, both sleeves, wooden hanger, seams, neckline, color and background exactly. No cuts, no text, no people, no dialogue.' }, 0.90, 'shirt-motion');
})().catch((error) => {
  console.error(JSON.stringify({ status: 'stopped', httpStatus: error.response?.status ?? null, code: error.response?.data?.error?.status ?? error.code ?? null }));
  process.exitCode = 1;
});
