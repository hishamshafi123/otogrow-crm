import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { deliveryNativeTaskSchema } from 'src/modules/delivery/native-task-visibility';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { DeliveryCompetitorSourceEntity } from './entities/delivery-competitor-source.entity';
import { DeliveryCompetitorSourceVersionEntity } from './entities/delivery-competitor-source-version.entity';
import {
  assertCompetitorEditor,
  canonicalCompetitorSource,
  competitorManager,
  competitorReviewer,
} from './delivery-competitor-source.policy';
import {
  type CompetitorSavedSourceBody,
  type CompetitorSourceSave,
} from './delivery-competitor.types';

@Injectable()
export class DeliveryCompetitorSourceService {
  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    readonly access: OtogrowAccessService,
  ) {}

  identity(
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    project?: DeliveryProjectEntity,
  ) {
    return {
      workspaceId: workspace.id,
      memberId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      isManager: competitorManager(access),
      observedAt: new Date().toISOString(),
      scope: advertisingHash([
        workspace.id,
        access.memberId,
        access.userWorkspaceId,
        [...access.roleIds].sort(),
        [...access.capabilities].sort(),
        project
          ? [
              project.id,
              project.revision,
              project.companyId,
              [...project.memberIds].sort(),
            ]
          : null,
      ]),
    };
  }

  read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    operation: (
      manager: EntityManager,
      access: OtogrowAccess,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) =>
        operation(
          manager,
          await this.access.accessForUser(
            workspace.id,
            memberId,
            userWorkspaceId,
            manager,
          ),
        ),
      transactionManager,
    );
  }

  async project(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    projectId: string,
  ) {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (
      !project ||
      (!competitorManager(access) &&
        !project.memberIds.includes(access.memberId))
    )
      throw new ForbiddenException(
        'This competitor research project is unavailable.',
      );
    if (project.companyId) {
      const clients: { id: string }[] = await manager.query(
        `SELECT id FROM "${deliveryNativeTaskSchema(workspace)}".company WHERE id=$1 AND "deletedAt" IS NULL`,
        [project.companyId],
      );
      if (!clients.length)
        throw new ForbiddenException(
          'This competitor research client is unavailable.',
        );
    }
    return project;
  }

  async choices(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    project: DeliveryProjectEntity,
  ) {
    const members = await this.access.listActiveMembers(workspace.id, manager);
    const grants = await this.access.listAccess(workspace.id, manager);
    const byMember = new Map(grants.map((grant) => [grant.memberId, grant]));
    const owners = members
      .filter((member) => {
        const grant = byMember.get(member.memberId);
        return (
          grant &&
          (project.memberIds.includes(member.memberId) ||
            competitorManager(grant))
        );
      })
      .map((member) => ({
        id: member.memberId,
        name: member.name || 'Workspace member',
      }));
    const reviewers = owners.filter((member) => {
      const grant = byMember.get(member.id);
      return grant && competitorReviewer(grant);
    });
    if (owners.length > 100)
      throw new BadRequestException(
        'This project has more than 100 eligible source owners. Narrow its team before assigning research.',
      );
    return { owners, reviewers };
  }

  async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    id: string,
    versionNumber?: number | null,
  ) {
    const source = await manager
      .getRepository(DeliveryCompetitorSourceEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!source)
      throw new NotFoundException('This competitor source is unavailable.');
    const project = await this.project(
      manager,
      workspace,
      access,
      source.projectId,
    );
    if (project.companyId !== source.companyId)
      throw new ForbiddenException(
        'The project client changed. Its earlier competitor evidence is withheld.',
      );
    const version = await manager
      .getRepository(DeliveryCompetitorSourceVersionEntity)
      .findOneBy({
        workspaceId: workspace.id,
        sourceId: id,
        version: versionNumber ?? source.currentVersion,
      });
    if (!version)
      throw new NotFoundException(
        'This competitor source version is unavailable.',
      );
    if (
      version.companyId !== source.companyId ||
      version.body.projectId !== project.id
    )
      throw new ForbiddenException(
        'This competitor source version is outside the current project and client scope.',
      );
    return { source, project, version };
  }

  assertProjectVersion(
    project: DeliveryProjectEntity,
    input: {
      projectId: string;
      projectRevision: number;
      expectedCompanyId: string | null;
    },
  ) {
    if (
      project.id !== input.projectId ||
      project.revision !== input.projectRevision ||
      project.companyId !== input.expectedCompanyId
    )
      throw new ConflictException(
        'The project or client changed. Review its current scope before saving.',
      );
  }

  async eligible(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    project: DeliveryProjectEntity,
    ownerId: string,
    reviewerId: string,
  ) {
    const choices = await this.choices(manager, workspace, project);
    const owner = choices.owners.find((candidate) => candidate.id === ownerId);
    const reviewer = choices.reviewers.find(
      (candidate) => candidate.id === reviewerId,
    );
    if (!owner)
      throw new BadRequestException(
        'Choose a currently eligible source owner.',
      );
    if (!reviewer || ownerId === reviewerId)
      throw new BadRequestException(
        'Choose a different current project reviewer with delivery review permission.',
      );
    return { owner, reviewer };
  }

  async prepare(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    input: CompetitorSourceSave,
  ) {
    if (input.body.projectId !== input.projectId)
      throw new BadRequestException(
        'Use the same project for the source and its configuration.',
      );
    const project = await this.project(
      manager,
      workspace,
      access,
      input.projectId,
    );
    this.assertProjectVersion(project, input);
    const canonical = canonicalCompetitorSource(
      input.body.platform,
      input.body.accountReference,
    );
    const existing = await manager
      .getRepository(DeliveryCompetitorSourceEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.id });
    if (existing) {
      await this.selected(manager, workspace, access, existing.id);
      if (
        existing.projectId !== project.id ||
        existing.revision !== input.revision
      )
        throw new ConflictException(
          'This competitor source changed. Refresh before saving.',
        );
      assertCompetitorEditor(existing.ownerId, access);
      if (existing.status === 'ARCHIVED' && !competitorManager(access))
        throw new BadRequestException(
          'A delivery manager must update or restore this archived source.',
        );
      if (
        existing.platform !== input.body.platform ||
        existing.canonicalKey !== canonical.canonicalKey
      )
        throw new BadRequestException(
          'Create a new source to change the platform or public account, then archive the earlier source.',
        );
      if (
        !competitorManager(access) &&
        (existing.ownerId !== input.body.ownerId ||
          existing.reviewerId !== input.body.reviewerId)
      )
        throw new ForbiddenException(
          'Only a delivery manager can change the source owner or reviewer.',
        );
    } else {
      if (!competitorManager(access))
        throw new ForbiddenException(
          'Only a delivery manager can add a competitor source.',
        );
      if (input.revision !== 0)
        throw new ConflictException(
          'The original competitor source is unavailable.',
        );
    }
    const duplicate = await manager
      .getRepository(DeliveryCompetitorSourceEntity)
      .findOneBy({
        workspaceId: workspace.id,
        projectId: project.id,
        platform: input.body.platform,
        canonicalKey: canonical.canonicalKey,
      });
    if (
      duplicate &&
      duplicate.id !== input.id &&
      duplicate.companyId !== project.companyId
    )
      throw new ConflictException(
        'This source cannot be added in the current project scope. Use a separate project for the current client.',
      );
    if (duplicate && duplicate.id !== input.id)
      throw new ConflictException(
        'This public source is already saved in this project. Open the existing source, including archived sources.',
      );
    const { owner, reviewer } = await this.eligible(
      manager,
      workspace,
      project,
      input.body.ownerId,
      input.body.reviewerId,
    );
    const body: CompetitorSavedSourceBody = {
      ...input.body,
      ...canonical,
      ownerName: owner.name,
      reviewerName: reviewer.name,
    };
    return { project, source: existing, body };
  }
}
