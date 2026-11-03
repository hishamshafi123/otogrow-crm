import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import {
  creativeLearningCanonicalInput,
  creativeLearningCommandHash,
  normalizeCreativeLearningCommand,
  learningBodyInput,
} from '@/delivery/creative/learning/creative-learning-command';
import { type CreativeLearningCommand } from '@/delivery/creative/learning/creative-learning.types';
import {
  creativeLearningBodyFixture,
  LEARNING_LINK_ID,
} from '@/delivery/creative/learning/__tests__/creative-learning.fixtures';
beforeEach(() => {
  Object.assign(globalThis, { TextEncoder });
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
});
it('matches the server canonical UTF-8 hash over the trimmed decision input, including exact UUID and version', async () => {
  const command: CreativeLearningCommand = {
    kind: 'DECIDE',
    input: {
      id: 'association',
      requestId: 'request',
      revision: 3,
      action: 'REQUEST_CHANGES',
      previewFingerprint: 'd'.repeat(64),
      note: '  请确认 this exact ad\n  ',
    },
  };
  const expected =
    '{"action":"REQUEST_CHANGES","id":"association","note":"请确认 this exact ad","previewFingerprint":"' +
    'd'.repeat(64) +
    '","requestId":"request","revision":3}';
  expect(creativeLearningCanonicalInput(command)).toBe(expected);
  expect(await creativeLearningCommandHash(command)).toBe(
    createHash('sha256').update(expected).digest('hex'),
  );
});
it('normalizes only schema trims/defaults while preserving exact declared copy, source URL and meaningful unknown/zero values', async () => {
  const body = creativeLearningBodyFixture();
  const input = learningBodyInput(body);
  input.associationEvidence = '  Matching source evidence  ';
  input.note = '  Specific manual note  ';
  input.goal.evidence = '  Exact outcome evidence  ';
  input.declaredCopy = '  Rendered copy with spaces\n';
  const command: CreativeLearningCommand = {
    kind: 'SAVE',
    input: {
      ...input,
      id: LEARNING_LINK_ID,
      requestId: LEARNING_LINK_ID,
      revision: 0,
      previewFingerprint: body.previewFingerprint,
    },
  };
  const normalized = normalizeCreativeLearningCommand(command);
  expect(normalized.kind).toBe('SAVE');
  if (normalized.kind !== 'SAVE') throw new Error('Save command not retained.');
  expect(normalized.input.associationEvidence).toBe('Matching source evidence');
  expect(normalized.input.note).toBe('Specific manual note');
  expect(normalized.input.goal.evidence).toBe('Exact outcome evidence');
  expect(normalized.input.goal.value).toBe('0');
  expect(normalized.input.declaredCopy).toBe('  Rendered copy with spaces\n');
  expect(normalized.input.evidenceUrl).toBe(input.evidenceUrl);
  const changed: CreativeLearningCommand = {
    kind: 'SAVE',
    input: {
      ...normalized.input,
      goal: { ...normalized.input.goal, value: null },
    },
  };
  expect(await creativeLearningCommandHash(changed)).not.toBe(
    await creativeLearningCommandHash(command),
  );
});
