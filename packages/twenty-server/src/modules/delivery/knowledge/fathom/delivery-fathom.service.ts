import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryFathomConnectionEntity } from 'src/modules/delivery/knowledge/fathom/entities/delivery-fathom-connection.entity';
import { DeliveryFathomAdapter } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.adapter';
import {
  fathomHash,
  fathomMeetingsInput,
  fathomPreviewInput,
  fathomProofSchema,
  fathomSettingsInput,
  normalizeFathomUrl,
  parseFathomInput,
} from 'src/modules/delivery/knowledge/fathom/delivery-fathom.policy';
import {
  type FathomMeeting,
  type FathomProof,
  type FathomProvenance,
} from 'src/modules/delivery/knowledge/fathom/delivery-fathom.types';

@Injectable()
export class DeliveryFathomService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly encryption: SecretEncryptionService,
    private readonly adapter: DeliveryFathomAdapter,
  ) {}
  private async administrator(
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
        'Only current workspace administrators can use the connected Fathom account. Other contributors can paste or import a local transcript.',
      );
    return actor;
  }
  private identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    actor: Awaited<ReturnType<DeliveryService['actor']>>,
  ) {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor,
      observedAt: new Date().toISOString(),
    };
  }
  private connection(manager: EntityManager, workspaceId: string) {
    return manager
      .getRepository(DeliveryFathomConnectionEntity)
      .createQueryBuilder('connection')
      .addSelect('connection.apiKey')
      .where('connection."workspaceId"=:workspaceId', { workspaceId })
      .getOne();
  }
  private async settingsResult(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.administrator(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const connection = await this.connection(manager, workspace.id);
    return {
      ...this.identity(workspace, memberId, userWorkspaceId, actor),
      revision: connection?.revision ?? 0,
      enabled: connection?.enabled ?? false,
      credentialConfigured: Boolean(connection?.apiKey),
    };
  }
  settings(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
      this.settingsResult(manager, workspace, memberId, userWorkspaceId),
    );
  }
  async saveSettings(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseFathomInput(fathomSettingsInput, raw);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      await this.administrator(manager, workspace, memberId, userWorkspaceId);
      const repository = manager.getRepository(DeliveryFathomConnectionEntity);
      const current = await this.connection(manager, workspace.id);
      if ((current?.revision ?? 0) !== input.revision)
        throw new ConflictException(
          'Fathom settings changed. Refresh before saving.',
        );
      if (input.apiKey && input.removeCredential)
        throw new BadRequestException(
          'Choose either a replacement key or removing the credential.',
        );
      const apiKey = input.removeCredential
        ? null
        : input.apiKey
          ? this.encryption.encryptVersioned(input.apiKey as PlaintextString, {
              workspaceId: workspace.id,
            })
          : (current?.apiKey ?? null);
      if (input.enabled && !apiKey)
        throw new BadRequestException(
          'Add a Fathom API key before enabling imports.',
        );
      const values = {
        revision: input.revision + 1,
        enabled: input.enabled,
        apiKey,
        updatedBy: memberId,
      };
      if (current)
        await repository.update(
          {
            id: current.id,
            workspaceId: workspace.id,
            revision: input.revision,
          },
          values,
        );
      else
        await repository.insert({
          id: randomUUID(),
          workspaceId: workspace.id,
          ...values,
        });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'ACCESS',
        action: 'FATHOM_SETTINGS_CHANGED',
        outcome: 'RECORDED',
        summary:
          'Updated the Fathom import connection. No meeting was imported or published.',
        sourceType: 'settings',
        sourceId: workspace.id,
        changes: [
          {
            field: 'revision',
            before: String(input.revision),
            after: String(input.revision + 1),
          },
        ],
      });
      return this.settingsResult(manager, workspace, memberId, userWorkspaceId);
    });
  }
  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
    sourceId: string,
  ) {
    const actor = await this.administrator(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (!project)
      throw new ForbiddenException('This knowledge project is unavailable.');
    const source = await manager
      .getRepository(DeliveryKnowledgeSourceEntity)
      .findOneBy({ id: sourceId });
    if (
      source &&
      (source.workspaceId !== workspace.id || source.projectId !== projectId)
    )
      throw new ForbiddenException('This knowledge source is unavailable.');
    const connection = await this.connection(manager, workspace.id);
    if (!connection?.enabled || !connection.apiKey)
      throw new ConflictException(
        'Fathom import is disabled or its credential was removed.',
      );
    return { actor, project, source, connection, apiKey: connection.apiKey };
  }
  private seal(proof: FathomProof) {
    return this.encryption.encryptVersioned(
      JSON.stringify(proof) as PlaintextString,
      { workspaceId: proof.workspaceId },
    );
  }
  private unseal(value: string, workspaceId: string) {
    try {
      return fathomProofSchema.parse(
        JSON.parse(
          this.encryption.decryptVersionedOrThrow(value as EncryptedString, {
            workspaceId,
          }),
        ),
      );
    } catch {
      throw new ConflictException(
        'This Fathom preview could not be verified. Fetch a new preview.',
      );
    }
  }
  private proof(
    scope: Awaited<ReturnType<DeliveryFathomService['scope']>>,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    sourceId: string,
    meeting: FathomMeeting,
    purpose: FathomProof['purpose'],
    transcriptHash: string | null,
    segmentCount: number | null,
  ): FathomProof {
    const now = new Date();
    return {
      version: 1,
      purpose,
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      projectId: scope.project.id,
      projectRevision: scope.project.revision,
      companyId: scope.project.companyId,
      sourceId,
      connectionRevision: scope.connection.revision,
      meeting,
      capturedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60000).toISOString(),
      transcriptHash,
      segmentCount,
    };
  }
  private assertProof(
    proof: FathomProof,
    scope: Awaited<ReturnType<DeliveryFathomService['scope']>>,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
    sourceId: string,
  ) {
    const expires = Date.parse(proof.expiresAt);
    const captured = Date.parse(proof.capturedAt);
    if (
      proof.workspaceId !== workspace.id ||
      proof.memberId !== memberId ||
      proof.userWorkspaceId !== userWorkspaceId ||
      proof.projectId !== projectId ||
      proof.sourceId !== sourceId ||
      proof.projectRevision !== scope.project.revision ||
      proof.companyId !== scope.project.companyId ||
      proof.connectionRevision !== scope.connection.revision ||
      captured > Date.now() ||
      expires <= Date.now() ||
      expires - captured > 15 * 60000
    )
      throw new ConflictException(
        'The Fathom preview expired or its source, permission or connection changed. Fetch a new preview.',
      );
  }
  async meetings(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseFathomInput(fathomMeetingsInput, raw);
    if (input.exactUrl) normalizeFathomUrl(input.exactUrl);
    const before = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      (manager) =>
        this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
          input.sourceId,
        ),
    );
    const result = await this.adapter.meetings(
      this.encryption.decryptVersionedOrThrow(before.apiKey, {
        workspaceId: workspace.id,
      }),
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const current = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
          input.sourceId,
        );
        if (
          current.connection.revision !== before.connection.revision ||
          current.project.revision !== before.project.revision ||
          current.project.companyId !== before.project.companyId
        )
          throw new ConflictException(
            'The Fathom source or connection changed. Search again.',
          );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, current.actor),
          projectId: input.projectId,
          sourceId: input.sourceId,
          connectionRevision: current.connection.revision,
          nextCursor: result.nextCursor,
          scannedCount: result.scannedCount,
          items: result.items.map((meeting) => ({
            ...meeting,
            proof: this.seal(
              this.proof(
                current,
                workspace,
                memberId,
                userWorkspaceId,
                input.sourceId,
                meeting,
                'FATHOM_MEETING',
                null,
                null,
              ),
            ),
          })),
        };
      },
    );
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseFathomInput(fathomPreviewInput, raw);
    const before = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
          input.sourceId,
        );
        if (
          scope.source?.fathomRecordingId &&
          scope.source.fathomRecordingId !== input.recordingId
        )
          throw new ConflictException(
            'This knowledge source is already linked to a different Fathom recording. Create a separate source for another meeting.',
          );
        let meeting: FathomMeeting = {
          recordingId: input.recordingId,
          title: null,
          recordedAt: null,
          sourceUrl: null,
        };
        if (input.meetingProof) {
          const proof = this.unseal(input.meetingProof, workspace.id);
          this.assertProof(
            proof,
            scope,
            workspace,
            memberId,
            userWorkspaceId,
            input.projectId,
            input.sourceId,
          );
          if (
            proof.purpose !== 'FATHOM_MEETING' ||
            proof.meeting.recordingId !== input.recordingId
          )
            throw new ConflictException('Choose the exact returned meeting.');
          meeting = proof.meeting;
        }
        return { ...scope, meeting };
      },
    );
    const result = await this.adapter.transcript(
      this.encryption.decryptVersionedOrThrow(before.apiKey, {
        workspaceId: workspace.id,
      }),
      input.recordingId,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
          input.sourceId,
        );
        if (
          scope.connection.revision !== before.connection.revision ||
          scope.project.revision !== before.project.revision ||
          scope.project.companyId !== before.project.companyId
        )
          throw new ConflictException(
            'The Fathom source or connection changed. Fetch a new preview.',
          );
        if (
          scope.source?.fathomRecordingId &&
          scope.source.fathomRecordingId !== input.recordingId
        )
          throw new ConflictException(
            'This knowledge source changed to another recording. Open its current draft before importing.',
          );
        const existing = await manager
          .getRepository(DeliveryKnowledgeSourceEntity)
          .findOneBy({
            workspaceId: workspace.id,
            projectId: input.projectId,
            fathomRecordingId: input.recordingId,
          });
        const claims = this.proof(
          scope,
          workspace,
          memberId,
          userWorkspaceId,
          input.sourceId,
          before.meeting,
          'FATHOM_TRANSCRIPT',
          result.transcriptHash,
          result.segmentCount,
        );
        const proof = this.seal(claims);
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
          projectId: input.projectId,
          sourceId: input.sourceId,
          connectionRevision: scope.connection.revision,
          meeting: { ...before.meeting, proof: input.meetingProof ?? '' },
          transcript: result.transcript,
          segmentCount: result.segmentCount,
          proof,
          proofHash: fathomHash(proof),
          expiresAt: claims.expiresAt,
          existingSourceId:
            existing && existing.id !== input.sourceId ? existing.id : null,
        };
      },
    );
  }
  async verifyImport(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: {
      projectId: string;
      id: string;
      transcript: string;
      fathomImportProof: string;
      fathomImportHash: string;
    },
  ): Promise<FathomProvenance> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error(
        'Fathom import verification requires the knowledge transaction.',
      );
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      input.id,
    );
    const proof = this.unseal(input.fathomImportProof, workspace.id);
    this.assertProof(
      proof,
      scope,
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      input.id,
    );
    if (
      proof.purpose !== 'FATHOM_TRANSCRIPT' ||
      !proof.transcriptHash ||
      proof.segmentCount === null ||
      fathomHash(input.fathomImportProof) !== input.fathomImportHash
    )
      throw new ConflictException(
        'The exact Fathom import evidence could not be verified.',
      );
    if (
      scope.source?.fathomRecordingId &&
      scope.source.fathomRecordingId !== proof.meeting.recordingId
    )
      throw new ConflictException(
        'This source already belongs to another Fathom recording.',
      );
    const existing = await manager
      .getRepository(DeliveryKnowledgeSourceEntity)
      .findOneBy({
        workspaceId: workspace.id,
        projectId: input.projectId,
        fathomRecordingId: proof.meeting.recordingId,
      });
    if (existing && existing.id !== input.id)
      throw new ConflictException(
        'This meeting was already imported into this project. Open its existing knowledge source.',
      );
    return {
      ...proof.meeting,
      provider: 'FATHOM',
      importedAt: proof.capturedAt,
      importedBy: memberId,
      companyId: proof.companyId,
      transcriptHash: proof.transcriptHash,
      proofHash: input.fathomImportHash,
      segmentCount: proof.segmentCount,
      humanEdited: fathomHash(input.transcript) !== proof.transcriptHash,
    };
  }
}
