import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryHandoffSourceService } from 'src/modules/delivery/handoffs/delivery-handoff-source.service';
import { DeliveryHandoffEntity } from 'src/modules/delivery/handoffs/entities/delivery-handoff.entity';
import { type DeliveryHandoffDTO } from 'src/modules/delivery/handoffs/delivery-handoffs.dto';
const SOURCE = z
  .object({ opportunityId: z.uuid(), quoteId: z.uuid() })
  .strict();
const CREATE = SOURCE.extend({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  projectName: z.string().trim().min(1).max(160),
  managerId: z.uuid(),
  reviewerId: z.uuid(),
  memberIds: z.array(z.uuid()).max(100),
  services: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  billing: z.enum(['ONE_TIME', 'RETAINER']),
  contact: z.string().trim().min(1).max(500),
  scheduledDate: z.iso.date().nullish(),
}).strict();
const parse = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the deal, delivery owners, services, billing arrangement and client contact.',
    );
  return parsed.data;
};
const view = (row: DeliveryHandoffEntity): DeliveryHandoffDTO => ({
  id: row.id,
  opportunityId: row.opportunityId,
  projectId: row.projectId,
  engagementId: row.engagementId,
  managerId: row.managerId,
  reviewerId: row.reviewerId,
  setupTaskIds: row.setupTaskIds,
  createdAt: row.createdAt.toISOString(),
});
@Injectable()
export class DeliveryHandoffsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly clients: DeliveryClientsService,
    private readonly access: OtogrowAccessService,
    private readonly source: DeliveryHandoffSourceService,
  ) {}
  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user')
      throw new ForbiddenException('Sign in as a workspace member.');
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }
  private async authorize(auth: WorkspaceAuthContext, manager: EntityManager) {
    const identity = this.identity(auth);
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: auth.workspace.id });
    const actor = await this.delivery.actor(
      workspace,
      identity.memberId,
      identity.userWorkspaceId,
      manager,
    );
    if (!actor.isManager || !canReadFinance(actor))
      throw new ForbiddenException(
        'Delivery management and finance read access are required for sales handoff.',
      );
    return { identity, workspace };
  }
  async directory(auth: WorkspaceAuthContext, input: unknown) {
    const search = parse(z.string().trim().max(160), input ?? '');
    return readDeliverySnapshot(
      this.dataSource,
      auth.workspace.id,
      async (manager) => {
        const { identity } = await this.authorize(auth, manager);
        const directory = await this.source.list(auth, search);
        const rows = directory.opportunities.length
          ? await manager.getRepository(DeliveryHandoffEntity).find({
              where: {
                workspaceId: auth.workspace.id,
                opportunityId: In(directory.opportunities.map((row) => row.id)),
              },
            })
          : [];
        return { ...identity, search, ...directory, handoffs: rows.map(view) };
      },
    );
  }
  async preview(auth: WorkspaceAuthContext, input: unknown) {
    const parsed = parse(SOURCE, input);
    return readDeliverySnapshot(
      this.dataSource,
      auth.workspace.id,
      async (manager) => {
        const { identity } = await this.authorize(auth, manager);
        return {
          ...identity,
          source: await this.source.read(
            auth,
            parsed.opportunityId,
            parsed.quoteId,
          ),
        };
      },
    );
  }
  async create(
    auth: WorkspaceAuthContext,
    input: unknown,
  ): Promise<DeliveryHandoffDTO> {
    const parsed = parse(CREATE, input);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${auth.workspace.id}`],
      );
      const { identity, workspace } = await this.authorize(auth, manager);
      await this.source.read(auth, parsed.opportunityId, parsed.quoteId);
      const repository = manager.getRepository(DeliveryHandoffEntity);
      const existing = await repository.findOneBy({
        workspaceId: auth.workspace.id,
        opportunityId: parsed.opportunityId,
      });
      if (existing) return view(existing);
      const schema = this.delivery.schema(workspace);
      // Freeze the accepted source while delivery records are created; native CRM reads still enforce their own permissions.
      await manager.query(
        `SELECT id FROM ${schema}.opportunity WHERE id=$1 FOR UPDATE`,
        [parsed.opportunityId],
      );
      await manager.query(
        `SELECT id FROM ${schema}.quote WHERE id=$1 FOR UPDATE`,
        [parsed.quoteId],
      );
      await manager.query(
        `SELECT id FROM ${schema}."quoteLineItem" WHERE "quoteId"=$1 FOR UPDATE`,
        [parsed.quoteId],
      );
      const source = await this.source.read(
        auth,
        parsed.opportunityId,
        parsed.quoteId,
      );
      if (source.fingerprint !== parsed.fingerprint)
        throw new ConflictException(
          'The deal or accepted quote changed. Reload its preview before creating delivery work.',
        );
      const members = await this.access.listAccess(auth.workspace.id, manager);
      for (const id of [parsed.managerId, parsed.reviewerId]) {
        if (
          !members
            .find((member) => member.memberId === id)
            ?.capabilities.includes('delivery.manage')
        )
          throw new BadRequestException(
            'Choose active delivery managers for the owner and independent reviewer.',
          );
      }
      if (parsed.managerId === parsed.reviewerId)
        throw new BadRequestException(
          'The setup owner and final reviewer must be different people.',
        );
      const memberIds = [
        ...new Set([...parsed.memberIds, parsed.managerId, parsed.reviewerId]),
      ];
      if (
        memberIds.some(
          (id) => !members.some((member) => member.memberId === id),
        )
      )
        throw new BadRequestException(
          'One of the selected teammates is no longer active.',
        );
      const projectId = await this.delivery.command(
        workspace,
        identity.memberId,
        identity.userWorkspaceId,
        {
          action: 'project',
          name: parsed.projectName,
          companyId: source.companyId,
          memberIds,
        },
        manager,
      );
      if (typeof projectId !== 'string')
        throw new Error('Project creation did not return an identity.');
      const result = await this.clients.command(
        workspace,
        identity.memberId,
        identity.userWorkspaceId,
        {
          action: 'engagement',
          engagement: {
            revision: 0,
            projectId,
            name: parsed.projectName,
            services: [...new Set(parsed.services)],
            billing: parsed.billing,
            scope: source.scope,
            allowance:
              'Not configured. Confirm quantities and the first delivery period before planning production.',
            contact: parsed.contact,
            fields: [
              {
                id: randomUUID(),
                label: 'Brand website and product links',
                required: true,
              },
              {
                id: randomUUID(),
                label: 'Logo and brand guidelines links',
                required: true,
              },
              {
                id: randomUUID(),
                label: 'Goals, references and additional instructions',
                required: false,
              },
            ],
          },
        },
        manager,
      );
      const engagement = result.engagements.find(
        (row) => row.projectId === projectId,
      );
      if (!engagement)
        throw new Error('Client setup did not return an engagement.');
      const setupTaskIds: string[] = [];
      for (const step of [
        {
          title: 'Collect and approve brand onboarding',
          brief:
            'Use the client engagement to share the onboarding form, collect brand assets and accept the completed response. Creating this handoff has not sent a client link.',
          checklist: [
            'Provide the onboarding form to the client',
            'Review required answers and brand assets',
            'Accept the onboarding response',
          ],
        },
        {
          title: 'Confirm billing and payment schedule',
          brief:
            'Ask the finance owner to reconcile the accepted quote with the agreed payment arrangement. Record receivables and payment dates in Finance. The quote and this handoff are not evidence that payment was received.',
          checklist: [
            'Confirm one-time or retainer billing terms',
            'Record the payment schedule and outstanding receivable',
            'Check payment evidence with the finance owner',
          ],
        },
        {
          title: 'Plan the first delivery period',
          brief:
            'Set the engagement commitments and first period. Map quantities explicitly; quote quantities do not automatically mean unique videos or variations. Apply appropriate service workflows and assign the first work after checking team capacity.',
          checklist: [
            'Confirm deliverable quantities and unique-video versus variation units',
            'Configure the first commitment period',
            'Plan and assign the first batch or service tasks',
          ],
        },
      ]) {
        const taskId = await this.delivery.command(
          workspace,
          identity.memberId,
          identity.userWorkspaceId,
          {
            action: 'create',
            projectId,
            fields: {
              title: step.title,
              brief: step.brief,
              service: 'Client setup',
              priority: 'HIGH',
              scheduledDate: parsed.scheduledDate ?? null,
              dueAt: null,
              assigneeId: parsed.managerId,
              reviewerId: parsed.reviewerId,
              checklist: step.checklist.map((text) => ({
                id: randomUUID(),
                text,
                done: false,
              })),
              evidence: [],
            },
          },
          manager,
        );
        if (typeof taskId !== 'string')
          throw new Error('Setup task creation did not return an identity.');
        setupTaskIds.push(taskId);
      }
      const row = await repository.save({
        workspaceId: auth.workspace.id,
        opportunityId: source.opportunityId,
        projectId,
        engagementId: engagement.id,
        managerId: parsed.managerId,
        reviewerId: parsed.reviewerId,
        createdBy: identity.memberId,
        source,
        setupTaskIds,
      });
      await recordOtogrowActivity(manager, {
        workspaceId: auth.workspace.id,
        actorId: identity.memberId,
        actorType: 'HUMAN',
        subjectMemberId: parsed.managerId,
        category: 'CLIENT',
        action: 'SALES_HANDOFF_CREATED',
        outcome: 'RECORDED',
        summary: 'Created client setup from a won deal and accepted quote.',
        projectId,
        sourceType: 'client-engagement',
        sourceId: engagement.id,
        changes: [
          {
            field: 'handoffOpportunityId',
            before: null,
            after: source.opportunityId,
          },
          { field: 'handoffQuoteId', before: null, after: source.quoteId },
          {
            field: 'handoffTaskCount',
            before: '0',
            after: String(setupTaskIds.length),
          },
        ],
      });
      return view(row);
    });
  }
}
