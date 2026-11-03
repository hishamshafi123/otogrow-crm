import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  StyledAiBudgetActions,
  StyledAiBudgetList,
} from '@/otogrow-ai-budget/aiBudgetStyles';
import { StyledActivityChanges } from '@/otogrow-activity/activityStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';
import { GET_AI_SPEND_HISTORY } from '@/otogrow-ai-budget/otogrow-ai-budget.graphql';
import {
  type OtogrowAiSpendHistoryQuery,
  type OtogrowAiSpendHistoryQueryVariables,
} from '~/generated-metadata/graphql';

type AiSpendHistoryProps = { spendId: string };
export const AiSpendHistory = ({ spendId }: AiSpendHistoryProps) => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const query = useQuery<
    OtogrowAiSpendHistoryQuery,
    OtogrowAiSpendHistoryQueryVariables & { identity: string | null }
  >(GET_AI_SPEND_HISTORY, {
    variables: {
      input: { spendId, cursor, limit: 10 },
      identity: permission.scopeKey,
    },
    skip:
      !open ||
      permission.loading ||
      !permission.canManageRoles ||
      Boolean(permission.error),
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
  });
  const candidate = query.data?.otogrowAiSpendHistory;
  const history =
    !query.error &&
    !permission.loading &&
    !permission.error &&
    permission.canManageRoles &&
    candidate?.spendId === spendId &&
    candidate.workspaceId === permission.access?.workspaceId &&
    candidate.memberId === permission.access?.memberId &&
    candidate.userWorkspaceId === permission.access?.userWorkspaceId
      ? candidate
      : undefined;
  const labels: Record<string, string> = {
    RESERVED: t`Amount reserved`,
    DISPATCHED: t`Request dispatched`,
    MEDIA_PREDICTION_ACCEPTED: t`Media request accepted by provider`,
    SETTLED: t`Provider charge recorded`,
    UNCERTAIN: t`Charge needs reconciliation`,
    RELEASED: t`Reservation released before dispatch`,
    MANUALLY_RECONCILED: t`Charge reconciled by administrator`,
    LATE_PROVIDER_USAGE: t`Later provider usage received`,
  };
  const states: Record<string, string> = {
    RESERVED: t`Reserved`,
    DISPATCHED: t`Processing`,
    SETTLED: t`Recorded`,
    UNCERTAIN: t`Needs reconciliation`,
    RELEASED: t`Released`,
  };
  const fields = [
    { key: 'state', label: t`Status` },
    { key: 'reservedUsd', label: t`Reservation` },
    { key: 'actualUsd', label: t`Recorded charge` },
    { key: 'reportedActualUsd', label: t`Later provider amount` },
  ] as const;
  const display = (
    key: (typeof fields)[number]['key'],
    value: string | null | undefined,
  ) =>
    value === null || value === undefined
      ? t`Not recorded`
      : key === 'state'
        ? (states[value] ?? value)
        : t`USD ${formatAiAmount(value)}`;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <Trans>Charge history</Trans>
      </summary>
      {open && (
        <StyledDeliveryStack>
          {query.error || permission.error ? (
            <div>
              <p role="alert">
                <Trans>
                  Charge history could not load. Your access will be checked
                  again when you retry.
                </Trans>
              </p>
              <StyledDeliveryButton
                onClick={() => void query.refetch().catch(() => undefined)}
              >
                <Trans>Retry history</Trans>
              </StyledDeliveryButton>
            </div>
          ) : !permission.canManageRoles ? (
            <p role="alert">
              <Trans>Administrator access is required.</Trans>
            </p>
          ) : query.loading || !history ? (
            <p role="status">
              <Trans>Loading charge history…</Trans>
            </p>
          ) : (
            <>
              <small>
                <Trans>
                  Newest first. Names reflect the current team directory;
                  original member references remain recorded.
                </Trans>
              </small>
              {!history.events.length && (
                <p>
                  <Trans>No financial events on this page.</Trans>
                </p>
              )}
              <StyledAiBudgetList>
                {history.events.map((event) => {
                  const changed = fields.filter(
                    ({ key }) => event.before[key] !== event.after[key],
                  );
                  return (
                    <li key={event.id}>
                      <StyledDeliveryStack>
                        <div>
                          <strong>
                            {labels[event.action] ??
                              event.action.replaceAll('_', ' ').toLowerCase()}
                          </strong>
                          <p>{formatActivityTime(event.createdAt)}</p>
                          <p>
                            {event.actorAttribution === 'SYSTEM'
                              ? t`Automation`
                              : event.actorAttribution === 'INITIATOR'
                                ? t`Initiated by ${event.actorName ?? t`Former member`}`
                                : (event.actorName ?? t`Former administrator`)}
                          </p>
                        </div>
                        {changed.length > 0 && (
                          <StyledActivityChanges>
                            {changed.map(({ key, label }) => (
                              <div key={key}>
                                <dt>{label}</dt>
                                <dd>
                                  <div>
                                    <small>
                                      <Trans>Before</Trans>
                                    </small>
                                    {display(key, event.before[key])}
                                  </div>
                                  <div>
                                    <small>
                                      <Trans>After</Trans>
                                    </small>
                                    {display(key, event.after[key])}
                                  </div>
                                </dd>
                              </div>
                            ))}
                          </StyledActivityChanges>
                        )}
                        {event.evidenceReference && (
                          <p>
                            <strong>
                              <Trans>Evidence</Trans>:{' '}
                            </strong>
                            {event.evidenceReference}
                          </p>
                        )}
                        {event.reason && (
                          <p>
                            <strong>
                              <Trans>Reason</Trans>:{' '}
                            </strong>
                            {event.reason}
                          </p>
                        )}
                      </StyledDeliveryStack>
                    </li>
                  );
                })}
              </StyledAiBudgetList>
              <StyledAiBudgetActions>
                {cursor && (
                  <StyledDeliveryButton onClick={() => setCursor(undefined)}>
                    <Trans>Latest events</Trans>
                  </StyledDeliveryButton>
                )}
                {history.nextCursor && (
                  <StyledDeliveryButton
                    onClick={() => setCursor(history.nextCursor ?? undefined)}
                  >
                    <Trans>Older events</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledAiBudgetActions>
            </>
          )}
        </StyledDeliveryStack>
      )}
    </details>
  );
};
