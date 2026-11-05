import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type EntityManager, In } from 'typeorm';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeAssetEntity } from './entities/delivery-knowledge-asset.entity';
import {
  type KnowledgeAssetBinding,
  knowledgeAssetBindingsSchema,
  parseKnowledgeAssetInput,
} from './delivery-knowledge-assets.policy';

export const knowledgeAssetDescriptor = (
  asset: DeliveryKnowledgeAssetEntity,
) => ({
  id: asset.id,
  name: asset.name,
  mimeType: asset.mimeType,
  size: asset.size,
  sha256: asset.sha256,
  uploadedBy: asset.uploadedBy,
  createdAt: asset.createdAt.toISOString(),
});
export const readKnowledgeAssetBindings = async (
  manager: EntityManager,
  workspaceId: string,
  projectId: string,
  sourceId: string,
  bindings: KnowledgeAssetBinding[] | undefined,
  requiredUploaderId?: string,
) => {
  const selected = parseKnowledgeAssetInput(
    knowledgeAssetBindingsSchema,
    bindings ?? [],
  );
  if (!selected.length) return [];
  const project = await manager
    .getRepository(DeliveryProjectEntity)
    .findOneBy({ workspaceId, id: projectId });
  if (!project)
    throw new ForbiddenException('This brand file project is unavailable.');
  const rows = await manager
    .getRepository(DeliveryKnowledgeAssetEntity)
    .findBy({
      workspaceId,
      sourceId,
      projectId,
      id: In(selected.map((item) => item.id)),
    });
  return selected.map((binding) => {
    const row = rows.find((item) => item.id === binding.id);
    if (
      !row ||
      row.companyId !== project.companyId ||
      (requiredUploaderId && row.uploadedBy !== requiredUploaderId)
    )
      throw new ForbiddenException(
        'This file belongs to its original brand and source. Its project or client link changed.',
      );
    if (row.state !== 'READY' || row.sha256 !== binding.sha256)
      throw new ConflictException(
        'This exact brand file is not ready. Check its upload before saving or publishing.',
      );
    return knowledgeAssetDescriptor(row);
  });
};
