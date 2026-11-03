import { useState } from 'react';
import { styled } from '@linaria/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryCapacityQuery } from '~/generated-metadata/graphql';
import { type TaskWorkspaceContext } from '@/delivery/tasks/task.types';
import { AvailabilityEditor } from '@/delivery/capacity/DeliveryCapacity';
import {
  capacityReadInputs,
  clearCapacitySelection,
} from '@/delivery/capacity/read/capacity-read-navigation';
import { useCapacityReads } from '@/delivery/capacity/read/useCapacityReads';
import { useCapacityReadLabels } from '@/delivery/capacity/read/useCapacityReadLabels';
import { DeliveryCapacityAssignments } from '@/delivery/capacity/read/DeliveryCapacityAssignments';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
const StyledCapacityEditorBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
type Availability =
  DeliveryCapacityQuery['deliveryCapacity']['availability'][number];
type DeliveryPlannerCapacityProps = {
  context: TaskWorkspaceContext;
  enabled: boolean;
  readScope: string;
  businessDate: string;
  timezone: string;
};
export const DeliveryPlannerCapacity = ({
  context,
  enabled,
  readScope,
  businessDate,
  timezone,
}: DeliveryPlannerCapacityProps) => {
  const { t } = useLingui();
  const labels = useCapacityReadLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const [defaultDate, setDefaultDate] = useState(businessDate);
  if (!defaultDate && businessDate) setDefaultDate(businessDate);
  const inputs = capacityReadInputs(params, defaultDate, timezone);
  const scope = `${readScope}:${JSON.stringify(context.members.map((member) => ({ id: member.id, name: member.name, access: member.access })))}`;
  const state = useCapacityReads({
    summaryInput: inputs.summary,
    assignmentsInput: inputs.assignments,
    enabled,
    scope,
  });
  const editorSource = `${context.workspaceId}:${context.memberId}:${context.userWorkspaceId}:${params}`;
  const [editor, setEditor] = useState<{
    source: string;
    opened: Availability;
    name: string;
  } | null>(null);
  if (editor && editor.source !== editorSource) setEditor(null);
  const currentSlot = editor
    ? state.data?.members
        .find((member) => member.memberId === editor.opened.memberId)
        ?.days.find((day) => day.date === editor.opened.date)
    : undefined;
  const latest =
    editor && currentSlot
      ? {
          memberId: editor.opened.memberId,
          date: currentSlot.date,
          minutes: currentSlot.availableMinutes ?? null,
          revision: currentSlot.availabilityRevision,
        }
      : editor?.opened;
  const selectAssignments = (
    memberId: string | null,
    bucket: string,
    date: string | null,
  ) => ({
    capacityMember: memberId,
    capacityBucket: bucket,
    capacityDate: date,
    capacityMissingOwner: memberId === null ? '1' : null,
    capacityAssignmentsAfter: null,
  });
  const recover = () => void state.refresh();
  return (
    <StyledDeliveryCard aria-label={t`Complete team capacity`}>
      <StyledDeliveryStack>
        <h2>
          <Trans>Team capacity</Trans>
        </h2>
        <p>
          <Trans>
            Across all permitted projects. Task-card filters do not reduce these
            totals.
          </Trans>
        </p>
        <StyledDeliveryRow>
          <label>
            <Trans>Capacity start day</Trans>
            <input
              aria-label={t`Capacity start day`}
              type="date"
              value={
                inputs.summary?.startDate ??
                params.get('capacityFrom') ??
                defaultDate
              }
              onChange={(event) => {
                const value = event.target.value;
                requestAction(() => {
                  setEditor(null);
                  setParams(
                    taskPageDestination(params, {
                      capacityFrom: value,
                      capacityAfter: null,
                      ...clearCapacitySelection,
                    }).split('?')[1],
                  );
                });
              }}
            />
          </label>
          <small>
            {t`Calendar ${timezone}`}
            {state.data
              ? ` · ${t`Seven days through ${state.data.endDate}`}`
              : ''}
          </small>
        </StyledDeliveryRow>
        <details>
          <summary>
            <Trans>How capacity is calculated</Trans>
          </summary>
          <p>
            <Trans>
              Availability is working minutes available after other commitments.
              Blank means unknown; zero means unavailable. Remaining production,
              revision and review estimates share that allowance. They are not
              hours worked. Generation waiting does not consume working time.
            </Trans>
          </p>
          <p>
            <Trans>
              Approved tasks reserve no remaining work. Pending review reserves
              only its effective reviewer; other open work may reserve
              production and planned review separately. Undated and earlier work
              needs planning; later work is outside this seven-day window.
            </Trans>
          </p>
        </details>
        {state.notice && <p role="status">{state.notice}</p>}
        {!inputs.valid && (
          <p role="alert">
            <Trans>
              The capacity range or selection is invalid. Choose a valid
              seven-day range or reset the selection.
            </Trans>
          </p>
        )}
        {(!state.data || !inputs.valid) && (
          <>
            <p role={state.query.error ? 'alert' : 'status'}>
              {state.query.loading && !state.query.error ? (
                <Trans>Loading team workload…</Trans>
              ) : (
                <Trans>
                  Capacity could not be verified. Saved figures are hidden and
                  your availability draft is kept.
                </Trans>
              )}
            </p>
            <StyledDeliveryButton
              disabled={!enabled || state.query.loading || !inputs.summary}
              onClick={recover}
            >
              <Trans>Retry capacity</Trans>
            </StyledDeliveryButton>
          </>
        )}
        <Link
          to={taskPageDestination(params, {
            plannerView: 'capacity',
            ...(!inputs.assignments ? { capacityAfter: null } : {}),
            ...clearCapacitySelection,
          })}
        >
          {inputs.assignments ? (
            <Trans>Back to team workload</Trans>
          ) : (
            <Trans>Reset capacity pages and selection</Trans>
          )}
        </Link>
        {editor && latest && (
          <StyledCapacityEditorBoundary
            hidden={!state.data || !currentSlot}
            disabled={!state.data || !currentSlot || !enabled}
            inert={!state.data || !currentSlot || !enabled || undefined}
            aria-hidden={!state.data || !currentSlot || !enabled || undefined}
          >
            <AvailabilityEditor
              key={`${editor.opened.memberId}:${editor.opened.date}:${params}`}
              opened={editor.opened}
              latest={latest}
              memberName={editor.name}
              onSave={state.saveAvailability}
              onClose={() => setEditor(null)}
            />
          </StyledCapacityEditorBoundary>
        )}
        {state.data && !inputs.assignments && (
          <>
            <strong>{t`Teammates in this capacity view: ${state.data.totalMemberCount}`}</strong>
            <small>
              {t`Showing ${state.data.members.length} teammates on this page`}
              {state.refreshing ? ` · ${t`Refreshing`}` : ''} · {t`Checked at`}:{' '}
              {new Date(state.data.observedAt).toLocaleString(undefined, {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </small>
            {state.data.warnings.length > 0 && (
              <section aria-label={t`Planning warnings`}>
                {[
                  ...new Set(
                    state.data.warnings.map((warning) => warning.scope),
                  ),
                ].map((warningScope) => (
                  <section key={warningScope}>
                    <h3>
                      {warningScope === 'SELECTED_WEEK'
                        ? t`Selected seven-day availability`
                        : warningScope === 'OPEN_PLANNING'
                          ? t`Across open planning`
                          : t`Source coverage needs review`}
                    </h3>
                    {warningScope === 'OPEN_PLANNING' && (
                      <p>
                        <Trans>
                          These source and owner checks also include future work
                          outside the displayed week.
                        </Trans>
                      </p>
                    )}
                    {state
                      .data!.warnings.filter(
                        (warning) => warning.scope === warningScope,
                      )
                      .map((warning) => (
                        <p key={warning.code} role="status">
                          {labels.warning(warning.code)} · {warning.count}
                        </p>
                      ))}
                  </section>
                ))}
                {state.data.warnings.some((warning) =>
                  [
                    'UNAVAILABLE_PRODUCTION_OWNER',
                    'UNAVAILABLE_REVIEW_OWNER',
                  ].includes(warning.code),
                ) && (
                  <Link
                    to={taskPageDestination(
                      params,
                      selectAssignments(null, 'UNAVAILABLE_OWNER', null),
                    )}
                  >
                    <Trans>Review unavailable owners</Trans>
                  </Link>
                )}
              </section>
            )}
            {state.data.members.map((member) => (
              <details key={member.memberId}>
                <summary>
                  <strong>{member.name}</strong> ·{' '}
                  {member.overloadDays > 0
                    ? t`${member.overloadDays} overloaded days`
                    : t`No known overload`}{' '}
                  · {t`${member.incompleteDays} days incomplete`} ·{' '}
                  {t`${member.needsPlanningCount} assignments need planning`}
                </summary>
                <StyledDeliveryStack>
                  {member.needsPlanningCount > 0 && (
                    <Link
                      to={taskPageDestination(
                        params,
                        selectAssignments(
                          member.memberId,
                          'NEEDS_PLANNING',
                          null,
                        ),
                      )}
                    >{t`Needs planning for ${member.name}`}</Link>
                  )}
                  <StyledDeliveryGrid>
                    {member.days.map((day) => (
                      <section
                        key={day.date}
                        aria-label={`${member.name} · ${day.date}`}
                      >
                        <StyledDeliveryStack>
                          <strong>{day.date}</strong>
                          <StyledDeliveryBadge
                            data-state={
                              day.overloadMinutes > 0 ? 'BLOCKED' : undefined
                            }
                          >
                            {day.unknownCount > 0
                              ? t`At least ${day.workMinutes} estimated min`
                              : t`${day.workMinutes} estimated min`}{' '}
                            ·{' '}
                            {day.availabilityInvalid ||
                            day.availableMinutes == null
                              ? t`Availability unknown`
                              : t`${day.availableMinutes} available min`}
                          </StyledDeliveryBadge>
                          {day.availabilityInvalid && (
                            <p role="status">
                              <Trans>
                                Saved availability is invalid and is shown as
                                unknown. Set availability for this exact day to
                                repair it.
                              </Trans>
                            </p>
                          )}
                          {day.overloadMinutes > 0 && (
                            <p role="status">{t`Over capacity by at least ${day.overloadMinutes} min.`}</p>
                          )}
                          {day.unknownCount > 0 && (
                            <p>{t`${day.unknownCount} estimates are incomplete; workload may be higher.`}</p>
                          )}
                          <small>{t`Production ${day.productionMinutes} · Revisions ${day.revisionMinutes} · Review ${day.reviewMinutes} min`}</small>
                          <small>
                            {t`Generation waiting ${day.waitMinutes} min`}
                            {day.unknownWait
                              ? ` · ${t`Some waits are unknown`}`
                              : ''}
                          </small>
                          {day.unavailableReviewCount > 0 && (
                            <p role="status">{t`${day.unavailableReviewCount} ineligible review reservations are retained.`}</p>
                          )}
                          <Link
                            to={taskPageDestination(
                              params,
                              selectAssignments(
                                member.memberId,
                                'DAY',
                                day.date,
                              ),
                            )}
                          >{t`Review ${day.assignmentCount} assignments on ${day.date}`}</Link>
                          <StyledDeliveryButton
                            aria-label={t`Set availability for ${member.name} on ${day.date}`}
                            onClick={() =>
                              requestAction(() =>
                                setEditor({
                                  source: editorSource,
                                  name: member.name,
                                  opened: {
                                    memberId: member.memberId,
                                    date: day.date,
                                    minutes: day.availableMinutes ?? null,
                                    revision: day.availabilityRevision,
                                  },
                                }),
                              )
                            }
                          >
                            <Trans>Set availability</Trans>
                          </StyledDeliveryButton>
                        </StyledDeliveryStack>
                      </section>
                    ))}
                  </StyledDeliveryGrid>
                </StyledDeliveryStack>
              </details>
            ))}
            {!state.data.members.length && (
              <p>
                <Trans>No teammates on this page.</Trans>
              </p>
            )}
            <nav aria-label={t`Capacity teammate pages`}>
              <StyledDeliveryRow>
                {params.has('capacityAfter') && (
                  <Link
                    to={taskPageDestination(params, { capacityAfter: null })}
                  >
                    <Trans>First teammate page</Trans>
                  </Link>
                )}
                {state.data.nextCursor && (
                  <Link
                    to={taskPageDestination(params, {
                      capacityAfter: state.data.nextCursor,
                    })}
                  >
                    <Trans>Next teammate page</Trans>
                  </Link>
                )}
              </StyledDeliveryRow>
            </nav>
          </>
        )}
        {inputs.assignments &&
          (state.assignments ? (
            <DeliveryCapacityAssignments data={state.assignments} />
          ) : (
            <>
              <p role={state.assignmentQuery.error ? 'alert' : 'status'}>
                {state.assignmentQuery.loading &&
                !state.assignmentQuery.error ? (
                  <Trans>Loading capacity assignments…</Trans>
                ) : (
                  <Trans>
                    These capacity assignments could not be verified. No task
                    has been substituted.
                  </Trans>
                )}
              </p>
              <StyledDeliveryButton
                disabled={!enabled || state.assignmentQuery.loading}
                onClick={() =>
                  void state.assignmentQuery.refetch().catch(() => undefined)
                }
              >
                <Trans>Retry capacity assignments</Trans>
              </StyledDeliveryButton>
              <Link
                to={taskPageDestination(params, {
                  capacityAssignmentsAfter: null,
                })}
              >
                <Trans>First assignment page</Trans>
              </Link>
            </>
          ))}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
