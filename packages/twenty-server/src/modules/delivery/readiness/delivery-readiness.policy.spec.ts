import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type MetaConnection } from 'src/modules/delivery/advertising/delivery-meta.types';
import {
  manualReadiness,
  metaReadiness,
} from 'src/modules/delivery/readiness/delivery-readiness.policy';

const NOW = new Date('2026-10-27T03:00:00.000Z');
const RECENT_HEARTBEAT = '2026-10-27T02:59:30.000Z';
const RECENT_IMPORT = '2026-10-27T02:58:00.000Z';
const connection = (
  overrides: Partial<MetaConnection> = {},
): MetaConnection => ({
  accountId: '123456789',
  revision: 1,
  projectId: '9b3a2d98-f4cc-4b62-8563-149808b90a12',
  managerId: 'e329684a-56e9-4f7d-aa30-760b2aad4752',
  marketerId: 'ba40a74a-9da1-4a15-8d2a-811347e497d7',
  time: '06:00',
  enabled: true,
  ciphertext: 'synthetic-private-ciphertext' as EncryptedString,
  name: 'Client reporting account',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  ownerId: 'e4294bba-41b6-45c2-adb2-76f9156cbb89',
  userWorkspaceId: '260aa358-a706-472e-a9fd-74722011bc3c',
  lastSuccessAt: RECENT_IMPORT,
  lastDate: '2026-10-26',
  error: null,
  retryAt: null,
  lease: null,
  ...overrides,
});

describe('Meta readiness', () => {
  it('identifies recent stored import and scheduler evidence without changing connection state', () => {
    const saved = connection();
    const before = structuredClone(saved);

    expect(metaReadiness(saved, true, RECENT_HEARTBEAT, NOW)).toMatchObject({
      id: 'META:123456789',
      capability: 'META',
      accountName: 'Client reporting account',
      status: 'CONNECTED',
      reason: 'META_OBSERVED',
      destination: 'ads',
      lastSuccessAt: RECENT_IMPORT,
    });
    expect(saved).toEqual(before);
  });

  it('keeps a deliberately disabled schedule paused despite an earlier successful import', () => {
    expect(
      metaReadiness(connection({ enabled: false }), false, null, NOW),
    ).toMatchObject({
      status: 'PAUSED',
      reason: 'META_PAUSED',
      lastSuccessAt: RECENT_IMPORT,
    });
  });

  it('keeps an import failure visible when the schedule was also disabled', () => {
    expect(
      metaReadiness(
        connection({ enabled: false, error: 'Authorization failed' }),
        false,
        RECENT_HEARTBEAT,
        NOW,
      ),
    ).toMatchObject({ status: 'NEEDS_ATTENTION', reason: 'META_IMPORT_ERROR' });
  });

  it('requires current responsibilities even when import and scheduler evidence are recent', () => {
    expect(
      metaReadiness(connection(), false, RECENT_HEARTBEAT, NOW),
    ).toMatchObject({ status: 'NEEDS_ATTENTION', reason: 'META_MAPPING' });
  });

  it('does not trust an import after its connection owner loses administrator access', () => {
    expect(
      metaReadiness(connection(), true, RECENT_HEARTBEAT, NOW, false),
    ).toMatchObject({ status: 'NEEDS_ATTENTION', reason: 'META_OWNER' });
  });

  it('does not treat saved credentials or a running scheduler as a successful performance import', () => {
    expect(
      metaReadiness(
        connection({ lastSuccessAt: null }),
        true,
        RECENT_HEARTBEAT,
        NOW,
      ),
    ).toMatchObject({
      status: 'NEEDS_SETUP',
      reason: 'META_UNVERIFIED',
      lastSuccessAt: null,
    });
  });

  it.each([
    ['missing', null],
    ['invalid', 'not-a-date'],
    ['older than three minutes', '2026-10-27T02:56:59.999Z'],
    ['more than one minute in the future', '2026-10-27T03:01:00.001Z'],
  ])(
    'does not show connected with a %s scheduler heartbeat',
    (_description, heartbeat) => {
      expect(metaReadiness(connection(), true, heartbeat, NOW)).toMatchObject({
        status: 'NEEDS_ATTENTION',
        reason: 'META_WORKER_STALE',
      });
    },
  );

  it.each([
    ['exactly three minutes old', '2026-10-27T02:57:00.000Z'],
    ['within one minute of positive clock skew', '2026-10-27T03:01:00.000Z'],
  ])('accepts a scheduler heartbeat %s', (_description, heartbeat) => {
    expect(metaReadiness(connection(), true, heartbeat, NOW).status).toBe(
      'CONNECTED',
    );
  });

  it.each([
    ['invalid', 'not-a-date'],
    ['older than 36 hours', '2026-10-25T14:59:59.999Z'],
    ['more than one minute in the future', '2026-10-27T03:01:00.001Z'],
  ])(
    'does not show connected with a %s import timestamp',
    (_description, lastSuccessAt) => {
      expect(
        metaReadiness(
          connection({ lastSuccessAt }),
          true,
          RECENT_HEARTBEAT,
          NOW,
        ),
      ).toMatchObject({
        status: 'NEEDS_ATTENTION',
        reason: 'META_IMPORT_STALE',
      });
    },
  );

  it('accepts the documented import freshness boundary', () => {
    expect(
      metaReadiness(
        connection({ lastSuccessAt: '2026-10-25T15:00:00.000Z' }),
        true,
        RECENT_HEARTBEAT,
        NOW,
      ).status,
    ).toBe('CONNECTED');
  });

  it('retains separate healthy, failed and paused accounts rather than collapsing to any successful connection', () => {
    const saved = [
      connection(),
      connection({ accountId: '987654321', error: 'Authorization failed' }),
      connection({ accountId: '111222333', enabled: false }),
    ];
    const items = saved.map((account) =>
      metaReadiness(account, true, RECENT_HEARTBEAT, NOW),
    );

    expect(items.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'META:123456789', status: 'CONNECTED' },
      { id: 'META:987654321', status: 'NEEDS_ATTENTION' },
      { id: 'META:111222333', status: 'PAUSED' },
    ]);
  });

  it('reports a recovery reason without exposing credentials, membership identifiers or raw provider errors', () => {
    const saved = connection({ error: 'private-provider-payload-and-token' });
    const item = metaReadiness(saved, true, RECENT_HEARTBEAT, NOW);
    const serialized = JSON.stringify(item);

    expect(item.reason).toBe('META_IMPORT_ERROR');
    for (const privateValue of [
      saved.ciphertext,
      saved.ownerId,
      saved.userWorkspaceId,
      saved.error,
    ])
      expect(serialized).not.toContain(privateValue);
  });
});

