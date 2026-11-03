import { ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type FathomProvenance } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.types';

// Aliases are internal SQL constants; provider/user values never enter this expression.
export const fathomKnowledgeAnchorSql = (source: string, version: string) =>
  `(${version}."fathomProvenance" IS NULL OR EXISTS (SELECT 1 FROM core."deliveryProject" fathom_project WHERE fathom_project."workspaceId"=${source}."workspaceId" AND fathom_project.id=${source}."projectId" AND (fathom_project."companyId"::text IS NOT DISTINCT FROM ${version}."fathomProvenance"->>'companyId'))) `;

export const assertFathomKnowledgeAnchor = async (
  manager: EntityManager,
  workspaceId: string,
  projectId: string,
  provenance: FathomProvenance | null | undefined,
) => {
  if (!provenance) return;
  const project = await manager
    .getRepository(DeliveryProjectEntity)
    .findOneBy({ workspaceId, id: projectId });
  if (!project || project.companyId !== provenance.companyId)
    throw new ForbiddenException(
      'This imported meeting belongs to the original client. Its project-client link changed.',
    );
};
