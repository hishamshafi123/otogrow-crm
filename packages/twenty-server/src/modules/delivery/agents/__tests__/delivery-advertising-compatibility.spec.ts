import { BadRequestException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { deliveryAgentConfigurationSchema } from 'src/modules/delivery/agents/delivery-agent.types';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { countDeliveryAgentRunsForUtcDay } from 'src/modules/delivery/agents/count-delivery-agent-runs-for-utc-day';

const WORKSPACE = '60000000-0000-4000-8000-000000000001';
const PROJECT = '60000000-0000-4000-8000-000000000002';
const MEMBER = '60000000-0000-4000-8000-000000000003';
const MEMBERSHIP = '60000000-0000-4000-8000-000000000004';
const TASK = '60000000-0000-4000-8000-000000000005';
const AGENT = '60000000-0000-4000-8000-000000000006';
const REQUEST = '60000000-0000-4000-8000-000000000007';
const configuration = () => ({
  name: 'Advertising recommendations',
  purpose: 'Review report evidence',
  kind: 'ADVERTISING',
  enabled: true,
  instructions: 'Keep missing values unknown. Never change an account.',
  requiredInputs: ['report'],
  outputFormat: 'recommendations',
  tools: [],
  modelId: 'model',
  projectIds: [PROJECT],
  roles: ['ADMIN'],
  roleIds: null,
  dailyRunLimit: 3,
  maxOutputTokens: 1024,
  humanConfirmation: true,
});

it('accepts bounded report recommendations while preserving existing task configuration semantics', () => {
  expect(
    deliveryAgentConfigurationSchema.safeParse(configuration()).success,
  ).toBe(true);
  expect(
    deliveryAgentConfigurationSchema.safeParse({
      ...configuration(),
      requiredInputs: ['report', 'requirements'],
    }).success,
  ).toBe(true);
  for (const invalid of [
    { requiredInputs: [] },
    { requiredInputs: ['brief', 'report'] },
    { requiredInputs: ['report', 'report'] },
    { outputFormat: 'findings_and_edits' },
    { tools: ['public_page_check'] },
    { maxOutputTokens: 4097 },
  ])
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration(),
        ...invalid,
      }).success,
    ).toBe(false);
  for (const kind of ['BRIEF', 'COPY', 'SEO']) {
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration(),
        kind,
        requiredInputs: kind === 'SEO' ? [] : ['brief'],
        outputFormat: 'findings',
        tools: kind === 'SEO' ? ['public_page_check'] : [],
        modelId: kind === 'SEO' ? null : 'model',
      }).success,
    ).toBe(true);
    expect(
      deliveryAgentConfigurationSchema.safeParse({ ...configuration(), kind })
        .success,
    ).toBe(false);
  }
});

