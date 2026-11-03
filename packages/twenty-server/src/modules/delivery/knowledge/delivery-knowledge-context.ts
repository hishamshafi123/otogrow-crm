import { fathomKnowledgeAnchorSql } from 'src/modules/delivery/knowledge/fathom/fathom-knowledge-anchor';
import { ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

export type DeliveryKnowledgeContext = {
  fingerprint: string;
  totalSources: number;
  omittedSources: number;
  sources: {
    sourceId: string;
    version: number;
    title: string;
    category?: string;
    meetingDate: string;
    knowledge: string;
    truncated: boolean;
  }[];
};

export const readDeliveryKnowledgeContext = async (
  manager: EntityManager,
  workspaceId: string,
  projectId: string,
): Promise<DeliveryKnowledgeContext> => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Knowledge context requires an authorized transaction.');
  await manager.query(
    'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
    [`knowledge:${workspaceId}:${projectId}`],
  );
  const [metadata]: { fingerprint: string; totalSources: number }[] =
    await manager.query(
      `SELECT md5(COALESCE(string_agg(s.id::text || ':' || s."publishedVersion"::text, '|' ORDER BY s.id), '')) AS fingerprint, count(*)::int AS "totalSources" FROM core."deliveryKnowledgeSource" s JOIN core."deliveryKnowledgeVersion" v ON v."workspaceId"=s."workspaceId" AND v."sourceId"=s.id AND v.version=s."publishedVersion" WHERE s."workspaceId"=$1 AND s."projectId"=$2 AND ${fathomKnowledgeAnchorSql('s', 'v')}`,
      [workspaceId, projectId],
    );
  const rows: {
    sourceId: string;
    version: number;
    title: string;
    category: string;
    meetingDate: string;
    knowledge: string;
  }[] = await manager.query(
    `SELECT s.id AS "sourceId", v.version, v.title, v.category, v."meetingDate"::text AS "meetingDate", v.knowledge FROM core."deliveryKnowledgeSource" s JOIN core."deliveryKnowledgeVersion" v ON v."workspaceId"=s."workspaceId" AND v."sourceId"=s.id AND v.version=s."publishedVersion" WHERE s."workspaceId"=$1 AND s."projectId"=$2 AND ${fathomKnowledgeAnchorSql('s', 'v')} ORDER BY v."meetingDate" DESC, s.id LIMIT 20`,
    [workspaceId, projectId],
  );
  let remaining = 20000;
  const sources = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const knowledge = row.knowledge.slice(0, Math.min(6000, remaining));
    remaining -= knowledge.length;
    sources.push({
      ...row,
      knowledge,
      truncated: knowledge.length < row.knowledge.length,
    });
  }
  return {
    ...metadata,
    sources,
    omittedSources: metadata.totalSources - sources.length,
  };
};

export const assertDeliveryKnowledgeCurrent = async (
  manager: EntityManager,
  workspaceId: string,
  projectId: string,
  context: DeliveryKnowledgeContext | undefined,
) => {
  const current = await readDeliveryKnowledgeContext(
    manager,
    workspaceId,
    projectId,
  );
  const matches = context
    ? current.fingerprint === context.fingerprint
    : current.totalSources === 0;
  if (!matches)
    throw new ConflictException(
      'Approved brand knowledge changed. Preview and run the assistant again before applying suggestions.',
    );
};
