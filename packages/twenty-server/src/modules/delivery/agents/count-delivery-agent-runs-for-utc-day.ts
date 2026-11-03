import { type EntityManager } from 'typeorm';

export const countDeliveryAgentRunsForUtcDay = async (
  manager: EntityManager,
  workspaceId: string,
  agentId: string,
  now = new Date(),
): Promise<number> => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error(
      'Daily assistant limits require the locked source transaction.',
    );
  if (!Number.isFinite(now.getTime()))
    throw new Error('A valid run date is required.');
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  // Agent identity survives configuration-kind changes, so every runtime consumes the same allowance.
  const [result]: { count: number }[] = await manager.query(
    `SELECT COALESCE(sum(source.count),0)::integer AS count FROM (
      SELECT count(*) AS count FROM core."deliveryAgentRun" WHERE "workspaceId"=$1 AND "agentId"=$2 AND "createdAt">=$3::timestamptz AND "createdAt"<$4::timestamptz
      UNION ALL
      SELECT count(*) AS count FROM core."deliveryOperations" operations,jsonb_array_elements(COALESCE(operations.state->'business'->'agentRuns','[]'::jsonb)) inbox(run)
        WHERE operations."workspaceId"=$1 AND inbox.run->>'agentId'=$2::text AND (inbox.run->>'createdAt')::timestamptz>=$3::timestamptz AND (inbox.run->>'createdAt')::timestamptz<$4::timestamptz
      UNION ALL
      SELECT count(*) AS count FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 AND "agentId"=$2 AND "createdAt">=$3::timestamptz AND "createdAt"<$4::timestamptz
      UNION ALL
      SELECT count(*) AS count FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 AND "agentId"=$2 AND "createdAt">=$3::timestamptz AND "createdAt"<$4::timestamptz
    ) source`,
    [workspaceId, agentId, start.toISOString(), end.toISOString()],
  );
  return result.count;
};
