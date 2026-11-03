import { v5 } from 'uuid';
import {
  getDeliveryNavigationDefaults,
  getDeliveryEntryView,
  resolveDeliveryNavigationPreferences,
} from '@/delivery/navigation/delivery-navigation-preferences';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const accessFor = (roles: string[], capabilities: string[] = []) => ({
  workspaceId,
  roleIds: roles.map((role) => v5(`otogrow-role:${role}`, workspaceId)),
  capabilities,
});

it.each([
  ['admin', ['workspace.admin'], 'home', ['health', 'clients']],
  ['secondary-admin', ['workspace.admin'], 'planner', ['reviews', 'batches']],
  ['project-manager', ['delivery.manage'], 'planner', ['reviews', 'batches']],
  ['editor', [], 'mine', ['creative', 'knowledge']],
  ['designer', [], 'mine', ['creative', 'knowledge']],
  ['marketing', [], 'mine', ['ads', 'content']],
  ['seo-specialist', [], 'mine', ['operations', 'knowledge']],
  ['developer', [], 'mine', ['development']],
] as const)(
  'gives the %s role useful work destinations',
  (role, capabilities, startView, pins) => {
    const result = getDeliveryNavigationDefaults(
      accessFor([role], [...capabilities]),
    );
    expect(result.startView).toBe(startView);
    expect(result.pinnedViews).toEqual(expect.arrayContaining([...pins]));
  },
);

it('combines multiple roles without duplicate shortcuts or authority from a role ID', () => {
  const result = getDeliveryNavigationDefaults(
    accessFor(['editor', 'designer', 'marketing', 'seo-specialist']),
  );
  expect(result.pinnedViews).toEqual([
    'mine',
    'creative',
    'knowledge',
    'ads',
    'content',
    'seo',
    'operations',
    'chat',
  ]);
  expect(
    getDeliveryNavigationDefaults(accessFor(['secondary-admin'])).startView,
  ).toBe('mine');
  expect(
    getDeliveryNavigationDefaults(
      accessFor(['admin', 'secondary-admin'], ['workspace.admin']),
    ).startView,
  ).toBe('home');
});

it('uses effective capabilities for custom roles and never names as authority', () => {
  expect(
    getDeliveryNavigationDefaults(
      accessFor(['custom-admin'], ['workspace.admin']),
    ).startView,
  ).toBe('home');
  expect(
    getDeliveryNavigationDefaults(
      accessFor(['custom-manager'], ['delivery.manage']),
    ).startView,
  ).toBe('planner');
  expect(
    getDeliveryNavigationDefaults(accessFor(['custom-specialist'])).startView,
  ).toBe('mine');
});

it('removes disallowed saved destinations and safely recovers malformed browser data', () => {
  const defaults = { startView: 'mine', pinnedViews: ['mine', 'chat'] };
  const allowed = ['mine', 'creative', 'chat'];
  expect(
    resolveDeliveryNavigationPreferences(
      {
        startView: 'finance',
        pinnedViews: ['finance', 'creative', 'creative', 'activity'],
      },
      defaults,
      allowed,
    ),
  ).toEqual({ startView: 'mine', pinnedViews: ['creative'] });
  for (const stored of [
    null,
    'bad',
    {},
    { startView: [], pinnedViews: [] },
    { startView: 'mine', pinnedViews: Array(100).fill('mine') },
  ])
    expect(
      resolveDeliveryNavigationPreferences(stored, defaults, allowed),
    ).toEqual(defaults);
  expect(
    resolveDeliveryNavigationPreferences(
      { startView: 'creative', pinnedViews: [] },
      defaults,
      allowed,
    ),
  ).toEqual({ startView: 'creative', pinnedViews: [] });
});

it('honors explicit pages and legacy task/filter URLs before the personal start page', () => {
  expect(getDeliveryEntryView(new URLSearchParams(), 'planner')).toBe(
    'planner',
  );
  expect(
    getDeliveryEntryView(
      new URLSearchParams('view=creative&task=video'),
      'planner',
    ),
  ).toBe('creative');
  expect(
    getDeliveryEntryView(new URLSearchParams('task=video'), 'planner'),
  ).toBe('home');
  expect(
    getDeliveryEntryView(new URLSearchParams('search=launch'), 'planner'),
  ).toBe('home');
  expect(
    getDeliveryEntryView(new URLSearchParams('view=unavailable'), 'planner'),
  ).toBe('unavailable');
});