it.each([
  ['ADVERTISING', 'preview'],
  ['ADVERTISING', 'start'],
  ['ACTIVITY', 'preview'],
  ['ACTIVITY', 'start'],
])(
  'rejects %s assistants through task %s before context, model, budget or queue work',
  async (kind, type) => {
    const models = {
      getModel: jest.fn(),
      validateModelAvailability: jest.fn(),
    };
    const budget = { quote: jest.fn(), reserve: jest.fn() };
    const queue = { add: jest.fn() };
    const save = jest.fn();
    const repositories = new Map<unknown, object>([
      [
        DeliveryAgentEntity,
        {
          findOneBy: jest.fn().mockResolvedValue({
            id: AGENT,
            version: 1,
            configuration: deliveryAgentConfigurationSchema.parse(
              kind === 'ACTIVITY'
                ? {
                    ...configuration(),
                    kind,
                    projectIds: [],
                    requiredInputs: ['activity', 'question'],
                    outputFormat: 'analysis',
                  }
                : configuration(),
            ),
          }),
        },
      ],
      [DeliveryAgentRunEntity, { save }],
      [
        DeliveryTaskEntity,
        {
          findOneBy: jest.fn().mockResolvedValue({
            taskId: TASK,
            projectId: PROJECT,
            revision: 1,
          }),
        },
      ],
      [
        DeliveryProjectEntity,
        {
          findOneBy: jest
            .fn()
            .mockResolvedValue({ id: PROJECT, memberIds: [MEMBER] }),
        },
      ],
    ]);
    const manager = {
      queryRunner: { isTransactionActive: true },
      query: jest.fn().mockResolvedValue([{ id: MEMBER }]),
      getRepository: (entity: unknown) => {
        const repository = repositories.get(entity);
        if (!repository) throw new Error('Unexpected repository');
        return repository;
      },
    } as unknown as EntityManager;
    const source = {
      transaction: async <TResult>(
        operation: (transactionManager: EntityManager) => Promise<TResult>,
      ) => operation(manager),
    } as DataSource;
    const delivery = {
      schema: () => '"test_advertising"',
      actor: jest.fn().mockResolvedValue({
        memberId: MEMBER,
        isAdmin: true,
        isManager: true,
        roleIds: [],
        capabilities: ['workspace.admin'],
      }),
    } as unknown as DeliveryService;
    const service = new DeliveryAgentService(
      source,
      delivery,
      models as unknown as AiModelRegistryService,
      queue as unknown as MessageQueueService,
      budget as unknown as OtogrowAiBudgetService,
      {} as OtogrowAccessService,
    );
    const input = {
      type,
      taskId: TASK,
      agentId: AGENT,
      inputs: {},
      ...(type === 'start'
        ? { requestId: REQUEST, taskRevision: 1, agentVersion: 1 }
        : {}),
    };
    await expect(
      service.command(
        { id: WORKSPACE } as WorkspaceEntity,
        MEMBER,
        MEMBERSHIP,
        input,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(models.getModel).not.toHaveBeenCalled();
    expect(models.validateModelAvailability).not.toHaveBeenCalled();
    expect(budget.quote).not.toHaveBeenCalled();
    expect(budget.reserve).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  },
);

it.each([
  [
    '2026-11-01T00:00:00+06:00',
    '2026-10-31T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  ],
  [
    '2028-02-29T23:59:59.999Z',
    '2028-02-29T00:00:00.000Z',
    '2028-03-01T00:00:00.000Z',
  ],
  [
    '2026-12-31T23:59:59.999Z',
    '2026-12-31T00:00:00.000Z',
    '2027-01-01T00:00:00.000Z',
  ],
])(
  'uses the same UTC day across every runtime for %s',
  async (timestamp, start, end) => {
    const query = jest.fn().mockResolvedValue([{ count: 3 }]);
    const manager = {
      queryRunner: { isTransactionActive: true },
      query,
    } as unknown as EntityManager;
    const now = new Date(timestamp);
    const original = now.toISOString();
    await expect(
      countDeliveryAgentRunsForUtcDay(manager, WORKSPACE, AGENT, now),
    ).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      WORKSPACE,
      AGENT,
      start,
      end,
    ]);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('core."deliveryAgentRun"');
    expect(sql).toContain("'agentRuns'");
    expect(sql).toContain('core."deliveryAdvertisingDraftRun"');
    expect(sql).toContain('core."otogrowActivityAnalysisRun"');
    expect(sql).not.toMatch(/status\s*(?:=|IN)/i);
    expect(sql).not.toContain("configuration->>'kind'");
    expect(now.toISOString()).toBe(original);
  },
);

it('fails closed before unlocked reads and when any shared runtime source is unavailable', async () => {
  const query = jest.fn();
  const manager = {
    queryRunner: { isTransactionActive: false },
    query,
  } as unknown as EntityManager;
  await expect(
    countDeliveryAgentRunsForUtcDay(manager, WORKSPACE, AGENT),
  ).rejects.toThrow('locked source transaction');
  expect(query).not.toHaveBeenCalled();
  const active = {
    queryRunner: { isTransactionActive: true },
    query,
  } as unknown as EntityManager;
  await expect(
    countDeliveryAgentRunsForUtcDay(
      active,
      WORKSPACE,
      AGENT,
      new Date('invalid'),
    ),
  ).rejects.toThrow('valid run date');
  expect(query).not.toHaveBeenCalled();
  query.mockRejectedValue(new Error('Synthetic missing shared runtime source'));
  await expect(
    countDeliveryAgentRunsForUtcDay(active, WORKSPACE, AGENT),
  ).rejects.toThrow('Synthetic missing shared runtime source');
});
