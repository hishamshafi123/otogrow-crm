import { useCallback, useLayoutEffect, useRef } from 'react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { type VideoQaIdentity } from '@/delivery/creative/video-qa/video-qa.types';
export const useVideoQaAccess = () => {
  const state = useAssistantAccess();
  // oxlint-disable-next-line twenty/no-state-useref -- Confirmed local denial must invalidate late private responses synchronously.
  const lifetime = useRef({ epoch: 0, active: true });
  useLayoutEffect(() => {
    const boundary = lifetime.current;
    boundary.active = true;
    boundary.epoch++;
    return () => {
      boundary.active = false;
      boundary.epoch++;
    };
  }, [state.source]);
  const invalidateSource = useCallback(() => {
    lifetime.current.epoch++;
  }, []);
  const captureSource = useCallback(() => {
    const epoch = lifetime.current.epoch;
    return () => lifetime.current.active && lifetime.current.epoch === epoch;
  }, []);
  return {
    ...state,
    invalidateSource,
    captureSource,
    matches: (value: VideoQaIdentity) =>
      state.permission.matches(value) &&
      value.actor.memberId === value.memberId &&
      value.actor.isManager === state.permission.manager &&
      value.actor.isAdmin === state.administrator &&
      fastDeepEqual(
        [...value.actor.roleIds].sort(),
        [...(state.permission.access?.roleIds ?? [])].sort(),
      ) &&
      fastDeepEqual(
        [...value.actor.capabilities].sort(),
        [...(state.permission.access?.capabilities ?? [])].sort(),
      ),
  };
};
