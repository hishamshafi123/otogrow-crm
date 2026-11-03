export const INBOX_CONVERSATIONS_SQL = `SELECT item.value AS record
  FROM core."deliveryOperations" operations
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(operations.state->'business'->'records','[]'::jsonb)) item(value)
  WHERE operations."workspaceId"=$1 AND item.value->>'kind'='CONVERSATION'`;

// The schema comes only from DeliveryService.schema; all identities, providers and filters remain bound values.
export const inboxVisibleConversationsSql = (schema: string) => `
WITH conversations AS (${INBOX_CONVERSATIONS_SQL}), visible AS (
  SELECT record,binding.enabled AS connected,binding.revision AS "bindingRevision"
  FROM conversations
  LEFT JOIN core."deliveryInboxBinding" binding
    ON binding."workspaceId"=$1 AND binding."conversationId"=(record->>'id')::uuid
  WHERE (CASE WHEN (record->>'private')::boolean THEN record->>'ownerId'=$2 ELSE
    $3::boolean OR record->>'ownerId'=$2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(record->'grants','[]'::jsonb)) permission
      WHERE permission->>'memberId'=$2 AND (permission->>'read')::boolean)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(record->'roleGrants','[]'::jsonb)) permission
      WHERE permission->>'roleId'=ANY($4::text[]) AND (permission->>'read')::boolean)
    END)
  AND EXISTS(SELECT 1 FROM core."deliveryProject" project WHERE project."workspaceId"=$1 AND project.id::text=record->>'projectId')
  AND (binding.id IS NULL OR (binding."ownerMemberId"::text=$2 AND NOT binding.enabled) OR (
    binding.enabled AND binding."projectId"::text=record->>'projectId'
    AND binding."ownerMemberId"::text=record->>'ownerId'
    AND EXISTS(SELECT 1 FROM core."deliveryProject" project
      WHERE project."workspaceId"=$1 AND project.id=binding."projectId"
        AND project."companyId" IS NOT DISTINCT FROM binding."companyId")
    AND EXISTS(SELECT 1 FROM core."connectedAccount" account
      JOIN core."messageChannel" channel ON channel."workspaceId"=$1
        AND channel.id=binding."channelId" AND channel."connectedAccountId"=account.id AND channel.type=$7
      JOIN core."userWorkspace" membership ON membership.id=binding."ownerUserWorkspaceId" AND membership."workspaceId"=$1
      JOIN core."user" person ON person.id=membership."userId"
      JOIN ${schema}."workspaceMember" owner ON owner.id=binding."ownerMemberId" AND owner."userId"=person.id
      WHERE account.id=binding."accountId" AND account."workspaceId"=$1 AND account.provider=$6
        AND account."userWorkspaceId"=membership.id AND account."archivedAt" IS NULL
        AND membership."deletedAt" IS NULL AND person."deletedAt" IS NULL AND NOT person.disabled AND owner."deletedAt" IS NULL)
    AND EXISTS(SELECT 1 FROM ${schema}."messageChannelMessageAssociation" association
      JOIN ${schema}.message message ON message.id=association."messageId"
      WHERE association."messageChannelId"=binding."channelId" AND association."messageThreadExternalId"=binding."threadExternalId"
        AND association."deletedAt" IS NULL AND message."deletedAt" IS NULL AND NOT message."isDraft")
    AND (binding."ownerMemberId"::text=$2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(binding.consent->'grants') consent
      WHERE (consent->>'read')::boolean AND ((consent->>'kind'='MEMBER' AND consent->>'id'=$2)
        OR (consent->>'kind'='ROLE' AND consent->>'id'=ANY($4::text[])))))
  )) AND ($5='' OR record->>'title' ILIKE $5)
)`;
