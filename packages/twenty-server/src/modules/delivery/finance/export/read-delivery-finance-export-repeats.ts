import { BadRequestException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';
import { FINANCE_EXPORT_MAX_ROWS } from 'src/modules/delivery/finance/export/delivery-finance-export.policy';

export type FinanceExportRepeatRequest = {
  sourceId: string;
  identityKey: string | null;
};
export type FinanceExportRepeatSummary = FinanceExportRepeatRequest & {
  previousBatchCount: number;
  latestBatchId: string | null;
  stateFingerprint: string;
};
export const financeExportRepeatKey = (request: FinanceExportRepeatRequest) =>
  JSON.stringify([request.sourceId.toLowerCase(), request.identityKey]);

export const readFinanceExportRepeats = async (
  manager: EntityManager,
  workspaceId: string,
  basis: 'CASH' | 'RECOGNITION',
  currency: string,
  input: FinanceExportRepeatRequest[],
): Promise<FinanceExportRepeatSummary[]> => {
  const requests = [
    ...new Map(
      input.map((request) => {
        if (
          !isValidUuid(request.sourceId) ||
          (request.identityKey !== null &&
            (typeof request.identityKey !== 'string' ||
              request.identityKey.length > 200 ||
              request.identityKey.includes('\0')))
        )
          throw new BadRequestException(
            'This export history selection contains an invalid source identity.',
          );
        const normalized = {
          sourceId: request.sourceId.toLowerCase(),
          identityKey: request.identityKey,
        };
        return [financeExportRepeatKey(normalized), normalized];
      }),
    ).values(),
  ];
  if (requests.length > FINANCE_EXPORT_MAX_ROWS)
    throw new BadRequestException(
      'This export history selection exceeds the complete source review limit.',
    );
  if (!requests.length) return [];
  const sourceIds = [...new Set(requests.map((request) => request.sourceId))];
  const identityKeys = [
    ...new Set(
      requests.flatMap((request) =>
        request.identityKey === null ? [] : [request.identityKey],
      ),
    ),
  ];
  // Numeric hash-word sums keep aggregate memory fixed while every matching batch and import state contributes.
  const rows: FinanceExportRepeatSummary[] = await manager.query(
    `
    WITH requested AS MATERIALIZED (
      SELECT request."sourceId", request."identityKey"
      FROM jsonb_to_recordset($4::jsonb) AS request("sourceId" uuid, "identityKey" text)
    ), candidates AS MATERIALIZED (
      SELECT batch.id, batch."createdAt", batch.checksum, batch."sourceIds", batch."identityKeys"
      FROM core."deliveryFinanceExportBatch" batch
      WHERE batch."workspaceId"=$1 AND batch.basis=$2 AND batch.currency=$3
        AND (batch."sourceIds" && $5::uuid[] OR batch."identityKeys" && $6::text[])
    ), matched AS NOT MATERIALIZED (
      SELECT request."sourceId", request."identityKey", batch.id AS "batchId"
      FROM candidates batch
      CROSS JOIN LATERAL (SELECT DISTINCT value AS "sourceId" FROM unnest(batch."sourceIds") value) source
      JOIN requested request ON request."sourceId"=source."sourceId"
      UNION ALL
      SELECT request."sourceId", request."identityKey", batch.id AS "batchId"
      FROM candidates batch
      CROSS JOIN LATERAL (SELECT DISTINCT value AS "identityKey" FROM unnest(batch."identityKeys") value) source
      JOIN requested request ON request."identityKey"=source."identityKey"
      WHERE NOT COALESCE(request."sourceId"=ANY(batch."sourceIds"),false)
    ), states AS MATERIALIZED (
      SELECT batch.id,
        to_char(batch."createdAt" AT TIME ZONE 'UTC','YYYYMMDDHH24MISSUS')||':'||batch.id::text AS "latestKey",
        md5(jsonb_build_array(batch.id,batch.checksum,EXTRACT(EPOCH FROM batch."createdAt")::text,
          event.id,COALESCE(event.revision,1),COALESCE(event.status,'NOT_CONFIRMED'))::text) AS hash
      FROM candidates batch
      LEFT JOIN LATERAL (
        SELECT event.id,event.revision,event."after"->>'importStatus' AS status
        FROM core."deliveryFinanceEvent" event
        WHERE event."workspaceId"=$1 AND event."sourceType"='EXPORT_BATCH' AND event."sourceId"=batch.id
        ORDER BY event.revision DESC,event."createdAt" DESC,event.id DESC LIMIT 1
      ) event ON true
    ), aggregated AS (
      SELECT matched."sourceId",matched."identityKey",COUNT(*)::int AS "previousBatchCount",
        RIGHT(MAX(states."latestKey"),36)::uuid AS "latestBatchId",
        md5(jsonb_build_array(COUNT(*),
          SUM(('x'||substring(states.hash FROM 1 FOR 8))::bit(32)::bigint),
          SUM(('x'||substring(states.hash FROM 9 FOR 8))::bit(32)::bigint),
          SUM(('x'||substring(states.hash FROM 17 FOR 8))::bit(32)::bigint),
          SUM(('x'||substring(states.hash FROM 25 FOR 8))::bit(32)::bigint))::text) AS "stateFingerprint"
      FROM matched JOIN states ON states.id=matched."batchId"
      GROUP BY matched."sourceId",matched."identityKey"
    )
    SELECT requested."sourceId",requested."identityKey",
      COALESCE(aggregated."previousBatchCount",0) AS "previousBatchCount",
      aggregated."latestBatchId",COALESCE(aggregated."stateFingerprint",md5('[]')) AS "stateFingerprint"
    FROM requested LEFT JOIN aggregated ON aggregated."sourceId"=requested."sourceId"
      AND aggregated."identityKey" IS NOT DISTINCT FROM requested."identityKey"
    ORDER BY requested."sourceId",requested."identityKey" NULLS FIRST
  `,
    [
      workspaceId,
      basis,
      currency,
      JSON.stringify(requests),
      sourceIds,
      identityKeys,
    ],
  );
  return rows;
};
