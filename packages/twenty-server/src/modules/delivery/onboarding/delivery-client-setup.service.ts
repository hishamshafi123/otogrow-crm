import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { engagementSchema } from 'src/modules/delivery/clients/delivery-clients.types';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { resolveEffectiveClientCompanyIds } from 'src/modules/delivery/clients/delivery-client-hub.policy';
import { DeliveryClientSetupEntity } from 'src/modules/delivery/onboarding/entities/delivery-client-setup.entity';
import {
  clientSetupContextSchema,
  clientSetupCreateSchema,
  clientSetupReceiptSchema,
  clientSetupHash,
  parseClientSetup,
  type ClientSetupCompany,
} from 'src/modules/delivery/onboarding/delivery-client-setup.policy';
import {
  type DeliveryClientServiceCatalogDTO,
  type DeliveryClientSetupContextDTO,
  type DeliveryClientSetupContextInput,
  type DeliveryClientSetupCreateInput,
  type DeliveryClientSetupPlanDTO,
  type DeliveryClientSetupReceiptDTO,
  type DeliveryClientSetupReceiptInput,
} from 'src/modules/delivery/onboarding/delivery-client-setup.dto';

const DIRECTORY_LIMIT = 2000;
const serviceNameKey = (name: string) =>
  name.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
