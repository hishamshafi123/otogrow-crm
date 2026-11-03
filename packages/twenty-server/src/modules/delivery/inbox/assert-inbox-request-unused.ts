import { ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

export const assertInboxRequestUnused = async (
  manager: EntityManager,
  requestId: string,
) => {
  const rows: { id: string }[] = await manager.query(
    `SELECT id FROM core."deliveryInboxConsent" WHERE id=$1 UNION ALL SELECT id FROM core."deliveryInboxReply" WHERE "requestId"=$1 OR "sendRequestId"=$1 OR "cancelRequestId"=$1 LIMIT 1`,
    [requestId],
  );
  if (rows.length)
    throw new ConflictException(
      'This request identity was already used by another inbox operation. Check the original request.',
    );
};
