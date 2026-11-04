import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { DeliveryCompetitorSourceEntity } from '../entities/delivery-competitor-source.entity';
import { DeliveryCompetitorSourceVersionEntity } from '../entities/delivery-competitor-source-version.entity';
import { DeliveryCompetitorSourceService } from '../delivery-competitor-source.service';
import { canonicalCompetitorSource } from '../delivery-competitor-source.policy';
import { type CompetitorSourceSave } from '../delivery-competitor.types';

const workspace = Object.assign(new WorkspaceEntity(), { id: randomUUID() });
const ownerId = randomUUID(),
  reviewerId = randomUUID(),
  managerId = randomUUID();
const actor = (
  memberId: string,
  capabilities: string[] = [],
): OtogrowAccess => ({
  workspaceId: workspace.id,
  memberId,
  userWorkspaceId: randomUUID(),
  nativeAdministrator: false,
  capabilities,
  roleIds: [],
  grants: [],
});
const project = Object.assign(new DeliveryProjectEntity(), {
  id: randomUUID(),
  workspaceId: workspace.id,
  revision: 3,
  companyId: null,
  memberIds: [ownerId, reviewerId],
  name: 'Internal research',
});
const body = {
  projectId: project.id,
  label: 'Example',
  platform: 'X' as const,
  accountReference: '@Example',
  ownerId,
  reviewerId,
  cadenceHours: 24,
  lookbackDays: 7,
  purpose: 'Learn from the launch.',
};

const setup = () => {
  const canonical = canonicalCompetitorSource('X', '@Example');
  const existing = Object.assign(new DeliveryCompetitorSourceEntity(), {
    id: randomUUID(),
    workspaceId: workspace.id,
    projectId: project.id,
    companyId: null,
    revision: 2,
    currentVersion: 1,
    status: 'ARCHIVED',
    platform: 'X' as const,
    canonicalKey: canonical.canonicalKey,
    ownerId: randomUUID(),
    reviewerId: randomUUID(),
  });
  const version = Object.assign(new DeliveryCompetitorSourceVersionEntity(), {
    workspaceId: workspace.id,
    sourceId: existing.id,
    version: 1,
    companyId: null,
    body: {
      ...body,
      ...canonical,
      ownerName: 'Owner',
      reviewerName: 'Reviewer',
    },
  });
  const repository = { findOneBy: jest.fn().mockResolvedValue(existing) };
  const entityManager = {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
  const source = new DeliveryCompetitorSourceService(
    {} as DataSource,
    {} as OtogrowAccessService,
  );
  jest.spyOn(source, 'project').mockResolvedValue(project);
  jest
    .spyOn(source, 'selected')
    .mockResolvedValue({ source: existing, project, version });
  const eligible = jest.spyOn(source, 'eligible').mockResolvedValue({
    owner: { id: ownerId, name: 'Current owner' },
    reviewer: { id: reviewerId, name: 'Current reviewer' },
  });
  const input: CompetitorSourceSave = {
    id: existing.id,
    requestId: randomUUID(),
    revision: existing.revision,
    projectId: project.id,
    projectRevision: project.revision,
    expectedCompanyId: null,
    body,
  };
  return { source, existing, eligible, entityManager, input, repository };
};

it('lets a manager repair removed assignees on an archived source while preserving its archived state', async () => {
  const { source, existing, eligible, entityManager, input } = setup();
  const prepared = await source.prepare(
    entityManager,
    workspace,
    actor(managerId, ['delivery.manage']),
    input,
  );
  expect(eligible).toHaveBeenCalledWith(
    entityManager,
    workspace,
    project,
    ownerId,
    reviewerId,
  );
  expect(prepared.body.ownerName).toBe('Current owner');
  expect(prepared.body.reviewerName).toBe('Current reviewer');
  expect(prepared.source?.status).toBe('ARCHIVED');
  expect(existing.ownerId).not.toBe(ownerId);
});

it('prevents an owner from editing archived configuration or reassigning its reviewer', async () => {
  const { source, existing, entityManager, input } = setup();
  await expect(
    source.prepare(entityManager, workspace, actor(existing.ownerId), input),
  ).rejects.toThrow('delivery manager');
  existing.status = 'PAUSED';
  await expect(
    source.prepare(entityManager, workspace, actor(existing.ownerId), input),
  ).rejects.toThrow('Only a delivery manager can change');
});

it('keeps project, client and canonical account identity fixed even for managers', async () => {
  const { source, entityManager, input } = setup();
  const manager = actor(managerId, ['delivery.manage']);
  await expect(
    source.prepare(entityManager, workspace, manager, {
      ...input,
      expectedCompanyId: randomUUID(),
    }),
  ).rejects.toThrow('project or client changed');
  await expect(
    source.prepare(entityManager, workspace, manager, {
      ...input,
      body: { ...body, projectId: randomUUID() },
    }),
  ).rejects.toThrow('same project');
  await expect(
    source.prepare(entityManager, workspace, manager, {
      ...input,
      body: { ...body, accountReference: '@Different' },
    }),
  ).rejects.toThrow('Create a new source');
});

it('validates current eligible assignees before accepting archived repair', async () => {
  const { source, eligible, entityManager, input } = setup();
  eligible.mockRejectedValue(
    new Error('Choose a currently eligible source owner.'),
  );
  await expect(
    source.prepare(
      entityManager,
      workspace,
      actor(managerId, ['delivery.manage']),
      input,
    ),
  ).rejects.toThrow('currently eligible');
});

it('does not offer an inaccessible earlier-client duplicate as an available source', async () => {
  const { source, existing, repository, entityManager, input } = setup();
  repository.findOneBy
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...existing, companyId: randomUUID() });
  await expect(
    source.prepare(
      entityManager,
      workspace,
      actor(managerId, ['delivery.manage']),
      { ...input, id: randomUUID(), revision: 0 },
    ),
  ).rejects.toThrow('Use a separate project for the current client.');
});

it('invalidates read scope when the actor, effective roles, project revision or client anchor changes', () => {
  const source = new DeliveryCompetitorSourceService(
    {} as DataSource,
    {} as OtogrowAccessService,
  );
  const manager = actor(managerId, ['delivery.manage']);
  const first = source.identity(workspace, manager, project).scope;
  expect(
    source.identity(
      workspace,
      { ...manager, userWorkspaceId: randomUUID() },
      project,
    ).scope,
  ).not.toBe(first);
  expect(
    source.identity(workspace, { ...manager, roleIds: [randomUUID()] }, project)
      .scope,
  ).not.toBe(first);
  expect(
    source.identity(
      workspace,
      manager,
      Object.assign(new DeliveryProjectEntity(), project, {
        revision: project.revision + 1,
      }),
    ).scope,
  ).not.toBe(first);
  expect(
    source.identity(
      workspace,
      manager,
      Object.assign(new DeliveryProjectEntity(), project, {
        companyId: randomUUID(),
      }),
    ).scope,
  ).not.toBe(first);
});
