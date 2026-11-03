import { useLayoutEffect, useRef } from 'react';

export const useFinanceExportRequestGuard = (
  scope: string,
  available: boolean,
) => {
  // oxlint-disable-next-line twenty/no-state-useref -- A late async response must be invalidated across authority changes and unmounts without rendering state.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    // A response must not trigger navigation or a download after authority changes.
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [scope, available]);
  return () => {
    const started = epoch.current;
    return () => available && started === epoch.current;
  };
};
