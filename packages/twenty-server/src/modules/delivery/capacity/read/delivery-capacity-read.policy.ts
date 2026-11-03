import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { deliveryTaskScopeHash } from 'src/modules/delivery/tasks/delivery-tasks.policy';

export const DELIVERY_CAPACITY_READ_PAGE_SIZE = 25;
const calendar = {
  startDate: z.iso.date(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => getValidTimeZoneOrUndefined(value) !== undefined),
  after: z.string().min(1).max(12000).nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DELIVERY_CAPACITY_READ_PAGE_SIZE)
    .nullish(),
};
export const deliveryCapacitySummarySchema = z.object(calendar).strict();
export const deliveryCapacityAssignmentsSchema = z
  .object({
    ...calendar,
    memberId: z.uuid().nullable(),
    bucket: z.enum(['DAY', 'NEEDS_PLANNING', 'UNAVAILABLE_OWNER']),
    date: z.iso.date().nullable(),
  })
  .strict()
  .refine((input) =>
    input.bucket === 'DAY' ? Boolean(input.date) : !input.date,
  )
  .refine((input) => input.bucket !== 'UNAVAILABLE_OWNER' || !input.memberId);
export const parseCapacityReadInput = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'Check the capacity calendar, teammate and assignment selection.',
    );
  return result.data;
};
export const deliveryCapacityReadDates = (startDate: string): string[] => {
  if (!z.iso.date().safeParse(startDate).success)
    throw new BadRequestException('Choose a valid capacity start date.');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (
    start.getUTCFullYear() < 1 ||
    start.toISOString().slice(0, 10) !== startDate
  )
    throw new BadRequestException('Choose a valid capacity start date.');
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    if (date.getUTCFullYear() > 9999)
      throw new BadRequestException('Choose an earlier capacity start date.');
    return date.toISOString().slice(0, 10);
  });
};
const cursorSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['SUMMARY', 'ASSIGNMENTS']),
    sort: z.array(z.string().max(2000)).min(2).max(4),
  })
  .strict();
export const capacityReadScope = deliveryTaskScopeHash;
export const capacityReadCursor = (
  scope: string,
  kind: 'SUMMARY' | 'ASSIGNMENTS',
  sort: string[],
) => Buffer.from(JSON.stringify({ scope, kind, sort })).toString('base64url');
export const readCapacityReadCursor = (
  cursor: string | null | undefined,
  scope: string,
  kind: 'SUMMARY' | 'ASSIGNMENTS',
): string[] | null => {
  if (!cursor) return null;
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    const validSort =
      kind === 'SUMMARY'
        ? value.sort.length === 2 && z.uuid().safeParse(value.sort[1]).success
        : value.sort.length === 4 &&
          z.uuid().safeParse(value.sort[2]).success &&
          ['PRODUCTION', 'REVIEW'].includes(value.sort[3]);
    if (value.scope === scope && value.kind === kind && validSort)
      return value.sort;
  } catch {
    // Current authorization and selection must match the page that issued this cursor.
  }
  throw new BadRequestException(
    'This capacity page no longer matches current access or selection. Open the first page.',
  );
};

const wholeMinutes = (field: string) => {
  const value = `d.details->'plan'->'${field}'`;
  const number = `(${value} #>> '{}')::numeric`;
  return `CASE WHEN jsonb_typeof(${value})='number' THEN CASE WHEN ${number} BETWEEN 0 AND 10080 AND trunc(${number})=${number} THEN ${number}::integer END END`;
};
const calendarDate = (value: string) =>
  `CASE WHEN ${value} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN CASE WHEN substring(${value},1,4)::integer>0 AND substring(${value},9,2)::integer <= CASE substring(${value},6,2)::integer WHEN 2 THEN CASE WHEN substring(${value},1,4)::integer%400=0 OR (substring(${value},1,4)::integer%4=0 AND substring(${value},1,4)::integer%100<>0) THEN 29 ELSE 28 END WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END THEN ${value} END END`;
const uuid = (value: string) =>
  `CASE WHEN ${value} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ${value} END`;

