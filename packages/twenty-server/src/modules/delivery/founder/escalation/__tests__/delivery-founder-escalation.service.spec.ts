import { type DataSource, type EntityManager } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryFounderService } from 'src/modules/delivery/founder/delivery-founder.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { DeliveryFounderEscalationService } from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.service';
import {
  founderAction,
  founderEvidence,
  founderException,
} from 'src/modules/delivery/founder/delivery-founder.policy';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227',
  MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a',
  MEMBERSHIP_ID = '3516f2eb-0554-49db-a56c-306e3273cb16',
  PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689',
  RULE_ID = '58aeec76-208d-4dd5-b7ec-fb6cfb4b1ad4';
const fields = {
  id: RULE_ID,
  revision: 1,
  name: 'Chosen deadline',
  condition: 'TASK_OVERDUE',
  recipientId: MEMBER_ID,
  priority: 'URGENT',
  projectScope: 'ALL',
  projectIds: [],
  includeCompany: false,
  currency: null,
  serviceMonth: null,
  repeatMode: 'ONCE',
  repeatHours: null,
  maxSends: 1,
};
const setup = () => {
  const state = {
    bot: true,
    linked: true,
    enabled: true,
    observedAt: '2026-10-28T10:00:00Z',
    version: 'first',
    admin: true,
  };
  const query = jest.fn(async (sql: string) =>
    sql.includes("state->'founderEscalationRouting'")
      ? [
          {
            routing: { mode: 'RULES', revision: 1 },
            telegramEnabled: state.enabled,
            connections: state.linked
              ? { [MEMBER_ID]: { chatId: 'disposable-test-chat' } }
              : {},
          },
        ]
      : sql.includes('deliveryProject')
        ? [{ id: PROJECT_ID, name: 'Client' }]
        : [],
  );
  const manager = { query } as unknown as EntityManager;
  const dataSource = {
    transaction: (read: (manager: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as unknown as DataSource;
  const delivery = {
    actor: jest.fn(async () => ({
      isAdmin: state.admin,
      isManager: true,
      capabilities: ['workspace.admin'],
      memberId: MEMBER_ID,
      roleIds: [],
    })),
  } as unknown as DeliveryService;
  const access = {
    listActiveMembers: jest.fn(async () => [
      {
        memberId: MEMBER_ID,
        userWorkspaceId: MEMBERSHIP_ID,
        name: 'Current founder',
      },
    ]),
    listAccess: jest.fn(async () => [
      { memberId: MEMBER_ID, capabilities: ['workspace.admin'] },
    ]),
  } as unknown as OtogrowAccessService;
  const founder = {
    collect: jest.fn(async () => ({
      workspaceId: WORKSPACE_ID,
      memberId: MEMBER_ID,
      userWorkspaceId: MEMBERSHIP_ID,
      observedAt: state.observedAt,
      canReadFinance: true,
      projects: [],
      owners: [],
      coverage: [{ domain: 'DELIVERY', status: 'INCLUDED', codes: [] }],
      counts: [],
      totalCount: 1,
      nextCursor: null,
      verifiedSourceKeys: ['TASK:' + PROJECT_ID],
      items: [
        founderException({
          domain: 'DELIVERY',
          sourceType: 'TASK',
          sourceId: PROJECT_ID,
          title: 'Current source',
          sourceRevision: state.version,
          reasonCode: 'TASK_BLOCKED',
          projectId: PROJECT_ID,
          evidence: founderEvidence({ warnings: ['TASK_OVERDUE'] }),
          nextAction: founderAction({
            code: 'OPEN_TASK',
            targetType: 'TASK',
            targetId: PROJECT_ID,
          }),
        }),
      ],
    })),
  } as unknown as DeliveryFounderService;
  const telegram = {
    findByWorkspaceId: jest.fn(async () =>
      state.bot ? { isActive: true, botUsername: 'mock_bot' } : null,
    ),
  } as unknown as TelegramConfigService;
  return {
    state,
    query,
    service: new DeliveryFounderEscalationService(
      dataSource,
      delivery,
      access,
      founder,
      telegram,
      {} as TwentyConfigService,
    ),
  };
};
const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;
it('keeps preview fingerprint stable across observation/worker-time changes but stale on source edits', async () => {
  const { service, state } = setup();
  const before = await service.preview(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    fields,
  );
  state.observedAt = '2026-10-29T10:00:00Z';
  const later = await service.preview(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    fields,
  );
  expect(later.previewToken).toBe(before.previewToken);
  state.version = 'changed';
  expect(
    (await service.preview(workspace, MEMBER_ID, MEMBERSHIP_ID, fields))
      .previewToken,
  ).not.toBe(before.previewToken);
});
it.each(['bot', 'linked', 'enabled'] as const)(
  'distinguishes missing %s setup from an empty/healthy source selection',
  async (key) => {
    const { service, state } = setup();
    state[key] = false;
    const preview = await service.preview(
      workspace,
      MEMBER_ID,
      MEMBERSHIP_ID,
      fields,
    );
    expect(preview.canEnable).toBe(false);
    expect(preview.matchCount).toBe(1);
    expect(preview.warnings.length).toBeGreaterThan(0);
  },
);
it('does not return administrator evidence after current admin loss', async () => {
  const { service, state } = setup();
  state.admin = false;
  await expect(
    service.preview(workspace, MEMBER_ID, MEMBERSHIP_ID, fields),
  ).rejects.toThrow(ForbiddenException);
});
