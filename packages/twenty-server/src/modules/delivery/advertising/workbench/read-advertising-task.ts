import { type EntityManager } from 'typeorm';
import { type AdvertisingTaskEvidence } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

export const readAdvertisingTask = async (
  manager: EntityManager,
  workspaceId: string,
  schema: string,
  projectId: string | null,
  taskId: string | null,
): Promise<AdvertisingTaskEvidence | null> => {
  if (!taskId || !projectId) return null;
  if (!/^"[a-zA-Z0-9_]+"$/.test(schema))
    throw new Error('Verified workspace schema required.');
  const rows: (Omit<AdvertisingTaskEvidence, 'evidence' | 'dueAt'> & {
    links: string[];
    dueAt: Date | string | null;
  })[] = await manager.query(
    `SELECT task.id,task.title,delivery.revision,delivery.details->>'state' AS state,
      task."assigneeId" AS "ownerId", NULLIF(trim(concat_ws(' ',owner."nameFirstName",owner."nameLastName")),'') AS "ownerName",
      COALESCE(CASE WHEN assignment.mode='BACKUP' THEN assignment."reviewerId"::text END,delivery.details->>'reviewerId') AS "reviewerId",
      NULLIF(trim(concat_ws(' ',reviewer."nameFirstName",reviewer."nameLastName")),'') AS "reviewerName",task."dueAt",
      (submission.value->>'version')::integer AS "submissionVersion",submission.value->>'decision' AS "submissionState",
      COALESCE(submission.value->'evidence',delivery.details->'evidence','[]'::jsonb) AS links
    FROM core."deliveryTask" delivery JOIN ${schema}.task task ON task.id=delivery."taskId" AND task."deletedAt" IS NULL
    LEFT JOIN LATERAL (SELECT delivery.details->'submissions'->(jsonb_array_length(COALESCE(delivery.details->'submissions','[]'::jsonb))-1) AS value) submission ON true
    LEFT JOIN core."deliveryReviewAssignment" assignment ON assignment."workspaceId"=delivery."workspaceId" AND assignment."taskId"=task.id AND assignment."submissionVersion"=(submission.value->>'version')::integer
    LEFT JOIN ${schema}."workspaceMember" owner ON owner.id=task."assigneeId" AND owner."deletedAt" IS NULL
    LEFT JOIN ${schema}."workspaceMember" reviewer ON reviewer.id=COALESCE(CASE WHEN assignment.mode='BACKUP' THEN assignment."reviewerId" END,(delivery.details->>'reviewerId')::uuid) AND reviewer."deletedAt" IS NULL
    WHERE delivery."workspaceId"=$1 AND delivery."projectId"=$2 AND delivery."taskId"=$3`,
    [workspaceId, projectId, taskId],
  );
  const task = rows[0];
  if (!task) return null;
  const { links, ...value } = task;
  return {
    ...value,
    dueAt: task.dueAt instanceof Date ? task.dueAt.toISOString() : task.dueAt,
    evidence: links
      .filter((url) => /^https?:\/\//.test(url))
      .map((url, index) => ({ url, label: `Task evidence ${index + 1}` })),
  };
};