// All task JSON stays in PostgreSQL; only the selected current-plan scalars cross this boundary.
export const capacityReadSource = (nativeSchema: string) => `WITH calendar AS (
  SELECT $4::text AS "startDate",$5::text AS "endDate"
), people AS (
  SELECT * FROM jsonb_to_recordset($3::jsonb) AS person("memberId" uuid,name text,"canManage" boolean,"canReview" boolean)
), source AS (
  SELECT t.id AS "taskId",t.title,d."projectId",p.name AS "projectName",d.revision,COALESCE(d.details->>'state','') AS state,
    t."assigneeId"::text AS "assigneeId",p."memberIds" AS "projectMembers",${uuid("d.details->>'reviewerId'")} AS "primaryReviewerId",
    ${calendarDate("d.details->>'scheduledDate'")} AS "productionDate",${calendarDate("d.details->'plan'->>'reviewDate'")} AS "reviewDate",
    ${wholeMinutes('workMinutes')} AS "productionMinutes",${wholeMinutes('revisionMinutes')} AS "revisionMinutes",${wholeMinutes('waitMinutes')} AS "waitMinutes",${wholeMinutes('reviewMinutes')} AS "reviewMinutes",
    CASE WHEN jsonb_typeof(d.details->'submissions')='array' AND jsonb_typeof(d.details->'submissions'->-1->'version')='number' THEN CASE WHEN (d.details->'submissions'->-1->>'version')::numeric BETWEEN 1 AND 2147483647 AND trunc((d.details->'submissions'->-1->>'version')::numeric)=(d.details->'submissions'->-1->>'version')::numeric THEN (d.details->'submissions'->-1->>'version')::integer END END AS "submissionVersion",
    d.details->'plan' AS "rawPlan",d.details->>'scheduledDate' AS "rawProductionDate"
  FROM core."deliveryTask" d JOIN ${nativeSchema}.task t ON t.id=d."taskId" JOIN core."deliveryProject" p ON p.id=d."projectId" AND p."workspaceId"=d."workspaceId"
  WHERE d."workspaceId"=$1 AND d."projectId"=ANY($2::uuid[]) AND t."deletedAt" IS NULL AND COALESCE(d.details->>'state','')<>'APPROVED'
), assigned AS (
  SELECT source.*,CASE WHEN source.state='IN_REVIEW' THEN COALESCE(a.mode,'PRIMARY') ELSE 'PRIMARY' END AS "reviewMode",
    CASE WHEN source.state='IN_REVIEW' AND a.mode='BACKUP' THEN a."reviewerId"::text ELSE source."primaryReviewerId" END AS "reviewOwnerId",
    CASE WHEN source.state='IN_REVIEW' THEN COALESCE(a.revision,0) ELSE 0 END AS "reviewAssignmentRevision",
    ARRAY_REMOVE(ARRAY[
      CASE WHEN source.state NOT IN ('PLANNED','IN_PROGRESS','BLOCKED','IN_REVIEW','CHANGES_REQUESTED') THEN 'TASK_STATE_UNAVAILABLE' END,
      CASE WHEN source.state='IN_REVIEW' AND source."submissionVersion" IS NULL THEN 'SUBMISSION_IDENTITY_UNAVAILABLE' END,
      CASE WHEN ("rawPlan" IS NOT NULL AND "rawPlan"<>'null'::jsonb AND jsonb_typeof("rawPlan")<>'object')
        OR ("rawPlan"->'workMinutes' IS NOT NULL AND "rawPlan"->'workMinutes'<>'null'::jsonb AND "productionMinutes" IS NULL)
        OR ("rawPlan"->'revisionMinutes' IS NOT NULL AND "rawPlan"->'revisionMinutes'<>'null'::jsonb AND "revisionMinutes" IS NULL)
        OR ("rawPlan"->'waitMinutes' IS NOT NULL AND "rawPlan"->'waitMinutes'<>'null'::jsonb AND "waitMinutes" IS NULL)
        OR ("rawPlan"->'reviewMinutes' IS NOT NULL AND "rawPlan"->'reviewMinutes'<>'null'::jsonb AND "reviewMinutes" IS NULL)
        OR ("rawPlan"->'reviewDate' IS NOT NULL AND "rawPlan"->'reviewDate'<>'null'::jsonb AND "reviewDate" IS NULL)
        OR ("rawProductionDate" IS NOT NULL AND "productionDate" IS NULL) THEN 'INVALID_PLAN_SOURCE' END
    ],NULL) AS warnings
  FROM source LEFT JOIN core."deliveryReviewAssignment" a ON a."workspaceId"=$1 AND a."taskId"=source."taskId" AND a."submissionVersion"=source."submissionVersion" AND source.state='IN_REVIEW'
), candidates AS (
  SELECT "taskId",title,"projectId","projectName",revision,state,'PRODUCTION'::text AS kind,"productionDate" AS date,"assigneeId" AS "ownerId","productionMinutes" AS "workMinutes","revisionMinutes","waitMinutes",("productionMinutes" IS NULL OR "revisionMinutes" IS NULL) AS "unknownEffort",("waitMinutes" IS NULL) AS "unknownWait","submissionVersion",0 AS "reviewAssignmentRevision",NULL::text AS "reviewMode","projectMembers","assigneeId",warnings AS "sourceWarnings" FROM assigned WHERE state<>'IN_REVIEW'
  UNION ALL
  SELECT "taskId",title,"projectId","projectName",revision,state,'REVIEW',"reviewDate","reviewOwnerId","reviewMinutes",0,0,"reviewMinutes" IS NULL,false,"submissionVersion","reviewAssignmentRevision","reviewMode","projectMembers","assigneeId",warnings FROM assigned
), classified AS (
  SELECT candidates.*,person.name AS "ownerName",person."memberId" IS NOT NULL AS "ownerAvailable",
    CASE WHEN kind='PRODUCTION' THEN NULL WHEN "ownerId" IS NULL THEN 'UNASSIGNED' WHEN "ownerId"="assigneeId" THEN 'SELF_REVIEW'
      WHEN person."memberId" IS NULL OR NOT(COALESCE(person."canManage",false) OR "reviewMode"='BACKUP' AND COALESCE(person."canReview",false)) OR ("reviewMode"='BACKUP' AND NOT COALESCE("projectMembers" @> jsonb_build_array("ownerId"),false)) THEN 'UNAVAILABLE' ELSE 'ACTIVE' END AS "reviewerState"
  FROM candidates LEFT JOIN people person ON person."memberId"::text=candidates."ownerId"
), loads AS (
  SELECT classified.*,"sourceWarnings" || ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT "ownerAvailable" THEN CASE WHEN kind='PRODUCTION' THEN 'UNAVAILABLE_PRODUCTION_OWNER' ELSE 'UNAVAILABLE_REVIEW_OWNER' END END,
    CASE WHEN kind='REVIEW' AND "ownerAvailable" AND "reviewerState"<>'ACTIVE' THEN 'UNAVAILABLE_REVIEWER' END
  ],NULL) AS warnings FROM classified
)`;