describe('Manual and unavailable capability readiness', () => {
  it('distinguishes manual planning/export workflows from adapters that do not exist', () => {
    const byCapability = Object.fromEntries(
      manualReadiness().map((item) => [item.capability, item]),
    );

    for (const capability of [
      'SOCIAL_PUBLISHING',
      'COMPETITOR_COLLECTION',
      'ACCOUNTING',
      'SEO_RESULTS',
      'DEVELOPMENT_SYNC',
    ])
      expect(byCapability[capability].status).toBe('MANUAL');
    for (const capability of [
      'SLACK_OS',
      'WHATSAPP_OS',
      'SHOPIFY',
      'OTHER_AD_CHANNELS',
      'DYNAMIC_AGENTS',
    ])
      expect(byCapability[capability].status).toBe('NOT_IMPLEMENTED');
  });

  it('identifies implemented local workflows without inventing successful provider evidence', () => {
    const items = manualReadiness();

    expect(
      items
        .filter((item) => item.status === 'AVAILABLE')
        .map((item) => item.capability),
    ).toEqual(
      expect.arrayContaining([
        'EMAIL_OS',
        'MEETING_IMPORT',
        'BRAND_KNOWLEDGE',
        'TASK_ASSISTANTS',
        'CREATIVE_PRODUCTION',
      ]),
    );
    expect(items.every((item) => item.lastSuccessAt === null)).toBe(true);
    expect(items.some((item) => item.status === 'CONNECTED')).toBe(false);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('returns fresh observations so one consumer cannot rewrite later capability status', () => {
    const first = manualReadiness();
    const firstEmail = first.find((item) => item.capability === 'EMAIL_OS');
    expect(firstEmail).toBeDefined();
    if (firstEmail) firstEmail.status = 'CONNECTED';

    expect(
      manualReadiness().find((item) => item.capability === 'EMAIL_OS')?.status,
    ).toBe('AVAILABLE');
  });
});
