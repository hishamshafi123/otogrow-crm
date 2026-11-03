import { useLayoutEffect, useRef } from 'react';

export const useEscalationRequestGuard = (
  scope: string,
  available: boolean,
) => {
  // oxlint-disable-next-line twenty/no-state-useref -- An asynchronous response must not navigate after scope or current authority changes.
  const epoch = useRef(0);
  useLayoutEffect(() => {
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
