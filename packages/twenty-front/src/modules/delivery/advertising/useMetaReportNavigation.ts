import { useLocation, useSearchParams } from 'react-router-dom';
import {
  readMetaReportCursorHistory,
  readMetaReportNavigation,
  writeMetaReportNavigation,
  type MetaReportNavigationValue,
} from '@/delivery/advertising/meta-report-navigation';

export const useMetaReportNavigation = (scope: string) => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const parsed = readMetaReportNavigation(params);
  const value: MetaReportNavigationValue = parsed.success
    ? parsed.data
    : { archive: 'ACTIVE' };
  const previous = readMetaReportCursorHistory(location.state, scope, value);
  const update = (next: MetaReportNavigationValue, pages: string[] = []) => {
    const state: unknown = location.state;
    setParams(writeMetaReportNavigation(params, next), {
      state: {
        ...(state && typeof state === 'object' && !Array.isArray(state)
          ? state
          : {}),
        deliveryMetaPages: {
          scope,
          query: JSON.stringify(next),
          previous: pages.slice(-100),
        },
      },
    });
  };
  return {
    value,
    valid: parsed.success,
    hasPrevious: previous.length > 0,
    reset: () => update({ archive: 'ACTIVE' }),
    filter: (
      filters: Omit<MetaReportNavigationValue, 'after' | 'selectedId'>,
    ) => update(filters),
    select: (selectedId: string) => update({ ...value, selectedId }, previous),
    older: (after: string) =>
      update({ ...value, after, selectedId: undefined }, [
        ...previous,
        value.after ?? '',
      ]),
    newer: () =>
      update(
        {
          ...value,
          after: previous[previous.length - 1] || undefined,
          selectedId: undefined,
        },
        previous.slice(0, -1),
      ),
    latest: () => update({ ...value, after: undefined, selectedId: undefined }),
  };
};
