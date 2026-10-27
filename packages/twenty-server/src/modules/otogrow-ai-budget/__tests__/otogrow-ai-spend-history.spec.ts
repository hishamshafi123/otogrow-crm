import { v4 } from 'uuid';
import {
  parseOtogrowAiSpendHistoryInput,
  projectOtogrowAiFinancialState,
} from 'src/modules/otogrow-ai-budget/read-otogrow-ai-spend-history';

describe('individual AI charge history boundaries', () => {
  it('projects only supported exact financial fields, excluding arbitrary stored content', () => {
    expect(
      projectOtogrowAiFinancialState({
        state: 'SETTLED',
        revision: 4,
        reservedMicroUsd: '1000000',
        actualMicroUsd: '9007199254740993',
        reportedActualMicroUsd: '9007199254740994',
        prompt: 'private input',
        accessToken: 'private credential',
        usage: { input: 'private payload' },
      }),
    ).toEqual({
      state: 'SETTLED',
      revision: 4,
      reservedUsd: '1.000000',
      actualUsd: '9007199254.740993',
      reportedActualUsd: '9007199254.740994',
    });
    expect(
      projectOtogrowAiFinancialState({
        state: 'private error',
        revision: 1.5,
        actualMicroUsd: '1e6',
        reservedMicroUsd: -2,
      }),
    ).toEqual({
      state: null,
      revision: null,
      actualUsd: null,
      reservedUsd: null,
      reportedActualUsd: null,
    });
  });
  it('retains microsecond cursors and binds them to the workspace and individual charge', () => {
    const workspaceId = v4(),
      spendId = v4();
    const cursor = {
      workspaceId,
      spendId,
      at: '2030-01-01T00:00:00.123456Z',
      id: v4(),
    };
    const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64url');
    expect(
      parseOtogrowAiSpendHistoryInput(
        { spendId, cursor: encoded, limit: 7 },
        workspaceId,
      ),
    ).toEqual({ spendId, cursor, limit: 7 });
    expect(() =>
      parseOtogrowAiSpendHistoryInput(
        { spendId: v4(), cursor: encoded },
        workspaceId,
      ),
    ).toThrow();
    expect(() =>
      parseOtogrowAiSpendHistoryInput({ spendId, cursor: encoded }, v4()),
    ).toThrow();
  });
  it('rejects oversized, invalid or unsupported page inputs and normalizes GraphQL nulls', () => {
    const workspaceId = v4(),
      spendId = v4();
    for (const input of [
      { spendId, limit: 101 },
      { spendId, limit: 0 },
      { spendId: 'invalid' },
      { spendId, cursor: 'not-a-cursor' },
      { spendId, cursor: 'a'.repeat(1001) },
    ])
      expect(() =>
        parseOtogrowAiSpendHistoryInput(input, workspaceId),
      ).toThrow();
    expect(parseOtogrowAiSpendHistoryInput({ spendId }, workspaceId)).toEqual({
      spendId,
      limit: 20,
      cursor: null,
    });
    expect(
      parseOtogrowAiSpendHistoryInput(
        JSON.parse(JSON.stringify({ spendId, cursor: null, limit: null })),
        workspaceId,
      ),
    ).toEqual({ spendId, limit: 20, cursor: null });
  });
});