const planSchema = engagementSchema.extend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  companyId: z.uuid(),
});
type SetupPlan = z.infer<typeof planSchema>;
@Injectable()
export class DeliveryClientSetupService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly clients: DeliveryClientsService,
    private readonly access: OtogrowAccessService,
    private readonly companies: DeliveryClientSetupSourceService,
  ) {}
  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user')
      throw new ForbiddenException('Sign in to set up client work.');
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
        'Current delivery management access is required to set up client work.',
      );
    return { identity, workspace };
  }
  async serviceCatalog(
    auth: WorkspaceAuthContext,
  ): Promise<DeliveryClientServiceCatalogDTO> {
    const identity = this.identity(auth);
    return readDeliverySnapshot(
      this.dataSource,
      identity.workspaceId,
      async (manager) => {
        await this.authorize(auth, manager);
        const record = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({
            workspaceId: identity.workspaceId,
          });
        return { ...identity, services: record?.state.serviceCatalog ?? [] };
      },
    );
  }
  async addService(
    auth: WorkspaceAuthContext,
    name: string,
  ): Promise<DeliveryClientServiceCatalogDTO> {
    const identity = this.identity(auth);
    if (typeof name !== 'string' || /[,\u0000-\u001f\u007f]/u.test(name))
      throw new BadRequestException(
        'Use a service name without commas or control characters.',
      );
    const normalized = name.trim().replace(/\s+/gu, ' ');
    if (!normalized || normalized.length > 100)
      throw new BadRequestException(
        'Service names must contain 1 to 100 characters.',
      );
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${identity.workspaceId}`],
      );
      await this.authorize(auth, manager);
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const record =
        (await repository.findOneBy({ workspaceId: identity.workspaceId })) ??
        repository.create({
          workspaceId: identity.workspaceId,
          state: newDeliveryOperations(),
        });
      const services = record.state.serviceCatalog ?? [];
      if (
        services.some(
          (service) => serviceNameKey(service) === serviceNameKey(normalized),
        )
      )
        return { ...identity, services };
      if (services.length >= 200)
        throw new BadRequestException(
          'The workspace service catalog supports up to 200 custom services.',
        );
      record.state.serviceCatalog = [...services, normalized];
      if (JSON.stringify(record.state).length > 10000000)
        throw new BadRequestException(
          'Operations history reached its storage limit. Contact an administrator for maintenance.',
        );
      await repository.save(record);
      await recordOtogrowActivity(manager, {
        workspaceId: identity.workspaceId,
        actorId: identity.memberId,
        category: 'CLIENT',
        action: 'CLIENT_SERVICE_CATALOG_UPDATED',
        outcome: 'RECORDED',
        summary: 'Added a reusable service to the workspace catalog.',
        sourceType: 'settings',
        sourceId: identity.workspaceId,
        changes: [
          {
            field: 'serviceCount',
            before: String(services.length),
            after: String(record.state.serviceCatalog.length),
          },
        ],
      });
      return { ...identity, services: record.state.serviceCatalog };
    });
  }
  private async company(
    auth: WorkspaceAuthContext,
    workspace: WorkspaceEntity,
    manager: EntityManager,
    companyId: string,
  ): Promise<ClientSetupCompany | null> {
    const authorized = await this.companies.read(auth, companyId);
    if (!authorized) return null;
    const rows: {
      id: string;
      name: string | null;
      updatedAt: Date | string;
    }[] = await manager.query(
      `SELECT id,name,"updatedAt" FROM ${this.delivery.schema(workspace)}.company WHERE id=$1 AND "deletedAt" IS NULL FOR SHARE`,
      [companyId],
    );
    if (!rows[0]) return null;
    const locked = {
      id: rows[0].id,
      name: rows[0].name ?? '',
      updatedAt: new Date(rows[0].updatedAt).toISOString(),
    };
    if (clientSetupHash(locked) !== authorized.sourceToken)
      throw new ConflictException(
        'The client company changed. Refresh its current details before continuing.',
      );
    return { ...locked, sourceToken: authorized.sourceToken };
  }
  private async plans(
    manager: EntityManager,
    workspaceId: string,
    projectId: string,
    engagementId?: string,
  ): Promise<SetupPlan[]> {
    const rows: { plan: unknown }[] = await manager.query(
      `SELECT jsonb_build_object(
      'id',plan->'id','revision',plan->'revision','projectId',plan->'projectId','companyId',plan->'companyId',
      'name',plan->'name','services',plan->'services','billing',plan->'billing','scope',plan->'scope',
      'allowance',plan->'allowance','contact',plan->'contact','fields',plan->'fields','advertising',plan->'advertising') AS plan
      FROM core."deliveryOperations" operations
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(operations.state->'clients'->'engagements','[]'::jsonb)) plan
      WHERE operations."workspaceId"=$1 AND plan->>'projectId'=$2 AND ($3::text IS NULL OR plan->>'id'=$3)
      ORDER BY plan->>'name',plan->>'id' LIMIT 2001`,
      [workspaceId, projectId, engagementId ?? null],
    );
    if (rows.length > DIRECTORY_LIMIT)
      throw new BadRequestException(
        'This project has too many service plans for guided setup. Open the existing client workspace.',
      );
    return rows.map(({ plan }) => {
      const parsed = planSchema.safeParse(plan);
      if (!parsed.success)
        throw new BadRequestException(
          'A saved service plan is unavailable. Review its current fields in Clients before continuing.',
        );
      return parsed.data;
    });
  }
  private planView(plan: SetupPlan): DeliveryClientSetupPlanDTO {
    return {
      id: plan.id!,
      revision: plan.revision,
      projectId: plan.projectId,
      name: plan.name,
      services: plan.services,
      billing: plan.billing,
      scope: plan.scope,
      allowance: plan.allowance,
      contact: plan.contact,
      fields: plan.fields,
      advertising: plan.advertising ?? null,
    };
  }
  async context(
    auth: WorkspaceAuthContext,
    input: DeliveryClientSetupContextInput,
  ): Promise<DeliveryClientSetupContextDTO> {
    const command = parseClientSetup(clientSetupContextSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      auth.workspace.id,
      async (manager) => {
        const { identity, workspace } = await this.authorize(auth, manager);
        const operationsRepo = manager.getRepository(DeliveryOperationsEntity);
        const operationsRecord =
          operationsRepo && typeof operationsRepo.findOneBy === 'function'
            ? await operationsRepo.findOneBy({ workspaceId: workspace.id })
            : null;
        let directory: {
          companies: ClientSetupCompany[];
          companiesHasMore: boolean;
        };
        if (
          !command.companySearch &&
          typeof this.companies.listByIds === 'function'
        ) {
          const effectiveClientIds = resolveEffectiveClientCompanyIds(
            operationsRecord?.state?.clientRoster,
          );
          const designatedCompanies = effectiveClientIds.length
            ? await this.companies.listByIds(auth, effectiveClientIds)
            : [];
          directory = {
            companies: designatedCompanies,
            companiesHasMore: false,
          };
        } else {
          directory = await this.companies.list(auth, command.companySearch);
        }
        const selectedCompany = command.companyId
          ? await this.company(auth, workspace, manager, command.companyId)
          : null;
        const projects = selectedCompany
          ? await manager.getRepository(DeliveryProjectEntity).find({
              where: {
                workspaceId: workspace.id,
                companyId: selectedCompany.id,
              },
              order: { name: 'ASC', id: 'ASC' },
              take: DIRECTORY_LIMIT + 1,
            })
          : [];
        const members = await this.access.listActiveMembers(
          workspace.id,
          manager,
        );
        if (
          projects.length > DIRECTORY_LIMIT ||
          members.length > DIRECTORY_LIMIT
        )
          throw new BadRequestException(
            'The setup directory is too large. Use the existing project workspace instead.',
          );
        if (
          command.projectId &&
          selectedCompany &&
          !projects.some((project) => project.id === command.projectId)
        )
          throw new NotFoundException(
            'The selected project is unavailable for this company.',
          );
        const roles = await this.access.listAccess(workspace.id, manager);
        const servicePlans =
          command.projectId && selectedCompany
            ? await this.plans(manager, workspace.id, command.projectId)
            : [];
        if (servicePlans.some((plan) => plan.companyId !== selectedCompany!.id))
          throw new ConflictException(
            'A service plan no longer matches this company. Open Clients to review it.',
          );
        return {
          ...identity,
          observedAt: new Date().toISOString(),
          companySearch: command.companySearch,
          companies: directory.companies.map(({ id, name, sourceToken }) => ({
            id,
            name,
            sourceToken,
          })),
          companiesHasMore: directory.companiesHasMore,
          selectedCompany: selectedCompany
            ? {
                id: selectedCompany.id,
                name: selectedCompany.name,
                sourceToken: selectedCompany.sourceToken,
              }
            : null,
          projects: projects.map(({ id, name, revision, memberIds }) => ({
            id,
            name,
            revision,
            memberIds,
          })),
          members: members.map((member) => {
            const capabilities =
              roles.find((role) => role.memberId === member.memberId)
                ?.capabilities ?? [];
            return {
              id: member.memberId,
              name: member.name,
              access: capabilities.includes('workspace.admin')
                ? 'ADMIN'
                : capabilities.includes('delivery.manage')
                  ? 'MANAGER'
                  : 'MEMBER',
            };
          }),
          servicePlans: servicePlans.map((plan) => this.planView(plan)),
        };
      },
    );
  }
  private async result(
    auth: WorkspaceAuthContext,
    manager: EntityManager,
    row: DeliveryClientSetupEntity,
    replayed: boolean,
  ): Promise<DeliveryClientSetupReceiptDTO> {
    const { identity, workspace } = await this.authorize(auth, manager);
    if (
      row.actorId !== identity.memberId ||
      row.userWorkspaceId !== identity.userWorkspaceId
    )
      throw new ForbiddenException(
        'This setup request belongs to another workspace member.',
      );
    if (!(await this.company(auth, workspace, manager, row.companyId)))
      throw new NotFoundException(
        'The saved client setup is no longer available with your current company access.',
      );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({
        workspaceId: workspace.id,
        id: row.projectId,
        companyId: row.companyId,
      });
    const plan = (
      await this.plans(manager, workspace.id, row.projectId, row.engagementId)
    )[0];
    if (!project || !plan || plan.companyId !== row.companyId)
      throw new NotFoundException(
        'The saved project or service plan is no longer available.',
      );
    if (
      row.taskId &&
      !(await manager.getRepository(DeliveryTaskEntity).findOneBy({
        workspaceId: workspace.id,
        taskId: row.taskId,
        projectId: row.projectId,
      }))
    )
      throw new NotFoundException(
        'The saved first task is no longer available.',
      );
    return {
      ...identity,
      requestId: row.requestId,
      companyId: row.companyId,
      projectId: row.projectId,
      engagementId: row.engagementId,
      taskId: row.taskId,
      createdAt: row.createdAt.toISOString(),
      replayed,
      reusedProject: row.reusedProject,
      reusedEngagement: row.reusedEngagement,
    };
  }
  async receipt(
    auth: WorkspaceAuthContext,
    input: DeliveryClientSetupReceiptInput,
  ): Promise<DeliveryClientSetupReceiptDTO | null> {
    const command = parseClientSetup(clientSetupReceiptSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      auth.workspace.id,
      async (manager) => {
        await this.authorize(auth, manager);
        const row = await manager
          .getRepository(DeliveryClientSetupEntity)
          .findOneBy({
            workspaceId: auth.workspace.id,
            requestId: command.requestId,
          });
        return row ? this.result(auth, manager, row, true) : null;
      },
    );
  }
  async create(
    auth: WorkspaceAuthContext,
    input: DeliveryClientSetupCreateInput,
  ): Promise<DeliveryClientSetupReceiptDTO> {
    const command = parseClientSetup(clientSetupCreateSchema, input);
    const requestHash = clientSetupHash(command);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${auth.workspace.id}`],
      );
      const { identity, workspace } = await this.authorize(auth, manager);
      const repository = manager.getRepository(DeliveryClientSetupEntity);
      const existing = await repository.findOneBy({
        workspaceId: workspace.id,
        requestId: command.requestId,
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException(
            'This request identity belongs to different setup inputs. Check the saved request before preparing another.',
          );
        return this.result(auth, manager, existing, true);
      }
      const company = await this.company(
        auth,
        workspace,
        manager,
        command.companyId,
      );
      if (!company)
        throw new NotFoundException(
          'Choose an active client company you can currently read.',
        );
      if (company.sourceToken !== command.companySourceToken)
        throw new ConflictException(
          'The client company changed. Refresh and review it before creating work.',
        );
      let projectId = command.projectId;
      if (projectId) {
        const project = await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({
            workspaceId: workspace.id,
            id: projectId,
            companyId: company.id,
          });
        if (!project)
          throw new NotFoundException(
            'Choose a project linked to this client company.',
          );
        if (project.revision !== command.projectRevision)
          throw new ConflictException(
            'The project team changed. Refresh it and review your first-work choices.',
          );
      } else {
        const created = await this.delivery.command(
          workspace,
          identity.memberId,
          identity.userWorkspaceId,
          {
            action: 'project',
            name: command.projectName,
            companyId: company.id,
            memberIds: command.memberIds,
          },
          manager,
        );
        if (typeof created !== 'string')
          throw new Error('Project creation did not return an identity.');
        projectId = created;
      }
      let engagementId = command.engagementId;
      if (engagementId) {
        const plan = (
          await this.plans(manager, workspace.id, projectId, engagementId)
        )[0];
        if (!plan || plan.companyId !== company.id)
          throw new NotFoundException(
            'The selected service plan is unavailable for this company and project.',
          );
        if (plan.revision !== command.engagementRevision)
          throw new ConflictException(
            'The service plan changed. Refresh and review its current scope.',
          );
      } else {
        const plan = await this.clients.saveSetupEngagement(
          workspace,
          identity.memberId,
          identity.userWorkspaceId,
          { ...command.plan!, projectId, revision: 0 },
          manager,
        );
        engagementId = plan.id;
      }
      let taskId: string | null = null;
      if (command.firstTask) {
        const created = await this.delivery.command(
          workspace,
          identity.memberId,
          identity.userWorkspaceId,
          {
            action: 'create',
            projectId,
            fields: {
              ...command.firstTask,
              checklist: command.firstTask.checklist.map((text) => ({
                id: randomUUID(),
                text,
                done: false,
              })),
            },
          },
          manager,
          undefined,
          {
            allowSelfReview:
              command.firstTask.assigneeId === command.firstTask.reviewerId,
          },
        );
        if (typeof created !== 'string')
          throw new Error('First task creation did not return an identity.');
        taskId = created;
      }
      const row = await repository.save({
        workspaceId: workspace.id,
        requestId: command.requestId,
        requestHash,
        actorId: identity.memberId,
        userWorkspaceId: identity.userWorkspaceId,
        companyId: company.id,
        projectId,
        engagementId,
        taskId,
        reusedProject: command.projectId !== null,
        reusedEngagement: command.engagementId !== null,
        source: {
          companyName: company.name,
          companySourceToken: company.sourceToken,
          projectRevision: command.projectRevision,
          engagementRevision: command.engagementRevision,
        },
      });
      const operationsRepo = manager.getRepository(DeliveryOperationsEntity);
      if (operationsRepo && typeof operationsRepo.save === 'function') {
        const operationsRecord =
          (await operationsRepo.findOneBy({ workspaceId: workspace.id })) ??
          (typeof operationsRepo.create === 'function'
            ? operationsRepo.create({
                workspaceId: workspace.id,
                state: newDeliveryOperations(),
              })
            : null);
        if (operationsRecord?.state) {
          const currentRoster = operationsRecord.state.clientRoster ?? {
            includedIds: [],
            excludedIds: [],
          };
          const included = new Set(currentRoster.includedIds);
          const excluded = new Set(currentRoster.excludedIds);
          if (!included.has(company.id) || excluded.has(company.id)) {
            included.add(company.id);
            excluded.delete(company.id);
            operationsRecord.state.clientRoster = {
              includedIds: [...included].sort(),
              excludedIds: [...excluded].sort(),
            };
            await operationsRepo.save(operationsRecord);
          }
        }
      }
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: identity.memberId,
        category: 'CLIENT',
        action: 'CLIENT_SETUP_CREATED',
        outcome: 'RECORDED',
        summary:
          'Recorded client work setup without sending a client link or starting billing.',
        sourceType: 'client-engagement',
        sourceId: engagementId,
        projectId,
        taskId,
        changes: [
          { field: 'projectId', before: null, after: projectId },
          { field: 'engagementId', before: null, after: engagementId },
        ].filter((change) => change.after !== null),
      });
      return this.result(auth, manager, row, false);
    });
  }
}
