import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In } from 'typeorm';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryFounderService } from 'src/modules/delivery/founder/delivery-founder.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import {
  DeliveryReminderOutboxEntity,
  type DeliveryReminderState,
} from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryFounderEscalationRuleEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-rule.entity';
import { DeliveryFounderEscalationEpisodeEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-episode.entity';
import { DeliveryFounderEscalationNoticeEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-notice.entity';
import {
  type DeliveryFounderEscalationRuleDTO,
  type DeliveryFounderEscalationEpisodeDTO,
  type DeliveryFounderEscalationNoticeDTO,
  type DeliveryFounderEscalationsSnapshotDTO,
  type DeliveryFounderEscalationPreviewDTO,
  type DeliveryFounderEscalationRuleResultDTO,
  type DeliveryFounderEscalationEpisodeResultDTO,
} from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.dto';
import {
  FOUNDER_ESCALATION_CONDITIONS,
  FOUNDER_ESCALATION_RULE_LIMIT,
  FOUNDER_ESCALATION_EPISODE_LIMIT,
  founderEscalationDraftSchema,
  founderEscalationSaveSchema,
  founderEscalationStateSchema,
  founderEscalationAcknowledgeSchema,
  founderEscalationsQuerySchema,
  parseFounderEscalation,
  founderEscalationDomain,
  founderEscalationInScope,
  founderEscalationMayRepeat,
  founderEscalationReactivationDue,
  matchFounderEscalation,
  founderEscalationSourceVerified,
  type FounderEscalationDraft,
} from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.policy';

type Collection = Awaited<ReturnType<DeliveryFounderService['collect']>>;
type NoticeState = {
  episodeId: string;
  count: number;
  sentCount: number;
  lastSuccessfulAt: Date | null;
  terminalStop: boolean;
  attemptedAt: Date | null;
  error: string | null;
  sequence: number;
  ruleRevision: number;
  status: string;
  finishedAt: Date | null;
};
type Setup = {
  routingAdopted: boolean;
  routingRevision: number;
  telegramEnabled: boolean;
  botConfigured: boolean;
  linkedRecipientIds: string[];
  connections: Record<string, { chatId: string }>;
};
const configuration = (
  rule: FounderEscalationDraft,
): FounderEscalationDraft => ({
  id: rule.id,
  revision: rule.revision,
  name: rule.name,
  condition: rule.condition,
  minimumReviewWaitHours: rule.minimumReviewWaitHours ?? null,
  recipientId: rule.recipientId,
  priority: rule.priority,
  projectScope: rule.projectScope,
  projectIds: rule.projectIds,
  includeCompany: rule.includeCompany,
  currency: rule.currency,
  serviceMonth: rule.serviceMonth,
  repeatMode: rule.repeatMode,
  repeatHours: rule.repeatHours,
  maxSends: rule.maxSends,
});
const financialCondition = (condition: string) =>
  founderEscalationDomain(condition) === 'FINANCE' ||
  condition === 'MANUAL_BUDGET_CONCERN';

@Injectable()
export class DeliveryFounderEscalationService {
  private readonly logger = new Logger(DeliveryFounderEscalationService.name);
  private lastWorkspaceId: string | null = null;
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly founder: DeliveryFounderService,
    private readonly telegram: TelegramConfigService,
    private readonly config: TwentyConfigService,
  ) {}
  private async lock(
    manager: EntityManager,
    workspaceId: string,
    write = true,
  ) {
    await manager.query(
      `SELECT pg_advisory_xact_lock${write ? '' : '_shared'}(hashtextextended($1,0))`,
      [`delivery:${workspaceId}`],
    );
  }
  private async actor(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.isAdmin)
      throw new ForbiddenException(
        'Founder alert rules require current administrator access.',
      );
    return actor;
  }
  private async directory(manager: EntityManager, workspaceId: string) {
    const [members, access] = await Promise.all([
      this.access.listActiveMembers(workspaceId, manager),
      this.access.listAccess(workspaceId, manager),
    ]);
    const admins = members.filter((member) =>
      access.some(
        (entry) =>
          entry.memberId === member.memberId &&
          entry.capabilities.includes('workspace.admin'),
      ),
    );
    return { members, admins, access };
  }
  private async setup(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<Setup> {
    const [row] = await manager.query<
      {
        routing: { mode?: string; revision?: number } | null;
        telegramEnabled: boolean;
        connections: Record<string, { chatId: string }> | null;
      }[]
    >(
      `SELECT state->'founderEscalationRouting' AS routing,COALESCE(state->>'telegramEnabled','false')='true' AS "telegramEnabled",state->'connections' AS connections FROM core."deliveryOperations" WHERE "workspaceId"=$1`,
      [workspaceId],
    );
    const bot = await this.telegram.findByWorkspaceId(workspaceId);
    const connections =
      row?.connections &&
      typeof row.connections === 'object' &&
      !Array.isArray(row.connections)
        ? row.connections
        : {};
    return {
      routingAdopted: row?.routing?.mode === 'RULES',
      routingRevision: row?.routing?.revision ?? 0,
      telegramEnabled: row?.telegramEnabled === true,
      botConfigured: bot?.isActive === true && Boolean(bot.botUsername),
      linkedRecipientIds: Object.keys(connections).filter(
        (id) =>
          typeof connections[id]?.chatId === 'string' &&
          connections[id].chatId.length > 0,
      ),
      connections,
    };
  }
  private async validate(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    rule: FounderEscalationDraft,
  ) {
    const directory = await this.directory(manager, workspace.id);
    const recipient = directory.admins.find(
      (member) => member.memberId === rule.recipientId,
    );
    if (!recipient)
      throw new BadRequestException(
        'Choose an active administrator recipient.',
      );
    const projects = await manager.query<{ id: string; name: string }[]>(
      'SELECT id,name FROM core."deliveryProject" WHERE "workspaceId"=$1 ORDER BY id LIMIT 2001',
      [workspace.id],
    );
    if (projects.length > 2000)
      throw new BadRequestException(
        'The project directory exceeds the safe rule review limit.',
      );
    if (
      rule.projectIds.some(
        (id) => !projects.some((project) => project.id === id),
      )
    )
      throw new BadRequestException(
        'One selected client project is unavailable.',
      );
    return { directory, recipient, projects };
  }
  private async eligible(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    rule: DeliveryFounderEscalationRuleEntity,
  ) {
    if (!rule.grantedBy || !rule.grantUserWorkspaceId) return false;
    try {
      const grant = await this.actor(
        manager,
        workspace,
        rule.grantedBy,
        rule.grantUserWorkspaceId,
      );
      const directory = await this.directory(manager, workspace.id);
      const recipient = directory.admins.find(
        (member) => member.memberId === rule.recipientId,
      );
      if (!recipient) return false;
      const recipientActor = await this.actor(
        manager,
        workspace,
        recipient.memberId,
        recipient.userWorkspaceId,
      );
      return (
        !financialCondition(rule.condition) ||
        (canReadFinance(grant) && canReadFinance(recipientActor))
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return false;
      throw error;
    }
  }
  private async ruleDTO(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    rule: DeliveryFounderEscalationRuleEntity,
  ): Promise<DeliveryFounderEscalationRuleDTO> {
    const directory = await this.directory(manager, workspace.id);
    return {
      ...configuration(rule),
      enabled: rule.enabled,
      recipientName:
        directory.admins.find((member) => member.memberId === rule.recipientId)
          ?.name ?? rule.recipientName,
      recipientEligible: directory.admins.some(
        (member) => member.memberId === rule.recipientId,
      ),
      grantingAdminEligible:
        rule.grantedBy === null ||
        (await this.eligible(manager, workspace, rule)),
      changedAt: rule.changedAt.toISOString(),
      changedByName: rule.changedByName,
      lastEvaluatedAt: rule.lastEvaluatedAt?.toISOString() ?? null,
      evaluationError: rule.evaluationError,
    };
  }
  private episodeDTO(
    episode: DeliveryFounderEscalationEpisodeEntity,
  ): DeliveryFounderEscalationEpisodeDTO {
    return {
      ...episode,
      title: episode.source.title,
      firstSeenAt: episode.firstSeenAt.toISOString(),
      lastSeenAt: episode.lastSeenAt.toISOString(),
      resolvedAt: episode.resolvedAt?.toISOString() ?? null,
      acknowledgedAt: episode.acknowledgedAt?.toISOString() ?? null,
    };
  }
  private async replay(
    manager: EntityManager,
    workspaceId: string,
    commandId: string,
    memberId: string,
    hash: string,
  ) {
    const event = await manager
      .getRepository(DeliveryFounderEscalationNoticeEntity)
      .findOneBy({ workspaceId, commandId });
    if (event && (event.createdBy !== memberId || event.requestHash !== hash))
      throw new ConflictException(
        'This founder alert command identity was already used for another change.',
      );
    return event;
  }
  private async audit(
    manager: EntityManager,
    workspaceId: string,
    rule: DeliveryFounderEscalationRuleEntity,
    kind: Exclude<DeliveryFounderEscalationNoticeEntity['kind'], 'ALERT'>,
    commandId: string,
    requestHash: string,
    memberId: string,
    actorName: string,
    reason: string,
    now: Date,
    episodeId: string | null = null,
  ) {
    await manager.getRepository(DeliveryFounderEscalationNoticeEntity).save({
      workspaceId,
      ruleId: rule.id,
      episodeId,
      kind,
      sequence: 0,
      ruleRevision: rule.revision,
      commandId,
      requestHash,
      ruleSnapshot: { ...configuration(rule), enabled: rule.enabled },
      source: null,
      recipientId: rule.recipientId,
      recipientName: rule.recipientName,
      priority: rule.priority,
      createdBy: memberId,
      actorName,
      reason,
      createdAt: now,
    });
    await recordOtogrowActivity(manager, {
      workspaceId,
      actorId: memberId,
      category: 'DELIVERY',
      sourceType: 'founder-alert',
      sourceId: rule.id,
      action:
        kind === 'ACKNOWLEDGED'
          ? 'FOUNDER_ESCALATION_ACKNOWLEDGED'
          : `FOUNDER_ESCALATION_${kind}`,
      outcome: 'RECORDED',
      summary:
        kind === 'ACKNOWLEDGED'
          ? 'Acknowledged a founder alert; source work is unchanged.'
          : 'Updated a founder escalation rule.',
      changes: [
        {
          field: kind === 'ACKNOWLEDGED' ? 'acknowledged' : 'revision',
          before: null,
          after: kind === 'ACKNOWLEDGED' ? 'true' : String(rule.revision),
        },
      ],
    });
  }
  private async suppress(
    manager: EntityManager,
    workspaceId: string,
    ruleId: string,
    episodeId?: string,
  ) {
    await manager.query(
      `UPDATE core."deliveryReminderOutbox" outbox SET status='SUPPRESSED',"finishedAt"=now(),error='RULE_OR_SOURCE_CHANGED',"updatedAt"=now() FROM core."deliveryFounderEscalationNotice" notice WHERE notice.id=outbox."noticeId" AND notice."workspaceId"=outbox."workspaceId" AND notice."workspaceId"=$1 AND notice."ruleId"=$2 AND ($3::uuid IS NULL OR notice."episodeId"=$3) AND outbox.status='QUEUED'`,
      [workspaceId, ruleId, episodeId ?? null],
    );
  }
  private async evaluation(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    rule: FounderEscalationDraft,
    now: Date,
  ) {
    const collection = await this.founder.collect(
      workspace,
      memberId,
      userWorkspaceId,
      {
        domain: founderEscalationDomain(rule.condition),
        currency: rule.currency,
        serviceMonth: rule.serviceMonth,
      },
      manager,
      now,
    );
    return {
      collection,
      matches: matchFounderEscalation(rule, collection.items, now),
    };
  }
  private async previewIn(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    rule: FounderEscalationDraft,
    now: Date,
  ): Promise<DeliveryFounderEscalationPreviewDTO> {
    const actor = await this.actor(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    if (financialCondition(rule.condition) && !canReadFinance(actor))
      throw new ForbiddenException();
    const { recipient } = await this.validate(manager, workspace, rule);
    const setup = await this.setup(manager, workspace.id);
    const { collection, matches } = await this.evaluation(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      rule,
      now,
    );
    const warnings = [
      ...(!setup.botConfigured ? ['BOT_NOT_CONFIGURED'] : []),
      ...(!setup.telegramEnabled ? ['TELEGRAM_DISABLED'] : []),
      ...(!setup.linkedRecipientIds.includes(rule.recipientId)
        ? ['RECIPIENT_NOT_LINKED']
        : []),
      ...(!setup.routingAdopted ? ['LEGACY_ROUTING_WILL_BE_REPLACED'] : []),
      ...(collection.coverage.some(
        (row) => !['INCLUDED', 'NOT_SELECTED'].includes(row.status),
      )
        ? ['SOURCE_COVERAGE_PARTIAL']
        : []),
    ];
    const previewToken = financeReviewToken({
      rule: configuration(rule),
      recipient: {
        id: recipient.memberId,
        membership: recipient.userWorkspaceId,
      },
      authority: { isAdmin: actor.isAdmin, finance: canReadFinance(actor) },
      routing: {
        adopted: setup.routingAdopted,
        revision: setup.routingRevision,
      },
      setup: {
        enabled: setup.telegramEnabled,
        bot: setup.botConfigured,
        linked: setup.linkedRecipientIds.includes(rule.recipientId),
      },
      matches: matches.map((match) => ({
        key: match.key,
        source: match.source,
      })),
      coverage: collection.coverage,
    });
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      canReadFinance: canReadFinance(actor),
      previewToken,
      observedAt: now.toISOString(),
      matchCount: matches.length,
      items: matches.slice(0, 25).map((match) => match.source),
      coverage: collection.coverage,
      warnings,
      canEnable:
        setup.botConfigured &&
        setup.telegramEnabled &&
        setup.linkedRecipientIds.includes(rule.recipientId),
    };
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const rule = parseFounderEscalation(founderEscalationDraftSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id, false);
      return this.previewIn(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        rule,
        new Date(),
      );
    });
  }
  async saveRule(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFounderEscalationRuleResultDTO> {
    const fields = parseFounderEscalation(founderEscalationSaveSchema, input),
      hash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      const actor = await this.actor(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      if (financialCondition(fields.condition) && !canReadFinance(actor))
        throw new ForbiddenException();
      const previous = await this.replay(
        manager,
        workspace.id,
        fields.commandId,
        memberId,
        hash,
      );
      const repository = manager.getRepository(
        DeliveryFounderEscalationRuleEntity,
      );
      if (previous) {
        const rule = await repository.findOneByOrFail({
          workspaceId: workspace.id,
          id: previous.ruleId,
        });
        return {
          rule: await this.ruleDTO(manager, workspace, rule),
          replayed: true,
        };
      }
      const old = await repository.findOneBy({ id: fields.id });
      if (old && old.workspaceId !== workspace.id)
        throw new ConflictException('This rule identity is unavailable.');
      if ((old?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'The alert rule changed. Reload before saving.',
        );
      if (
        !old &&
        (await repository.countBy({ workspaceId: workspace.id })) >=
          FOUNDER_ESCALATION_RULE_LIMIT
      )
        throw new BadRequestException(
          'This workspace has reached its bounded alert-rule limit.',
        );
      const { recipient, directory } = await this.validate(
        manager,
        workspace,
        fields,
      );
      const name =
        directory.members.find((member) => member.memberId === memberId)
          ?.name ?? 'Administrator';
      const now = new Date();
      const rule = await repository.save({
        ...configuration(fields),
        workspaceId: workspace.id,
        revision: fields.revision + 1,
        enabled: false,
        recipientName: recipient.name,
        grantedBy: old?.grantedBy ?? null,
        grantUserWorkspaceId: old?.grantUserWorkspaceId ?? null,
        changedBy: memberId,
        changedByName: name,
        changedAt: now,
        lastEvaluatedAt: old?.lastEvaluatedAt ?? null,
        evaluationError: null,
      });
      await this.suppress(manager, workspace.id, rule.id);
      await this.audit(
        manager,
        workspace.id,
        rule,
        'RULE_SAVED',
        fields.commandId,
        hash,
        memberId,
        name,
        fields.reason,
        now,
      );
      return {
        rule: await this.ruleDTO(manager, workspace, rule),
        replayed: false,
      };
    });
  }
  private async adopt(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    commandId: string,
    reason: string,
    now: Date,
  ) {
    const repository = manager.getRepository(DeliveryOperationsEntity);
    const operations = await repository.findOne({
      where: { workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!operations)
      throw new BadRequestException(
        'Initialize workspace operations before adopting alert rules.',
      );
    if (operations.state.founderEscalationRouting?.mode === 'RULES') return;
    if (!Array.isArray(operations.state.notices))
      throw new BadRequestException(
        'Existing notification state requires review before routing adoption.',
      );
    const cancelled: string[] = [];
    for (const notice of operations.state.notices)
      if (
        notice.kind === 'ALERT' &&
        ['PENDING', 'QUEUED', 'UNCONFIGURED'].includes(notice.sendState)
      ) {
        notice.cancelled = true;
        notice.sendState = 'SUPPRESSED';
        notice.error = 'Replaced by explicitly adopted founder alert rules.';
        cancelled.push(notice.id);
      }
    if (cancelled.length)
      await manager.query(
        `UPDATE core."deliveryReminderOutbox" SET status='SUPPRESSED',"finishedAt"=$3,"updatedAt"=$3,error='FOUNDER_RULE_ROUTING_ADOPTED' WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[]) AND status='QUEUED'`,
        [workspaceId, cancelled, now],
      );
    operations.state.founderEscalationRouting = {
      mode: 'RULES',
      revision: (operations.state.founderEscalationRouting?.revision ?? 0) + 1,
      changedBy: memberId,
      changedAt: now.toISOString(),
      commandId,
      reason,
    };
    await repository.save(operations);
  }
  async changeRule(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFounderEscalationRuleResultDTO> {
    const fields = parseFounderEscalation(founderEscalationStateSchema, input),
      hash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.actor(manager, workspace, memberId, userWorkspaceId);
      const previous = await this.replay(
          manager,
          workspace.id,
          fields.commandId,
          memberId,
          hash,
        ),
        repository = manager.getRepository(DeliveryFounderEscalationRuleEntity);
      const rule = await repository.findOneBy({
        workspaceId: workspace.id,
        id: previous?.ruleId ?? fields.ruleId,
      });
      if (!rule)
        throw new NotFoundException('The founder alert rule is unavailable.');
      if (previous)
        return {
          rule: await this.ruleDTO(manager, workspace, rule),
          replayed: true,
        };
      if (rule.revision !== fields.revision)
        throw new ConflictException(
          'This rule changed. Reload its saved configuration.',
        );
      const now = new Date();
      if (fields.enabled) {
        const preview = await this.previewIn(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          configuration(rule),
          now,
        );
        if (!preview.canEnable)
          throw new BadRequestException(
            'Configure the bot, Telegram switch and recipient link before enabling this rule.',
          );
        if (preview.previewToken !== fields.previewToken)
          throw new ConflictException(
            'The rule or source preview changed. Review current evidence again.',
          );
        const setup = await this.setup(manager, workspace.id);
        if (!setup.routingAdopted && !fields.adoptLegacyRouting)
          throw new BadRequestException(
            'Explicitly acknowledge replacing legacy founder deadline notifications.',
          );
        if (!setup.routingAdopted)
          await this.adopt(
            manager,
            workspace.id,
            memberId,
            fields.commandId,
            fields.reason,
            now,
          );
        rule.grantedBy = memberId;
        rule.grantUserWorkspaceId = userWorkspaceId;
      } else if (fields.adoptLegacyRouting)
        throw new BadRequestException(
          'Pausing a rule cannot adopt notification routing.',
        );
      const directory = await this.directory(manager, workspace.id);
      rule.enabled = fields.enabled;
      rule.revision++;
      rule.changedBy = memberId;
      rule.changedByName =
        directory.members.find((member) => member.memberId === memberId)
          ?.name ?? 'Administrator';
      rule.changedAt = now;
      rule.evaluationError = null;
      await repository.save(rule);
      await this.suppress(manager, workspace.id, rule.id);
      await this.audit(
        manager,
        workspace.id,
        rule,
        fields.enabled ? 'RULE_ENABLED' : 'RULE_PAUSED',
        fields.commandId,
        hash,
        memberId,
        rule.changedByName,
        fields.reason,
        now,
      );
      return {
        rule: await this.ruleDTO(manager, workspace, rule),
        replayed: false,
      };
    });
  }
  async acknowledge(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFounderEscalationEpisodeResultDTO> {
    const fields = parseFounderEscalation(
        founderEscalationAcknowledgeSchema,
        input,
      ),
      hash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.actor(manager, workspace, memberId, userWorkspaceId);
      const previous = await this.replay(
          manager,
          workspace.id,
          fields.commandId,
          memberId,
          hash,
        ),
        repository = manager.getRepository(
          DeliveryFounderEscalationEpisodeEntity,
        );
      const episode = await repository.findOneBy({
        workspaceId: workspace.id,
        id: previous?.episodeId ?? fields.episodeId,
      });
      if (!episode)
        throw new NotFoundException('This founder issue is unavailable.');
      if (previous)
        return { episode: this.episodeDTO(episode), replayed: true };
      if (episode.revision !== fields.revision)
        throw new ConflictException(
          'The observed issue changed. Review the current issue before acknowledging.',
        );
      const rule = await manager
        .getRepository(DeliveryFounderEscalationRuleEntity)
        .findOneByOrFail({ workspaceId: workspace.id, id: episode.ruleId });
      const directory = await this.directory(manager, workspace.id),
        name =
          directory.members.find((member) => member.memberId === memberId)
            ?.name ?? 'Administrator',
        now = new Date();
      if (episode.acknowledgedAt)
        throw new ConflictException('This issue is already acknowledged.');
      episode.acknowledgedAt = now;
      episode.acknowledgedByName = name;
      episode.acknowledgementReason = fields.reason;
      episode.revision++;
      await repository.save(episode);
      await this.suppress(manager, workspace.id, rule.id, episode.id);
      await this.audit(
        manager,
        workspace.id,
        rule,
        'ACKNOWLEDGED',
        fields.commandId,
        hash,
        memberId,
        name,
        fields.reason,
        now,
        episode.id,
      );
      return { episode: this.episodeDTO(episode), replayed: false };
    });
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown = {},
  ): Promise<DeliveryFounderEscalationsSnapshotDTO> {
    const query = parseFounderEscalation(founderEscalationsQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id, false);
      const actor = await this.actor(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        ),
        financial = canReadFinance(actor);
      const [setup, directory] = await Promise.all([
        this.setup(manager, workspace.id),
        this.directory(manager, workspace.id),
      ]);
      const projects = await manager.query<{ id: string; name: string }[]>(
        'SELECT id,name FROM core."deliveryProject" WHERE "workspaceId"=$1 ORDER BY id LIMIT 2001',
        [workspace.id],
      );
      if (projects.length > 2000)
        throw new BadRequestException(
          'The rule project directory exceeds its safe limit.',
        );
      const ruleRepository = manager.getRepository(
        DeliveryFounderEscalationRuleEntity,
      );
      const allRules = await ruleRepository.find({
        where: { workspaceId: workspace.id },
        take: FOUNDER_ESCALATION_RULE_LIMIT + 1,
        order: { id: 'ASC' },
      });
      if (allRules.length > FOUNDER_ESCALATION_RULE_LIMIT)
        throw new BadRequestException(
          'The alert-rule collection exceeds its safe limit.',
        );
      const allowedRules = allRules.filter(
        (rule) => financial || !financialCondition(rule.condition),
      );
      if (
        query.ruleId &&
        !allowedRules.some((rule) => rule.id === query.ruleId)
      )
        throw new NotFoundException('The selected alert rule is unavailable.');
      const rules = allowedRules.filter(
        (rule) =>
          (!query.ruleId || rule.id === query.ruleId) &&
          (!query.afterRuleId || query.ruleId || rule.id > query.afterRuleId),
      );
      const ruleIds = query.ruleId
        ? [query.ruleId]
        : allowedRules.map((rule) => rule.id);
      const financialConditions = FOUNDER_ESCALATION_CONDITIONS.filter(
        (condition) => financialCondition(condition.code),
      ).map((condition) => condition.code);
      if (query.afterEpisodeId && !query.episodeId) {
        const [cursor] = await manager.query<{ id: string }[]>(
          'SELECT id FROM core."deliveryFounderEscalationEpisode" WHERE "workspaceId"=$1 AND "ruleId"=ANY($2::uuid[]) AND id=$3 AND ($4::boolean OR NOT(condition=ANY($5::text[])))',
          [
            workspace.id,
            ruleIds,
            query.afterEpisodeId,
            financial,
            financialConditions,
          ],
        );
        if (!cursor)
          throw new BadRequestException(
            'The issue page cursor is unavailable for this rule.',
          );
      }
      const episodes = ruleIds.length
        ? await manager.query<DeliveryFounderEscalationEpisodeEntity[]>(
            `SELECT episode.* FROM core."deliveryFounderEscalationEpisode" episode WHERE episode."workspaceId"=$1 AND episode."ruleId"=ANY($2::uuid[]) AND ($3::uuid IS NULL OR episode.id=$3) AND ($4::uuid IS NULL OR $3::uuid IS NOT NULL OR (episode."firstSeenAt",episode.id)<(SELECT cursor."firstSeenAt",cursor.id FROM core."deliveryFounderEscalationEpisode" cursor WHERE cursor."workspaceId"=$1 AND cursor.id=$4 AND cursor."ruleId"=ANY($2::uuid[]))) AND ($5::boolean OR NOT(episode.condition=ANY($6::text[]))) ORDER BY episode."firstSeenAt" DESC,episode.id DESC LIMIT 26`,
            [
              workspace.id,
              ruleIds,
              query.episodeId ?? null,
              query.afterEpisodeId ?? null,
              financial,
              financialConditions,
            ],
          )
        : [];
      if (
        query.episodeId &&
        !episodes.some((episode) => episode.id === query.episodeId)
      )
        throw new NotFoundException(
          'The selected founder issue is unavailable.',
        );
      if (query.afterNoticeId) {
        const [cursor] = await manager.query<{ id: string }[]>(
          'SELECT id FROM core."deliveryFounderEscalationNotice" WHERE "workspaceId"=$1 AND "ruleId"=ANY($2::uuid[]) AND id=$3 AND ($4::uuid IS NULL OR "episodeId"=$4) AND ($5::boolean OR NOT(COALESCE("ruleSnapshot"->>\'condition\',\'\')=ANY($6::text[])))',
          [
            workspace.id,
            ruleIds,
            query.afterNoticeId,
            query.episodeId ?? null,
            financial,
            financialConditions,
          ],
        );
        if (!cursor)
          throw new BadRequestException(
            'The notice page cursor is unavailable for this rule or issue.',
          );
      }
      const notices = ruleIds.length
        ? await manager.query<DeliveryFounderEscalationNoticeEntity[]>(
            `SELECT notice.* FROM core."deliveryFounderEscalationNotice" notice WHERE notice."workspaceId"=$1 AND notice."ruleId"=ANY($2::uuid[]) AND ($3::uuid IS NULL OR notice."episodeId"=$3) AND ($4::uuid IS NULL OR (notice."createdAt",notice.id)<(SELECT cursor."createdAt",cursor.id FROM core."deliveryFounderEscalationNotice" cursor WHERE cursor."workspaceId"=$1 AND cursor.id=$4 AND cursor."ruleId"=ANY($2::uuid[]) AND ($3::uuid IS NULL OR cursor."episodeId"=$3))) AND ($5::boolean OR NOT(COALESCE(notice."ruleSnapshot"->>'condition','')=ANY($6::text[]))) ORDER BY notice."createdAt" DESC,notice.id DESC LIMIT 26`,
            [
              workspace.id,
              ruleIds,
              query.episodeId ?? null,
              query.afterNoticeId ?? null,
              financial,
              financialConditions,
            ],
          )
        : [];
      const noticeIds = notices.slice(0, 25).map((notice) => notice.id);
      const outboxes = noticeIds.length
        ? await manager
            .getRepository(DeliveryReminderOutboxEntity)
            .findBy({ workspaceId: workspace.id, noticeId: In(noticeIds) })
        : [];
      const noticeRows: DeliveryFounderEscalationNoticeDTO[] = notices
        .slice(0, 25)
        .map((notice) => {
          const outbox = outboxes.find((row) => row.noticeId === notice.id);
          const immutableConfiguration = founderEscalationDraftSchema.safeParse(
            Object.fromEntries(
              Object.keys(founderEscalationDraftSchema.shape).map((key) => [
                key,
                notice.ruleSnapshot[key],
              ]),
            ),
          );
          return {
            configuration: immutableConfiguration.success
              ? immutableConfiguration.data
              : null,
            id: notice.id,
            ruleId: notice.ruleId,
            episodeId: notice.episodeId,
            kind: notice.kind,
            sequence: notice.sequence,
            ruleRevision: notice.ruleRevision,
            priority: notice.priority,
            recipientName: notice.recipientName,
            createdAt: notice.createdAt.toISOString(),
            actorName: notice.actorName,
            reason: notice.reason,
            transportStatus:
              notice.kind === 'ALERT'
                ? (outbox?.status ?? 'UNAVAILABLE')
                : 'NOT_APPLICABLE',
            attemptedAt: outbox?.attemptedAt?.toISOString() ?? null,
            finishedAt: outbox?.finishedAt?.toISOString() ?? null,
            error: outbox?.error ?? null,
          };
        });
      const observations = allRules
        .flatMap((rule) =>
          rule.lastEvaluatedAt ? [rule.lastEvaluatedAt.toISOString()] : [],
        )
        .sort();
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        observedAt: new Date().toISOString(),
        canReadFinance: financial,
        workerObservedAt: observations[observations.length - 1] ?? null,
        routingAdopted: setup.routingAdopted,
        routingRevision: setup.routingRevision,
        telegramEnabled: setup.telegramEnabled,
        botConfigured: setup.botConfigured,
        linkedRecipientIds: setup.linkedRecipientIds.filter((id) =>
          directory.admins.some((member) => member.memberId === id),
        ),
        recipients: directory.admins.map((member) => ({
          id: member.memberId,
          name: member.name,
        })),
        projects,
        conditions: FOUNDER_ESCALATION_CONDITIONS.filter(
          (condition) => financial || !financialCondition(condition.code),
        ),
        rules: await Promise.all(
          rules
            .slice(0, 25)
            .map((rule) => this.ruleDTO(manager, workspace, rule)),
        ),
        nextRuleId: rules.length > 25 ? rules[24].id : null,
        episodes: episodes
          .slice(0, 25)
          .map((episode) => this.episodeDTO(episode)),
        nextEpisodeId: episodes.length > 25 ? episodes[24].id : null,
        notices: noticeRows,
        nextNoticeId: notices.length > 25 ? notices[24].id : null,
      };
    });
  }
  private async noticeStates(
    manager: EntityManager,
    workspaceId: string,
    episodeIds: string[],
  ): Promise<Map<string, NoticeState>> {
    if (!episodeIds.length) return new Map();
    const rows = await manager.query<NoticeState[]>(
      `WITH grouped AS (SELECT "episodeId",count(*)::integer AS count,count(*) FILTER (WHERE receipt.status='SENT')::integer AS "sentCount",max(receipt."finishedAt") FILTER (WHERE receipt.status='SENT') AS "lastSuccessfulAt",COALESCE(bool_or(receipt.status IN ('FAILED','UNCERTAIN')),false) AS "terminalStop",max(notice.sequence) AS sequence FROM core."deliveryFounderEscalationNotice" notice LEFT JOIN core."deliveryReminderOutbox" receipt ON receipt."workspaceId"=notice."workspaceId" AND receipt."noticeId"=notice.id WHERE notice."workspaceId"=$1 AND notice."episodeId"=ANY($2::uuid[]) AND notice.kind='ALERT' GROUP BY notice."episodeId") SELECT grouped.*,notice."ruleRevision",COALESCE(outbox.status,'UNAVAILABLE') AS status,outbox."finishedAt",outbox."attemptedAt",outbox.error FROM grouped JOIN core."deliveryFounderEscalationNotice" notice ON notice."workspaceId"=$1 AND notice."episodeId"=grouped."episodeId" AND notice.sequence=grouped.sequence AND notice.kind='ALERT' LEFT JOIN core."deliveryReminderOutbox" outbox ON outbox."workspaceId"=$1 AND outbox."noticeId"=notice.id`,
      [workspaceId, episodeIds],
    );
    return new Map(rows.map((row) => [row.episodeId, row]));
  }
  private async queueNotice(
    manager: EntityManager,
    workspaceId: string,
    rule: DeliveryFounderEscalationRuleEntity,
    episode: DeliveryFounderEscalationEpisodeEntity,
    sequence: number,
    now: Date,
  ) {
    const notice = await manager
      .getRepository(DeliveryFounderEscalationNoticeEntity)
      .save({
        workspaceId,
        ruleId: rule.id,
        episodeId: episode.id,
        kind: 'ALERT',
        sequence,
        ruleRevision: rule.revision,
        commandId: null,
        requestHash: null,
        ruleSnapshot: { ...configuration(rule), enabled: true },
        source: episode.source,
        recipientId: rule.recipientId,
        recipientName: rule.recipientName,
        priority: rule.priority,
        createdBy: null,
        actorName: 'System',
        reason: null,
        createdAt: now,
      });
    await manager.getRepository(DeliveryReminderOutboxEntity).insert({
      workspaceId,
      noticeId: notice.id,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
    });
  }
  async queueWorkspace(workspaceId: string, now = new Date()) {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspaceId);
      const workspace = await manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: workspaceId });
      if (
        !workspace ||
        workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE
      )
        return;
      const setup = await this.setup(manager, workspaceId);
      if (!setup.routingAdopted) return;
      const ruleRepository = manager.getRepository(
          DeliveryFounderEscalationRuleEntity,
        ),
        episodeRepository = manager.getRepository(
          DeliveryFounderEscalationEpisodeEntity,
        );
      const rules = await ruleRepository.find({
        where: { workspaceId, enabled: true },
        order: { id: 'ASC' },
        take: FOUNDER_ESCALATION_RULE_LIMIT + 1,
      });
      if (rules.length > FOUNDER_ESCALATION_RULE_LIMIT)
        throw new BadRequestException('Founder rule limit exceeded.');
      const cache = new Map<string, Collection>();
      let queued = 0;
      for (const rule of rules) {
        try {
          if (!(await this.eligible(manager, workspace, rule)))
            throw new ForbiddenException();
          const context = JSON.stringify([
            founderEscalationDomain(rule.condition),
            rule.currency,
            rule.serviceMonth,
          ]);
          if (!cache.has(context)) {
            if (cache.size >= 16)
              throw new BadRequestException(
                'Founder evaluation context limit exceeded.',
              );
            cache.set(
              context,
              await this.founder.collect(
                workspace,
                rule.grantedBy!,
                rule.grantUserWorkspaceId!,
                {
                  domain: founderEscalationDomain(rule.condition),
                  currency: rule.currency,
                  serviceMonth: rule.serviceMonth,
                },
                manager,
                now,
              ),
            );
          }
          const channelReady =
            setup.botConfigured &&
            setup.telegramEnabled &&
            setup.linkedRecipientIds.includes(rule.recipientId);
          const collection = cache.get(context)!;
          const matches = matchFounderEscalation(
              configuration(rule),
              collection.items,
              now,
            ),
            matched = new Map(
              matches.map((match) => [match.key, match.source]),
            );
          const episodes = await episodeRepository.find({
            where: {
              workspaceId,
              ruleId: rule.id,
              status: In(['OPEN', 'UNAVAILABLE']),
            },
            order: { id: 'ASC' },
            take: FOUNDER_ESCALATION_EPISODE_LIMIT + 1,
          });
          if (
            episodes.length +
              matches.filter(
                (match) =>
                  !episodes.some((episode) => episode.sourceKey === match.key),
              ).length >
              FOUNDER_ESCALATION_EPISODE_LIMIT ||
            episodes.length > FOUNDER_ESCALATION_EPISODE_LIMIT ||
            matches.length > FOUNDER_ESCALATION_EPISODE_LIMIT
          )
            throw new BadRequestException('Founder issue limit exceeded.');
          const states = await this.noticeStates(
            manager,
            workspaceId,
            episodes.map((episode) => episode.id),
          );
          for (const episode of episodes) {
            if (
              episode.condition !== rule.condition ||
              !founderEscalationInScope(configuration(rule), episode.source)
            ) {
              episode.status = 'WITHDRAWN';
              episode.revision++;
              await episodeRepository.save(episode);
              await this.suppress(manager, workspaceId, rule.id, episode.id);
              continue;
            }
            const source = matched.get(episode.sourceKey);
            if (!source) {
              const clear = founderEscalationSourceVerified(
                configuration(rule),
                collection.items,
                collection.verifiedSourceKeys,
                episode.sourceKey,
                now,
              );
              const status = clear ? 'RESOLVED' : 'UNAVAILABLE';
              if (episode.status !== status) {
                episode.status = status;
                episode.revision++;
                episode.resolvedAt = clear ? now : null;
                await episodeRepository.save(episode);
              }
              if (clear)
                await this.suppress(manager, workspaceId, rule.id, episode.id);
              continue;
            }
            matched.delete(episode.sourceKey);
            if (
              episode.status !== 'OPEN' ||
              episode.source.sourceRevision !== source.sourceRevision
            ) {
              episode.revision++;
              episode.source = source;
            }
            episode.status = 'OPEN';
            episode.lastSeenAt = now;
            await episodeRepository.save(episode);
            const previous = states.get(episode.id) ?? null;
            const explicitReactivation =
              previous &&
              ['SUPPRESSED', 'UNCONFIGURED'].includes(previous.status) &&
              previous.ruleRevision < rule.revision &&
              founderEscalationReactivationDue(
                configuration(rule),
                previous.sentCount,
                previous.lastSuccessfulAt,
                now,
              );
            const unattemptedSourceRecovery =
              previous?.status === 'SUPPRESSED' &&
              previous.error === 'SOURCE_UNAVAILABLE' &&
              previous.attemptedAt === null &&
              previous.sentCount === 0 &&
              previous.ruleRevision === rule.revision;
            const shouldSend =
              !previous?.terminalStop &&
              !episode.acknowledgedAt &&
              (!previous ||
                explicitReactivation ||
                unattemptedSourceRecovery ||
                founderEscalationMayRepeat(
                  configuration(rule),
                  previous.sentCount,
                  previous,
                  false,
                  now,
                ));
            if (
              channelReady &&
              queued < 100 &&
              shouldSend &&
              (previous?.sentCount ?? 0) < rule.maxSends
            ) {
              await this.queueNotice(
                manager,
                workspaceId,
                rule,
                episode,
                (previous?.sequence ?? 0) + 1,
                now,
              );
              queued++;
            }
          }
          for (const [sourceKey, source] of matched) {
            const episode = await episodeRepository.save({
              workspaceId,
              ruleId: rule.id,
              revision: 1,
              sourceKey,
              condition: rule.condition,
              status: 'OPEN',
              source,
              firstSeenAt: now,
              lastSeenAt: now,
              resolvedAt: null,
              acknowledgedAt: null,
              acknowledgedByName: null,
              acknowledgementReason: null,
            });
            if (channelReady && queued < 100) {
              await this.queueNotice(
                manager,
                workspaceId,
                rule,
                episode,
                1,
                now,
              );
              queued++;
            }
          }
          await ruleRepository.update(
            { workspaceId, id: rule.id },
            { lastEvaluatedAt: now, evaluationError: null },
          );
        } catch (error) {
          if (
            !(
              error instanceof BadRequestException ||
              error instanceof ForbiddenException ||
              error instanceof NotFoundException
            )
          )
            throw error;
          await ruleRepository.update(
            { workspaceId, id: rule.id },
            {
              lastEvaluatedAt: now,
              evaluationError:
                error instanceof ForbiddenException
                  ? 'AUTHORITY_UNAVAILABLE'
                  : 'SOURCE_EVALUATION_UNAVAILABLE',
            },
          );
        }
      }
    });
  }
  async queueDue(now = new Date()) {
    let rows = await this.dataSource.query<{ workspaceId: string }[]>(
      'SELECT DISTINCT "workspaceId" FROM core."deliveryFounderEscalationRule" WHERE enabled=true AND ($1::uuid IS NULL OR "workspaceId">$1) ORDER BY "workspaceId" LIMIT 25',
      [this.lastWorkspaceId],
    );
    if (!rows.length && this.lastWorkspaceId) {
      this.lastWorkspaceId = null;
      rows = await this.dataSource.query<{ workspaceId: string }[]>(
        'SELECT DISTINCT "workspaceId" FROM core."deliveryFounderEscalationRule" WHERE enabled=true ORDER BY "workspaceId" LIMIT 25',
      );
    }
    for (const row of rows) {
      this.lastWorkspaceId = row.workspaceId;
      try {
        await this.queueWorkspace(row.workspaceId, now);
      } catch {
        this.logger.warn(
          'A founder escalation workspace could not be evaluated; no source resolution was inferred.',
        );
      }
    }
  }
  async ownsReminder(outboxId: string) {
    const [row] = await this.dataSource.query<{ owned: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM core."deliveryReminderOutbox" outbox JOIN core."deliveryFounderEscalationNotice" notice ON notice.id=outbox."noticeId" AND notice."workspaceId"=outbox."workspaceId" WHERE outbox.id=$1 AND notice.kind='ALERT') AS owned`,
      [outboxId],
    );
    return row?.owned === true;
  }
  async claimReminder(outboxId: string, now = new Date()) {
    const initial = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    if (!initial || initial.status !== 'QUEUED') return null;
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, initial.workspaceId);
      const repository = manager.getRepository(DeliveryReminderOutboxEntity),
        outbox = await repository.findOne({
          where: {
            id: outboxId,
            workspaceId: initial.workspaceId,
            status: 'QUEUED',
          },
          lock: { mode: 'pessimistic_write' },
        });
      if (!outbox) return null;
      const notice = await manager
        .getRepository(DeliveryFounderEscalationNoticeEntity)
        .findOneBy({
          workspaceId: initial.workspaceId,
          id: outbox.noticeId,
          kind: 'ALERT',
        });
      if (!notice) return null;
      const finish = async (
        status: 'SUPPRESSED' | 'UNCONFIGURED',
        error: string,
      ) => {
        await repository.update(
          { id: outbox.id, status: 'QUEUED' },
          { status, error, finishedAt: now },
        );
        return null;
      };
      const workspace = await manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: initial.workspaceId });
      const rule = await manager
        .getRepository(DeliveryFounderEscalationRuleEntity)
        .findOneBy({ workspaceId: initial.workspaceId, id: notice.ruleId });
      const episode = notice.episodeId
        ? await manager
            .getRepository(DeliveryFounderEscalationEpisodeEntity)
            .findOneBy({
              workspaceId: initial.workspaceId,
              id: notice.episodeId,
            })
        : null;
      if (
        !workspace ||
        workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE ||
        !rule ||
        !episode ||
        !rule.enabled ||
        rule.revision !== notice.ruleRevision ||
        episode.acknowledgedAt ||
        ['RESOLVED', 'WITHDRAWN'].includes(episode.status)
      )
        return finish('SUPPRESSED', 'RULE_OR_SOURCE_CHANGED');
      if (!(await this.eligible(manager, workspace, rule)))
        return finish('SUPPRESSED', 'AUTHORITY_UNAVAILABLE');
      const setup = await this.setup(manager, workspace.id);
      if (!setup.routingAdopted)
        return finish('SUPPRESSED', 'ROUTING_NOT_ADOPTED');
      let collection: Collection;
      try {
        collection = await this.founder.collect(
          workspace,
          rule.grantedBy!,
          rule.grantUserWorkspaceId!,
          {
            domain: founderEscalationDomain(rule.condition),
            currency: rule.currency,
            serviceMonth: rule.serviceMonth,
          },
          manager,
          now,
        );
      } catch (error) {
        if (error instanceof ForbiddenException)
          return finish('SUPPRESSED', 'AUTHORITY_UNAVAILABLE');
        if (error instanceof BadRequestException) {
          await manager
            .getRepository(DeliveryFounderEscalationRuleEntity)
            .update(
              { id: rule.id },
              {
                lastEvaluatedAt: now,
                evaluationError: 'SOURCE_EVALUATION_UNAVAILABLE',
              },
            );
          return null;
        }
        throw error;
      }
      const source = matchFounderEscalation(
        configuration(rule),
        collection.items,
        now,
      ).find((match) => match.key === episode.sourceKey);
      if (!source) {
        if (
          founderEscalationSourceVerified(
            configuration(rule),
            collection.items,
            collection.verifiedSourceKeys,
            episode.sourceKey,
            now,
          )
        ) {
          episode.status = 'RESOLVED';
          episode.resolvedAt = now;
          episode.revision++;
          await manager
            .getRepository(DeliveryFounderEscalationEpisodeEntity)
            .save(episode);
          return finish('SUPPRESSED', 'SOURCE_CLEARED');
        }
        episode.status = 'UNAVAILABLE';
        episode.revision++;
        await manager
          .getRepository(DeliveryFounderEscalationEpisodeEntity)
          .save(episode);
        return finish('SUPPRESSED', 'SOURCE_UNAVAILABLE');
      }
      if (
        !setup.telegramEnabled ||
        !setup.botConfigured ||
        !setup.linkedRecipientIds.includes(rule.recipientId)
      )
        return finish('UNCONFIGURED', 'TELEGRAM_SETUP_UNAVAILABLE');
      const bot = await this.telegram.findByWorkspaceId(workspace.id);
      if (!bot?.isActive)
        return finish('UNCONFIGURED', 'TELEGRAM_SETUP_UNAVAILABLE');
      const url = new URL(
        '/delivery',
        this.config.get('FRONTEND_URL') ?? this.config.get('SERVER_URL'),
      );
      url.searchParams.set('view', 'health');
      url.searchParams.set('founderPanel', 'alerts');
      url.searchParams.set('founderRule', rule.id);
      url.searchParams.set('founderIssue', episode.id);
      await repository.update(
        { id: outbox.id, status: 'QUEUED' },
        { status: 'SENDING', attemptedAt: now, error: null },
      );
      return {
        botToken: this.telegram.decryptBotToken(bot),
        chatId: setup.connections[rule.recipientId].chatId,
        text: `Otogrow: ${rule.priority === 'URGENT' ? 'An urgent' : 'A normal-priority'} configured founder alert needs attention.\n${url}`,
      };
    });
  }
  async finishReminder(
    outboxId: string,
    status: Extract<DeliveryReminderState, 'SENT' | 'FAILED' | 'UNCERTAIN'>,
    _error: string | null,
    now = new Date(),
    expiredBefore?: Date,
  ) {
    const initial = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    if (!initial || initial.status !== 'SENDING') return;
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, initial.workspaceId);
      const update = manager
        .getRepository(DeliveryReminderOutboxEntity)
        .createQueryBuilder()
        .update()
        .set({
          status,
          error:
            status === 'SENT'
              ? null
              : status === 'FAILED'
                ? 'TELEGRAM_REJECTED'
                : 'DELIVERY_UNCERTAIN',
          finishedAt: now,
        })
        .where('id=:id AND "workspaceId"=:workspaceId AND status=:current', {
          id: outboxId,
          workspaceId: initial.workspaceId,
          current: 'SENDING',
        });
      if (expiredBefore)
        update.andWhere('"attemptedAt"<:expiredBefore', { expiredBefore });
      await update.execute();
    });
  }
}
