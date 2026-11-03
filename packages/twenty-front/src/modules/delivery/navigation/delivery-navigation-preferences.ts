import { v5 } from 'uuid';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';

export const MAX_PINNED_DELIVERY_PAGES = 8;

const PREFERENCES = z.object({
  startView: z.string().max(40),
  pinnedViews: z.array(z.string().max(40)).max(MAX_PINNED_DELIVERY_PAGES),
});

export type DeliveryNavigationPreferences = z.infer<typeof PREFERENCES>;

type NavigationAccess = {
  workspaceId: string;
  roleIds: readonly string[];
  capabilities: readonly string[];
};

export const getDeliveryNavigationDefaults = (
  access: NavigationAccess,
): DeliveryNavigationPreferences => {
  // Built-in IDs survive role renaming. These suggestions never grant access.
  const hasRole = (key: string) =>
    isValidUuid(access.workspaceId) &&
    access.roleIds?.includes(v5(`otogrow-role:${key}`, access.workspaceId));
  const administrator = access.capabilities.includes('workspace.admin');
  const manager =
    administrator || access.capabilities.includes('delivery.manage');
  const deliveryLead = hasRole('secondary-admin') || hasRole('project-manager');
  const startView =
    manager && deliveryLead && !hasRole('admin')
      ? 'planner'
      : administrator
        ? 'home'
        : manager
          ? 'planner'
          : 'mine';
  const pinnedViews = [
    ...(startView === 'home'
      ? ['home', 'health', 'clients']
      : manager
        ? ['planner', 'reviews', 'batches']
        : ['mine']),
    ...(hasRole('editor') || hasRole('designer')
      ? ['creative', 'knowledge']
      : []),
    ...(hasRole('marketing') ? ['ads', 'content'] : []),
    ...(hasRole('seo-specialist') ? ['seo', 'operations', 'knowledge'] : []),
    ...(hasRole('developer') ? ['development'] : []),
    'chat',
  ];
  return {
    startView,
    pinnedViews: [...new Set(pinnedViews)].slice(0, MAX_PINNED_DELIVERY_PAGES),
  };
};

export const resolveDeliveryNavigationPreferences = (
  value: unknown,
  defaults: DeliveryNavigationPreferences,
  allowedViews: readonly string[],
): DeliveryNavigationPreferences => {
  const result = PREFERENCES.safeParse(value);
  const preference = result.success ? result.data : defaults;
  const fallback = allowedViews.includes(defaults.startView)
    ? defaults.startView
    : (allowedViews[0] ?? 'home');
  return {
    startView: allowedViews.includes(preference.startView)
      ? preference.startView
      : fallback,
    pinnedViews: [...new Set(preference.pinnedViews)].filter((view) =>
      allowedViews.includes(view),
    ),
  };
};

export const getDeliveryEntryView = (
  params: URLSearchParams,
  startView: string,
) => params.get('view') ?? (params.size === 0 ? startView : 'home');
