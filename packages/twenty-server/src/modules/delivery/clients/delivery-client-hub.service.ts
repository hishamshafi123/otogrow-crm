import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import {
  applyClientRosterUpdate,
  buildClientHubSnapshot,
  normalizeClientRoster,
  parseClientRosterUpdate,
  resolveEffectiveClientCompanyIds,
  type ClientHubTaskSource,
} from 'src/modules/delivery/clients/delivery-client-hub.policy';

@Injectable()
export class DeliveryClientHubService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
    private readonly access: OtogrowAccessService,
    private readonly companies: DeliveryClientSetupSourceService,
  ) {}

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user')
      throw new ForbiddenException('Sign in to manage clients.');
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
      .findOneByOrFail({ id: identity.workspaceId });
    const actor = await this.delivery.actor(
      workspace,
      identity.memberId,
      identity.userWorkspaceId,
      manager,
    );
    if (!actor.isManager)
      throw new ForbiddenException(
        'Current delivery management access is required to manage clients.',
      );
    return { identity, workspace, actor };
  }

  async hub(auth: WorkspaceAuthContext) {
    const identity = this.identity(auth);
    return readDeliverySnapshot(
      this.dataSource,
      identity.workspaceId,
      async (manager) => {
        const { workspace, actor } = await this.authorize(auth, manager);
        const operations = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: workspace.id });
        const projects = await manager
          .getRepository(DeliveryProjectEntity)
          .find({
            where: { workspaceId: workspace.id },
            order: { name: 'ASC', id: 'ASC' },
          });

        const engagements = operations?.state.clients?.engagements ?? [];
        const links = operations?.state.clients?.links ?? [];
        const shares = operations?.state.clients?.shares ?? [];
        const businessRecords = operations?.state.business?.records ?? [];
        const roster = normalizeClientRoster(operations?.state.clientRoster);
        const clientFees = operations?.state.clientFees ?? {};

        const effectiveClientIds = resolveEffectiveClientCompanyIds(roster);

        const designatedCompanies = effectiveClientIds.length
          ? await this.companies.listByIds(auth, effectiveClientIds)
          : [];
        const designatedCompanySet = new Set(
          designatedCompanies.map((company) => company.id),
        );

        const clientProjectIds = projects
          .filter(
            (project) =>
              project.companyId && designatedCompanySet.has(project.companyId),
          )
          .map((project) => project.id);

        let tasks: ClientHubTaskSource[] = [];
        if (clientProjectIds.length) {
          const visibility = await this.nativeTasks.visibility(
            manager,
            workspace,
            {
              memberId: identity.memberId,
              userWorkspaceId: identity.userWorkspaceId,
            },
            ['id', 'title', 'assigneeId', 'dueAt'],
          );
          if (visibility) {
            const rows: {
              id: string;
              title: string;
              assigneeId: string | null;
              dueAt: Date | string | null;
              projectId: string;
              details: DeliveryDetails;
            }[] = await this.nativeTasks.query(
              manager,
              `SELECT t.id, t.title, t."assigneeId", t."dueAt", d."projectId", d.details FROM "core"."deliveryTask" d JOIN ${this.delivery.schema(workspace)}."task" t ON t.id = d."taskId" WHERE d."workspaceId" = $1 AND d."projectId" = ANY($2::uuid[]) AND t."deletedAt" IS NULL AND ${this.nativeTasks.predicate(workspace, visibility, 't.id')} ORDER BY t."dueAt" ASC NULLS LAST, t."createdAt" DESC`,
              [workspace.id, clientProjectIds],
              visibility,
            );
            tasks = rows;
          }
        }

        const members = await this.access.listActiveMembers(
          workspace.id,
          manager,
        );
        const memberNamesById = new Map(
          members.map((member) => [member.memberId, member.name]),
        );

        const financeReadable = canReadFinance(actor);
        const financeManageable = canManageFinance(actor);
        const snapshot = buildClientHubSnapshot({
          companies: designatedCompanies,
          roster,
          clientFees,
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            companyId: project.companyId,
            memberIds: project.memberIds,
          })),
          tasks,
          engagements,
          links: links.map((link) => ({
            id: link.id,
            engagementId: link.engagementId,
            expiresAt: link.expiresAt,
            revokedAt: link.revokedAt,
          })),
          shares,
          businessRecords,
          memberNamesById,
          canReadFinance: financeReadable,
          canManageFinance: financeManageable,
        });

        return {
          ...identity,
          observedAt: new Date().toISOString(),
          rosterConfigured:
            Boolean(operations?.state.clientRoster) ||
            effectiveClientIds.length > 0,
          includedCompanyIds: roster.includedIds,
          excludedCompanyIds: roster.excludedIds,
          summary: snapshot.summary,
          clients: snapshot.clients,
        };
      },
    );
  }

  async directoryCandidates(auth: WorkspaceAuthContext, search = '') {
    const identity = this.identity(auth);
    if (typeof search !== 'string' || search.length > 160)
      throw new BadRequestException(
        'Search terms must be 160 characters or fewer.',
      );
    return readDeliverySnapshot(
      this.dataSource,
      identity.workspaceId,
      async (manager) => {
        const { workspace } = await this.authorize(auth, manager);
        const operations = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: workspace.id });
        const projects = await manager
          .getRepository(DeliveryProjectEntity)
          .find({
            where: { workspaceId: workspace.id },
            select: { id: true, companyId: true },
          });

        const engagements = operations?.state.clients?.engagements ?? [];
        const roster = normalizeClientRoster(operations?.state.clientRoster);
        const includedSet = new Set(roster.includedIds);

        const projectsCountByCompany = new Map<string, number>();
        for (const project of projects) {
          if (!project.companyId) continue;
          projectsCountByCompany.set(
            project.companyId,
            (projectsCountByCompany.get(project.companyId) ?? 0) + 1,
          );
        }
        const engagementCompanySet = new Set(
          engagements.map((engagement) => engagement.companyId),
        );

        const effectiveClientSet = new Set(
          resolveEffectiveClientCompanyIds(roster),
        );

        const directory = await this.companies.searchDirectory(
          auth,
          search.trim(),
          100,
        );

        const mapped = directory.companies.map((company) => {
          const projectsCount = projectsCountByCompany.get(company.id) ?? 0;
          return {
            id: company.id,
            name: company.name,
            domainName: company.domainName,
            sourceToken: company.sourceToken,
            isClient: effectiveClientSet.has(company.id),
            isExplicitClient: includedSet.has(company.id),
            hasDeliveryWork:
              projectsCount > 0 || engagementCompanySet.has(company.id),
            projectsCount,
          };
        });

        mapped.sort((left, right) => {
          if (left.isClient !== right.isClient) return left.isClient ? -1 : 1;
          if (left.hasDeliveryWork !== right.hasDeliveryWork)
            return left.hasDeliveryWork ? -1 : 1;
          return left.name.localeCompare(right.name);
        });

        return {
          ...identity,
          search: search.trim(),
          hasMore: directory.hasMore,
          companies: mapped,
        };
      },
    );
  }

  async updateRoster(auth: WorkspaceAuthContext, input: unknown) {
    const identity = this.identity(auth);
    const command = parseClientRosterUpdate(input);

    const idsToVerify =
      command.action === 'add'
        ? command.companyIds
        : command.action === 'set'
          ? command.addIds
          : command.action === 'setFee'
            ? [command.companyId]
            : [];
    if (idsToVerify.length) {
      const readable = await this.companies.listByIds(auth, idsToVerify);
      const readableSet = new Set(readable.map((company) => company.id));
      const missing = idsToVerify.filter((id) => !readableSet.has(id));
      if (missing.length)
        throw new BadRequestException(
          'One or more selected companies are unavailable with your current CRM access.',
        );
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${identity.workspaceId}`],
      );
      const { workspace, actor } = await this.authorize(auth, manager);
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const record =
        (await repository.findOneBy({ workspaceId: workspace.id })) ??
        repository.create({
          workspaceId: workspace.id,
          state: newDeliveryOperations(),
        });

      const before = normalizeClientRoster(record.state.clientRoster);
      let next = before;

      if (command.action === 'setFee' || command.action === 'clearFee') {
        if (!canManageFinance(actor)) {
          throw new ForbiddenException(
            'Finance management access is required to update client billing terms.',
          );
        }
        const fees = { ...(record.state.clientFees ?? {}) };
        if (command.action === 'setFee') {
          fees[command.companyId] = {
            amount: command.amount,
            currency: command.currency,
            cadence: command.cadence,
            notes: command.notes ?? '',
            updatedAt: new Date().toISOString(),
          };
        } else {
          delete fees[command.companyId];
        }
        record.state.clientFees = fees;
      } else {
        next = applyClientRosterUpdate(before, command);
        record.state.clientRoster = next;
      }

      if (JSON.stringify(record.state).length > 10000000)
        throw new BadRequestException(
          'Operations history reached its storage limit. Contact an administrator for maintenance.',
        );

      await repository.save(record);

      const effectiveClientIds = resolveEffectiveClientCompanyIds(next);

      if (command.action === 'setFee' || command.action === 'clearFee') {
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: identity.memberId,
          category: 'CLIENT',
          action: 'CLIENT_FEE_UPDATED',
          outcome: 'RECORDED',
          summary:
            command.action === 'setFee'
              ? 'Updated agreed client billing fee.'
              : 'Cleared agreed client billing fee.',
          sourceType: 'settings',
          sourceId: command.companyId,
          changes:
            command.action === 'setFee'
              ? [
                  {
                    field: 'clientFee',
                    before: null,
                    after: `${command.currency} ${command.amount / 100} (${command.cadence})`,
                  },
                ]
              : [{ field: 'clientFee', before: 'configured', after: null }],
        });
      } else {
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: identity.memberId,
          category: 'CLIENT',
          action: 'CLIENT_ROSTER_UPDATED',
          outcome: 'RECORDED',
          summary: 'Updated which CRM companies appear in the Clients roster.',
          sourceType: 'settings',
          sourceId: workspace.id,
          changes: [
            {
              field: 'includedClientCount',
              before: String(before.includedIds.length),
              after: String(next.includedIds.length),
            },
            {
              field: 'excludedClientCount',
              before: String(before.excludedIds.length),
              after: String(next.excludedIds.length),
            },
          ],
        });
      }

      return {
        ...identity,
        includedIds: next.includedIds,
        excludedIds: next.excludedIds,
        effectiveClientIds,
      };
    });
  }
}
