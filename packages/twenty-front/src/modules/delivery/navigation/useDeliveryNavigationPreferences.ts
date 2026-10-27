import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';
import { useAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyState';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import {
  getDeliveryNavigationDefaults,
  resolveDeliveryNavigationPreferences,
  type DeliveryNavigationPreferences,
} from '@/delivery/navigation/delivery-navigation-preferences';

export const deliveryNavigationPreferencesState = createAtomFamilyState<
  unknown,
  string
>({
  key: 'delivery/navigationPreferences/v1',
  defaultValue: null,
  useLocalStorage: true,
  localStorageOptions: { getOnInit: true },
});

export const useDeliveryNavigationPreferences = (
  actor: DeliveryWorkspace['actor'],
  groups: ReturnType<typeof useDeliveryNavigation>,
) => {
  const { t } = useLingui();
  const { access, scopeKey, loading, error, refetch } = useOtogrowAccess();
  const ready = Boolean(
    access &&
    scopeKey &&
    !loading &&
    !error &&
    access.memberId === actor.memberId,
  );
  const [stored, setStored] = useAtomFamilyState(
    deliveryNavigationPreferencesState,
    scopeKey ?? 'unverified',
  );
  const [storageError, setStorageError] = useState<{
    scope: string | null;
    message: string;
  } | null>(null);
  const pages = groups.flatMap((group) => group.items);
  const defaults =
    access && ready
      ? getDeliveryNavigationDefaults(access)
      : { startView: 'home', pinnedViews: [] };
  const preferences = resolveDeliveryNavigationPreferences(
    ready ? stored : null,
    defaults,
    pages.map((page) => page.view),
  );
  const change = (next: DeliveryNavigationPreferences | null) => {
    if (!ready) return;
    setStorageError(null);
    try {
      setStored(next);
    } catch {
      setStorageError({
        scope: scopeKey,
        message: t`Browser storage is unavailable. Changes may last only for this session.`,
      });
    }
  };
  return {
    ready,
    accessError: error,
    retryAccess: refetch,
    scope: scopeKey,
    pages,
    preferences,
    pinnedPages: preferences.pinnedViews.flatMap((view) =>
      pages.filter((page) => page.view === view),
    ),
    error: storageError?.scope === scopeKey ? storageError?.message : null,
    change,
    reset: () => change(null),
  };
};
