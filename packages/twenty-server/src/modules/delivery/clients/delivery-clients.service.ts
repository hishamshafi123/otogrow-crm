import { syncDeliveryCommitment } from 'src/modules/delivery/commitments/record-delivery-commitment';
import { DeliveryCommitmentsService } from 'src/modules/delivery/commitments/delivery-commitments.service';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { newDeliveryBusiness } from 'src/modules/delivery/business/delivery-business.types';
import { clientShareContent } from 'src/modules/delivery/clients/delivery-clients.policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { type z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import {
  newDeliveryOperations,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';
import {
  clientsCommandSchema,
  engagementSchema,
  clientResponseSchema,
  newDeliveryClients,
  type DeliveryClients,
  type ClientEngagement,
  type ClientBrandAsset,
} from 'src/modules/delivery/clients/delivery-clients.types';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { type OtogrowActivityInput } from 'src/modules/otogrow-activity/otogrow-activity.types';
import { hasPerformanceMarketingService } from 'src/modules/delivery/advertising/delivery-meta-client-routing';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class DeliveryClientsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly creative: DeliveryCreativeService,
    private readonly commitments: DeliveryCommitmentsService,
  ) {}

  private recordActivity(
    manager: EntityManager,
    workspaceId: string,
    actorId: string | null,
    engagement: ClientEngagement,
    event: Pick<OtogrowActivityInput, 'action' | 'summary'> &
      Partial<
        Pick<
          OtogrowActivityInput,
          | 'sourceType'
          | 'sourceId'
          | 'taskId'
          | 'subjectMemberId'
          | 'changes'
          | 'outcome'
        >
      >,
  ) {
    return recordOtogrowActivity(manager, {
      workspaceId,
      actorId,
      actorType: actorId ? 'HUMAN' : 'CLIENT',
      category: 'CLIENT',
      sourceType: 'client-engagement',
      sourceId: engagement.id,
      projectId: engagement.projectId,
      outcome: 'RECORDED',
      ...event,
    });
  }

  private read<TResult>(
    workspaceId: string,
    operation: (
      clients: DeliveryClients,
      operations: DeliveryOperations,
      manager: EntityManager,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return readDeliveryOperations(
      this.dataSource,
      workspaceId,
      (operations, manager) =>
        operation(
          operations.clients ?? newDeliveryClients(),
          operations,
          manager,
        ),
      transactionManager,
    );
  }

  private async transact<TResult>(
    workspaceId: string,
    operation: (
      clients: DeliveryClients,
      operations: DeliveryOperations,
      manager: EntityManager,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    if (
      transactionManager &&
      !transactionManager.queryRunner?.isTransactionActive
    )
      throw new Error('Client changes require an active transaction.');
    const apply = async (manager: EntityManager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const record =
        (await repository.findOneBy({ workspaceId })) ??
        repository.create({ workspaceId, state: newDeliveryOperations() });
      record.state.clients ??= newDeliveryClients();
      const result = await operation(
        record.state.clients,
        record.state,
        manager,
      );
      if (JSON.stringify(record.state).length > 10000000)
        throw new BadRequestException(
          'History storage limit reached. Contact an administrator.',
        );
      await repository.save(record);
      return result;
    };
    return transactionManager
      ? apply(transactionManager)
      : this.dataSource.transaction(apply);
  }

  private async manager(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    const active: { id: string }[] = await manager.query(
      `SELECT m.id FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=$1 AND u.id=$2 AND u."workspaceId"=$3 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
      [memberId, userWorkspaceId, workspace.id],
    );
    if (
      !active.length ||
      !(
        await this.delivery.actor(workspace, memberId, userWorkspaceId, manager)
      ).isManager
    )
      throw new ForbiddenException();
  }

  private async advertisingManager(
    workspace: WorkspaceEntity,
    engagement: Pick<ClientEngagement, 'advertising' | 'projectId'>,
    manager: EntityManager,
  ) {
    const configuration = engagement.advertising;
    if (!configuration || configuration.managerId === configuration.marketerId)
      throw new BadRequestException(
        'Configure a separate advertising manager and marketer.',
      );
    const members: { id: string; userWorkspaceId: string }[] =
      await manager.query(
        `SELECT m.id, u.id AS "userWorkspaceId" FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=ANY($1::uuid[]) AND u."workspaceId"=$2 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
        [[configuration.managerId, configuration.marketerId], workspace.id],
      );
    const reviewer = members.find(
      (member) => member.id === configuration.managerId,
    );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ id: engagement.projectId, workspaceId: workspace.id });
    if (
      !reviewer ||
      !members.some((member) => member.id === configuration.marketerId) ||
      !project?.memberIds.includes(configuration.marketerId)
    )
      throw new BadRequestException(
        'Choose active staff and a marketer assigned to this project.',
      );
    await this.manager(
      workspace,
      reviewer.id,
      reviewer.userWorkspaceId,
      manager,
    );
    return reviewer;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ) {
    return this.read(
      workspace.id,
      async (clients, _operations, manager) => {
        await this.manager(workspace, memberId, userWorkspaceId, manager);
        return {
          ...clients,
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          links: clients.links.map(
            ({ hash: _hash, codeHash: _codeHash, ...link }) => link,
          ),
        };
      },
      transactionManager,
    );
  }

  private async saveEngagement(
    manager: EntityManager,
    clients: DeliveryClients,
    workspace: WorkspaceEntity,
    memberId: string,
    fields: z.infer<typeof engagementSchema>,
  ): Promise<ClientEngagement> {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ id: fields.projectId, workspaceId: workspace.id });
    if (!project?.companyId)
      throw new BadRequestException(
        'Choose a project linked to a client company.',
      );
    const company: { id: string }[] = await manager.query(
      `SELECT id FROM ${this.delivery.schema(workspace)}.company WHERE id=$1 AND "deletedAt" IS NULL`,
      [project.companyId],
    );
    if (!company.length) throw new NotFoundException();
    if (
      new Set(fields.fields.map((field) => field.id)).size !==
      fields.fields.length
    )
      throw new BadRequestException('Form fields must be unique.');
    if (fields.advertising && !hasPerformanceMarketingService(fields.services))
      throw new BadRequestException(
        'Select the Performance marketing service before configuring advertising responsibilities and client budgets.',
      );
    if (fields.advertising)
      await this.advertisingManager(workspace, fields, manager);
    const existing = clients.engagements.find((item) => item.id === fields.id);
    if (fields.id && !existing) throw new NotFoundException();
    if ((existing?.revision ?? 0) !== fields.revision)
      throw new ConflictException('Reload the engagement before editing.');
    if (
      existing &&
      (existing.companyId !== project.companyId ||
        existing.projectId !== project.id)
    )
      throw new BadRequestException(
        'Create a separate engagement when changing the client or project.',
      );
    const engagement: ClientEngagement = {
      ...fields,
      id: existing?.id ?? randomUUID(),
      companyId: project.companyId,
      revision: fields.revision + 1,
      submissions: existing?.submissions ?? [],
      assets: existing?.assets ?? [],
    };
    await this.recordActivity(manager, workspace.id, memberId, engagement, {
      action: existing
        ? 'CLIENT_ENGAGEMENT_UPDATED'
        : 'CLIENT_ENGAGEMENT_CREATED',
      summary: existing
        ? 'Updated a client engagement.'
        : 'Created a client engagement.',
      subjectMemberId: engagement.advertising?.marketerId,
      changes: [
        {
          field: 'revision',
          before: existing ? String(existing.revision) : null,
          after: String(engagement.revision),
        },
        {
          field: 'billing',
          before: existing?.billing ?? null,
          after: engagement.billing,
        },
        {
          field: 'serviceCount',
          before: existing ? String(existing.services.length) : null,
          after: String(engagement.services.length),
        },
        {
          field: 'formFieldCount',
          before: existing ? String(existing.fields.length) : null,
          after: String(engagement.fields.length),
        },
        {
          field: 'advertisingEnabled',
          before: existing ? String(Boolean(existing.advertising)) : null,
          after: String(Boolean(engagement.advertising)),
        },
        {
          field: 'assigneeId',
          before: existing?.advertising?.marketerId ?? null,
          after: engagement.advertising?.marketerId ?? null,
        },
        {
          field: 'reviewerId',
          before: existing?.advertising?.managerId ?? null,
          after: engagement.advertising?.managerId ?? null,
        },
      ].filter((change) => change.before !== change.after),
    });
    if (existing) Object.assign(existing, engagement);
    else clients.engagements.push(engagement);
    return engagement;
  }

  async saveSetupEngagement(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager: EntityManager,
  ): Promise<ClientEngagement> {
    const parsed = engagementSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the client form fields.');
    return this.transact(
      workspace.id,
      async (clients, _operations, manager) => {
        await this.manager(workspace, memberId, userWorkspaceId, manager);
        const engagement = await this.saveEngagement(
          manager,
          clients,
          workspace,
          memberId,
          parsed.data,
        );
        clients.audit.push({
          at: new Date().toISOString(),
          actorId: memberId,
          action: 'engagement',
          targetId: engagement.id,
        });
        return engagement;
      },
      transactionManager,
    );
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const parsed = clientsCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the client form fields.');
    const command = parsed.data;
    const accessCode = randomBytes(8).toString('hex');
    const token = await this.transact(
      workspace.id,
      async (clients, _operations, manager) => {
        await this.manager(workspace, memberId, userWorkspaceId, manager);
        const now = new Date().toISOString();
        let targetId = '';
        let result: string | null = null;
        if (command.action === 'engagement') {
          const engagement = await this.saveEngagement(
            manager,
            clients,
            workspace,
            memberId,
            command.engagement,
          );
          targetId = engagement.id;
        } else if (
          command.action === 'revoke' ||
          command.action === 'withdraw'
        ) {
          const item =
            command.action === 'revoke'
              ? clients.links.find((link) => link.id === command.id)
              : clients.shares.find((share) => share.id === command.id);
          if (!item) throw new NotFoundException();
          const engagement = clients.engagements.find(
            (candidate) => candidate.id === item.engagementId,
          );
          if (!engagement) throw new NotFoundException();
          if (
            ('hash' in item && item.revokedAt) ||
            ('withdrawnAt' in item && item.withdrawnAt)
          )
            return null;
          if ('hash' in item) item.revokedAt = now;
          else item.withdrawnAt = now;
          targetId = item.id;
          await this.recordActivity(
            manager,
            workspace.id,
            memberId,
            engagement,
            {
              action:
                'hash' in item
                  ? 'CLIENT_PORTAL_REVOKED'
                  : 'CLIENT_SHARE_WITHDRAWN',
              summary:
                'hash' in item
                  ? 'Revoked client portal access.'
                  : 'Withdrew a shared version from the client portal.',
              ...('taskId' in item
                ? {
                    sourceType: 'client-share',
                    sourceId: item.id,
                    taskId: item.taskId,
                  }
                : {}),
              changes: [
                {
                  field: 'state',
                  before: 'ACTIVE',
                  after: 'hash' in item ? 'REVOKED' : 'WITHDRAWN',
                },
              ],
            },
          );
        } else {
          const engagement = clients.engagements.find(
            (item) => item.id === command.engagementId,
          );
          if (!engagement) throw new NotFoundException();
          targetId = engagement.id;
          if (command.action === 'link') {
            const activeLinkCount = clients.links.filter(
              (item) => item.engagementId === engagement.id && !item.revokedAt,
            ).length;
            for (const link of clients.links.filter(
              (item) => item.engagementId === engagement.id && !item.revokedAt,
            ))
              link.revokedAt = now;
            result = `${workspace.id}.${randomBytes(32).toString('hex')}`;
            clients.links.push({
              id: randomUUID(),
              engagementId: engagement.id,
              hash: hashToken(result),
              codeHash: hashToken(accessCode),
              expiresAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ).toISOString(),
              revokedAt: null,
              createdBy: memberId,
            });
            await this.recordActivity(
              manager,
              workspace.id,
              memberId,
              engagement,
              {
                action: activeLinkCount
                  ? 'CLIENT_PORTAL_ROTATED'
                  : 'CLIENT_PORTAL_CREATED',
                summary: activeLinkCount
                  ? 'Rotated client portal access and revoked previous links.'
                  : 'Created expiring client portal access.',
                changes: [
                  {
                    field: 'linkCount',
                    before: String(activeLinkCount),
                    after: '1',
                  },
                ],
              },
            );
          } else if (command.action === 'accept') {
            const submission = engagement.submissions.find(
              (item) => item.id === command.submissionId,
            );
            if (!submission) throw new NotFoundException();
            if (submission.acceptedBy === memberId) return null;
            const previousReviewerId = submission.acceptedBy;
            submission.acceptedBy = memberId;
            await this.recordActivity(
              manager,
              workspace.id,
              memberId,
              engagement,
              {
                action: 'CLIENT_ONBOARDING_ACCEPTED',
                summary: 'Accepted a client onboarding submission.',
                outcome: 'ACCEPTED',
                changes: [
                  {
                    field: 'reviewerId',
                    before: previousReviewerId,
                    after: memberId,
                  },
                ],
              },
            );
          } else {
            const { task, assigneeId } = await this.creative.scope(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              command.taskId,
            );
            if (task.projectId !== engagement.projectId)
              throw new NotFoundException();
            if (task.revision !== command.revision)
              throw new ConflictException('Reload the task before sharing.');
            const sharedContent = clientShareContent(
              task.details,
              command.kind,
            );
            const { version } = sharedContent;
            if (
              clients.shares.some(
                (item) =>
                  item.engagementId === engagement.id &&
                  item.taskId === task.taskId &&
                  item.version === version &&
                  item.kind === command.kind &&
                  !item.withdrawnAt,
              )
            )
              throw new ConflictException('This version is already shared.');
            const titles: { title: string }[] = await manager.query(
              `SELECT title FROM ${this.delivery.schema(workspace)}.task WHERE id=$1`,
              [task.taskId],
            );
            const shareId = randomUUID();
            clients.shares.push({
              id: shareId,
              engagementId: engagement.id,
              taskId: task.taskId,
              kind: command.kind,
              title: titles[0].title,
              ...sharedContent,
              createdAt: now,
              sharedBy: memberId,
              withdrawnAt: null,
              reviews: [],
            });
            await this.recordActivity(
              manager,
              workspace.id,
              memberId,
              engagement,
              {
                action: 'CLIENT_SHARE_CREATED',
                summary:
                  'Shared an approved work version with the client portal.',
                sourceType: 'client-share',
                sourceId: shareId,
                taskId: task.taskId,
                subjectMemberId: assigneeId,
                changes: [
                  { field: 'shareKind', before: null, after: command.kind },
                  {
                    field: 'shareVersion',
                    before: null,
                    after: String(version),
                  },
                  { field: 'state', before: null, after: 'ACTIVE' },
                ],
              },
            );
          }
        }
        clients.audit.push({
          at: now,
          actorId: memberId,
          action: command.action,
          targetId,
        });
        return result;
      },
      transactionManager,
    );
    return {
      ...(await this.snapshot(
        workspace,
        memberId,
        userWorkspaceId,
        transactionManager,
      )),
      token,
      accessCode: token ? accessCode : null,
    };
  }

  private async client<TResult>(
    credential: string,
    mode: 'read' | 'write',
    operation: (
      engagement: ClientEngagement,
      clients: DeliveryClients,
      operations: DeliveryOperations,
      manager: EntityManager,
      workspace: WorkspaceEntity,
    ) => Promise<TResult>,
  ) {
    const [token, accessCode = ''] = credential.split(':');
    if (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))
      throw new NotFoundException('Client portal unavailable.');
    const workspaceId = token.split('.')[0];
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(workspaceId))
      throw new NotFoundException();
    const apply = async (
      clients: DeliveryClients,
      operations: DeliveryOperations,
      manager: EntityManager,
    ) => {
      const link = clients.links.find(
        (item) =>
          item.hash === hashToken(token) &&
          item.codeHash === hashToken(accessCode) &&
          !item.revokedAt &&
          Date.parse(item.expiresAt) > Date.now(),
      );
      const engagement =
        link &&
        clients.engagements.find((item) => item.id === link.engagementId);
      const workspace = await manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: workspaceId });
      if (!engagement || !workspace)
        throw new NotFoundException('Client portal unavailable.');
      const projects = await manager
        .getRepository(DeliveryProjectEntity)
        .findOneBy({
          id: engagement.projectId,
          workspaceId,
          companyId: engagement.companyId,
        });
      const company: { id: string }[] = await manager.query(
        `SELECT id FROM ${this.delivery.schema(workspace)}.company WHERE id=$1 AND "deletedAt" IS NULL`,
        [engagement.companyId],
      );
      if (!projects || !company.length)
        throw new NotFoundException('Client portal unavailable.');
      return operation(engagement, clients, operations, manager, workspace);
    };
    return mode === 'read'
      ? this.read(workspaceId, apply)
      : this.transact(workspaceId, apply);
  }

  async portal(token: string) {
    return this.client(
      token,
      'read',
      async (engagement, clients, operations, manager, workspace) => ({
        commitments: await this.commitments.portalSummary(
          workspace,
          engagement,
          operations,
          manager,
        ),
        engagement: {
          name: engagement.name,
          services: engagement.services,
          billing: engagement.billing,
          scope: engagement.scope,
          allowance: engagement.allowance,
          contact: engagement.contact,
          revision: engagement.revision,
          fields: engagement.fields,
        },
        advertising:
          engagement.advertising &&
          hasPerformanceMarketingService(engagement.services)
            ? {
                currency: engagement.advertising.currency,
                channel: engagement.advertising.channel,
                period: engagement.advertising.period,
                requests: (operations.business?.records ?? [])
                  .filter(
                    (record) =>
                      record.kind === 'BUDGET' &&
                      record.clientEngagementId === engagement.id,
                  )
                  .map((record) => ({
                    id: record.id,
                    clientRequestId:
                      record.kind === 'BUDGET' ? record.clientRequestId : null,
                    clientRequestRevision:
                      record.kind === 'BUDGET'
                        ? record.clientRequestRevision
                        : null,
                    amount: record.kind === 'BUDGET' ? record.amount : 0,
                    currency: record.kind === 'BUDGET' ? record.currency : '',
                    channel: record.kind === 'BUDGET' ? record.channel : '',
                    period: record.kind === 'BUDGET' ? record.period : '',
                    reason: record.kind === 'BUDGET' ? record.reason : '',
                    status: record.status,
                    createdAt: record.createdAt,
                  })),
              }
            : null,
        assets: engagement.assets ?? [],
        submissions: engagement.submissions.map(({ acceptedBy, ...item }) => ({
          ...item,
          accepted: Boolean(acceptedBy),
        })),
        shares: clients.shares
          .filter(
            (item) => item.engagementId === engagement.id && !item.withdrawnAt,
          )
          .map(
            ({
              id,
              version,
              kind,
              title,
              content,
              links,
              assetId,
              reviews,
            }) => ({
              id,
              version,
              kind,
              title,
              content,
              links,
              hasAsset: Boolean(assetId),
              reviews,
            }),
          ),
      }),
    );
  }

  async respond(token: string, input: unknown) {
    const parsed = clientResponseSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Check your response.');
    const command = parsed.data;
    await this.client(
      token,
      'write',
      async (engagement, clients, operations, manager, workspace) => {
        const now = new Date().toISOString();
        if (command.action === 'budget') {
          if (
            !engagement.advertising ||
            !hasPerformanceMarketingService(engagement.services)
          )
            throw new ForbiddenException();
          operations.business ??= newDeliveryBusiness();
          const previousRequest = operations.business.records.find(
              (record) =>
                record.clientEngagementId === engagement.id &&
                record.clientRequestId === command.requestId,
          );
          if (previousRequest) {
            if (
              previousRequest.kind !== 'BUDGET' ||
              previousRequest.amount !== command.amount ||
              previousRequest.reason !== command.reason ||
              (previousRequest.clientRequestRevision !== undefined &&
                previousRequest.clientRequestRevision !== command.revision)
            )
              throw new ConflictException(
                'This request ID belongs to a different budget request. Check the saved request before submitting again.',
              );
            return;
          }
          if (engagement.revision !== command.revision)
            throw new ConflictException(
              'Reload the portal before requesting a budget change.',
            );
          const reviewer = await this.advertisingManager(
            workspace,
            engagement,
            manager,
          );
          const configuration = engagement.advertising;
          const title =
            `Client advertising budget request: ${engagement.name}`.slice(
              0,
              240,
            );
          const taskId = await this.delivery.command(
            workspace,
            reviewer.id,
            reviewer.userWorkspaceId,
            {
              action: 'create',
              projectId: engagement.projectId,
              fields: {
                title,
                brief: `Review the client budget request in Business tools > Ads. Do not apply until the project manager approves. Requested ${configuration.currency} ${(command.amount / 100).toFixed(2)} ${configuration.period}: ${command.reason}`,
                service: 'BUDGET',
                priority: 'NORMAL',
                scheduledDate: null,
                dueAt: null,
                assigneeId: configuration.marketerId,
                reviewerId: reviewer.id,
                checklist: [],
                evidence: [],
              },
            },
            manager,
            { actorType: 'CLIENT', actorId: null },
          );
          if (typeof taskId !== 'string')
            throw new BadRequestException(
              'Could not create budget review task.',
            );
          const budgetId = randomUUID();
          operations.business.records.push({
            id: budgetId,
            revision: 1,
            kind: 'BUDGET',
            projectId: engagement.projectId,
            title,
            ...configuration,
            amount: command.amount,
            reason: command.reason,
            clientEngagementId: engagement.id,
            clientRequestId: command.requestId,
            clientRequestRevision: command.revision,
            createdBy: 'CLIENT',
            createdAt: now,
            updatedAt: now,
            status: 'REVIEW',
            decisionBy: null,
            evidence: null,
            taskId,
            history: [
              {
                at: now,
                actorId: 'CLIENT',
                action: 'REQUESTED',
                note: command.reason,
              },
            ],
          });
          operations.notices.push({
            id: randomUUID(),
            taskId,
            recipientId: reviewer.id,
            senderId: 'CLIENT',
            kind: 'MESSAGE',
            text: title,
            createdAt: now,
            remindAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            seenAt: null,
            acknowledgedAt: null,
            cancelled: false,
            sendState: 'PENDING',
            attemptedAt: null,
            error: null,
          });
          await this.recordActivity(manager, workspace.id, null, engagement, {
            action: 'CLIENT_BUDGET_REQUESTED',
            summary:
              'The client requested an advertising budget change for review.',
            sourceType: 'budget',
            sourceId: budgetId,
            taskId,
            subjectMemberId: configuration.marketerId,
            changes: [
              { field: 'state', before: null, after: 'REVIEW' },
              {
                field: 'assigneeId',
                before: null,
                after: configuration.marketerId,
              },
              { field: 'reviewerId', before: null, after: reviewer.id },
            ],
          });
        } else if (command.action === 'onboard') {
          if (
            engagement.submissions.some((item) => item.id === command.requestId)
          )
            return;
          if (engagement.revision !== command.revision)
            throw new ConflictException(
              'The form changed. Reload before submitting.',
            );
          if (
            Object.keys(command.answers).some(
              (id) => !engagement.fields.some((field) => field.id === id),
            ) ||
            engagement.fields.some(
              (field) => field.required && !command.answers[field.id],
            )
          )
            throw new BadRequestException('Complete the required fields.');
          engagement.submissions.push({
            id: command.requestId,
            at: now,
            formRevision: engagement.revision,
            answers: engagement.fields.map((field) => ({
              label: field.label,
              value: command.answers[field.id] ?? '',
            })),
            acceptedBy: null,
          });
          await this.recordActivity(manager, workspace.id, null, engagement, {
            action: 'CLIENT_ONBOARDING_SUBMITTED',
            summary: 'The client submitted an onboarding form.',
            changes: [
              {
                field: 'revision',
                before: null,
                after: String(engagement.revision),
              },
              {
                field: 'submissionCount',
                before: String(engagement.submissions.length - 1),
                after: String(engagement.submissions.length),
              },
            ],
          });
        } else {
          const share = clients.shares.find(
            (item) =>
              item.id === command.shareId &&
              item.engagementId === engagement.id &&
              !item.withdrawnAt,
          );
          if (!share) throw new NotFoundException();
          if (share.reviews.some((item) => item.id === command.requestId))
            return;
          share.reviews.push({
            id: command.requestId,
            at: now,
            decision: command.decision,
            comment: command.comment,
          });
          const task = await manager
            .getRepository(DeliveryTaskEntity)
            .findOneBy({
              workspaceId: workspace.id,
              taskId: share.taskId,
              projectId: engagement.projectId,
            });
          const nativeTasks: { assigneeId: string | null }[] = task
            ? await manager.query(
                `SELECT "assigneeId" FROM ${this.delivery.schema(workspace)}.task WHERE id=$1`,
                [task.taskId],
              )
            : [];
          const changes: OtogrowActivityInput['changes'] = [
            { field: 'shareKind', before: null, after: share.kind },
            {
              field: 'shareVersion',
              before: null,
              after: String(share.version),
            },
          ];
          if (command.decision === 'CHANGES_REQUESTED') {
            if (!task) throw new NotFoundException();
            task.details.events.push({
              id: randomUUID(),
              actorId: 'CLIENT',
              action: 'CLIENT_CHANGES_REQUESTED',
              text: `Client requested changes to ${share.kind} v${share.version}: ${command.comment}`,
              at: now,
            });
            // All objections reach the manager, including objections to an earlier shared version.
            const fulfilment = operations.fulfilments.find(
              (item) => item.taskId === task.taskId,
            );
            if (fulfilment) {
              changes.push({
                field: 'fulfilmentStatus',
                before: fulfilment.status,
                after: 'WAITING',
              });
              fulfilment.status = 'WAITING';
              fulfilment.nextCheckAt = now;
              fulfilment.history.push({
                at: now,
                actorId: 'CLIENT',
                action: 'CLIENT_OBJECTION',
                note: command.comment,
              });
            }
            changes.push({
              field: 'taskRevision',
              before: String(task.revision),
              after: String(task.revision + 1),
            });
            task.revision += 1;
            await manager.getRepository(DeliveryTaskEntity).save(task);
            await syncDeliveryCommitment(
              manager,
              workspace.id,
              task.taskId,
              task.details,
              fulfilment,
              { actorId: null, actorType: 'CLIENT' },
            );
            operations.notices.push({
              id: randomUUID(),
              taskId: task.taskId,
              recipientId: task.details.reviewerId,
              senderId: 'CLIENT',
              kind: 'MESSAGE',
              text: `Client requested changes: ${command.comment}`,
              createdAt: now,
              remindAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              seenAt: null,
              acknowledgedAt: null,
              cancelled: false,
              sendState: 'PENDING',
              attemptedAt: null,
              error: null,
            });
          }
          await this.recordActivity(manager, workspace.id, null, engagement, {
            action: 'CLIENT_SHARE_REVIEWED',
            summary:
              command.decision === 'COMMENT'
                ? 'The client commented on a shared version.'
                : command.decision === 'APPROVED'
                  ? 'The client approved a shared version.'
                  : 'The client requested changes to a shared version.',
            sourceType: 'client-share',
            sourceId: share.id,
            taskId: share.taskId,
            subjectMemberId: nativeTasks[0]?.assigneeId,
            outcome:
              command.decision === 'COMMENT' ? 'RECORDED' : command.decision,
            changes,
          });
        }
        clients.audit.push({
          at: now,
          actorId: 'CLIENT',
          action: command.action,
          targetId: engagement.id,
        });
      },
    );
    return this.portal(token);
  }

  async upload(
    token: string,
    asset: ClientBrandAsset,
    write: (path: string) => Promise<void>,
  ) {
    await this.client(
      token,
      'write',
      async (engagement, _clients, _operations, manager, workspace) => {
        engagement.assets ??= [];
        if (
          engagement.assets.length >= 30 ||
          engagement.assets.reduce((size, item) => size + item.size, 0) +
            asset.size >
            100 * 1024 * 1024
        )
          throw new BadRequestException(
            'Brand asset allowance reached. Ask your manager to review existing files.',
          );
        await write(
          `${workspace.id}/delivery-client/${engagement.id}/${asset.id}`,
        );
        engagement.assets.push(asset);
        await this.recordActivity(manager, workspace.id, null, engagement, {
          action: 'CLIENT_BRAND_ASSET_UPLOADED',
          summary: 'The client uploaded a brand asset.',
          changes: [
            {
              field: 'assetCount',
              before: String(engagement.assets.length - 1),
              after: String(engagement.assets.length),
            },
          ],
        });
      },
    );
  }

  async brandAsset(token: string, assetId: string) {
    return this.client(
      token,
      'read',
      async (engagement, _clients, _operations, _manager, workspace) => {
        const asset = engagement.assets?.find((item) => item.id === assetId);
        if (!asset) throw new NotFoundException();
        return {
          asset,
          path: `${workspace.id}/delivery-client/${engagement.id}/${asset.id}`,
        };
      },
    );
  }

  async staffBrandAsset(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    engagementId: string,
    assetId: string,
  ) {
    return this.read(workspace.id, async (clients, _operations, manager) => {
      await this.manager(workspace, memberId, userWorkspaceId, manager);
      const engagement = clients.engagements.find(
        (item) => item.id === engagementId,
      );
      const asset = engagement?.assets?.find((item) => item.id === assetId);
      if (!asset || !engagement) throw new NotFoundException();
      return {
        asset,
        path: `${workspace.id}/delivery-client/${engagement.id}/${asset.id}`,
      };
    });
  }

  async asset(token: string, shareId: string) {
    return this.client(
      token,
      'read',
      async (engagement, clients, _operations, manager, workspace) => {
        const share = clients.shares.find(
          (item) =>
            item.id === shareId &&
            item.engagementId === engagement.id &&
            !item.withdrawnAt,
        );
        const task =
          share &&
          (await manager.getRepository(DeliveryTaskEntity).findOneBy({
            workspaceId: workspace.id,
            taskId: share.taskId,
            projectId: engagement.projectId,
          }));
        const asset = task?.details.creative?.assets.find(
          (item) => item.id === share?.assetId && item.storageState === 'READY',
        );
        if (!asset || !share) throw new NotFoundException();
        return {
          asset,
          path: `${workspace.id}/delivery-creative/${share.taskId}/${asset.id}`,
        };
      },
    );
  }
}
