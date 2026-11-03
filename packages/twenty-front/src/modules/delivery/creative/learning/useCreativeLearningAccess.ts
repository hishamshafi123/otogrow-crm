import { useCallback, useLayoutEffect, useRef } from 'react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useCreativeProductionContext } from '@/delivery/creative/production/useCreativeProductionContext';
type LearningIdentity = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  actor: {
    memberId: string;
    isAdmin: boolean;
    isManager: boolean;
    roleIds: string[];
    capabilities: string[];
  };
};
export const useCreativeLearningAccess = () => {
  const context = useCreativeProductionContext();
  // oxlint-disable-next-line twenty/no-state-useref -- Confirmed denial must invalidate outstanding private responses before React disposes their form.
  const lifetime = useRef({ active: true, epoch: 0 });
  useLayoutEffect(() => {
    const boundary = lifetime.current;
    boundary.active = true;
    boundary.epoch++;
    return () => {
      boundary.active = false;
      boundary.epoch++;
    };
  }, [context.source, context.data?.scope]);
  const invalidate = useCallback(() => {
    lifetime.current.epoch++;
  }, []);
  const capture = useCallback(() => {
    const epoch = lifetime.current.epoch;
    return () => lifetime.current.active && lifetime.current.epoch === epoch;
  }, []);
  const matches = (value: LearningIdentity) =>
    context.permission.matches(value) &&
    value.actor.memberId === value.memberId &&
    value.actor.isAdmin === context.administrator &&
    value.actor.isManager === context.permission.manager &&
    fastDeepEqual(
      [...value.actor.roleIds].sort(),
      [...(context.permission.access?.roleIds ?? [])].sort(),
    ) &&
    fastDeepEqual(
      [...value.actor.capabilities].sort(),
      [...(context.permission.access?.capabilities ?? [])].sort(),
    );
  return { ...context, matches, capture, invalidate };
};

export const isCreativeLearningSourceLost = (error: unknown) =>
  isOtogrowAccessDenied(error) ||
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some((item) => item.extensions?.code === 'NOT_FOUND'));
