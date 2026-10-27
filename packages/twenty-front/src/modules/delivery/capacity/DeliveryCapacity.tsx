import { useCallback, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useLingui, Plural } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  GET_CAPACITY,
  SAVE_AVAILABILITY,
} from '@/delivery/capacity/delivery-capacity.graphql';
import {
  capacityDates,
  capacityDay,
  capacityLoads,
} from '@/delivery/capacity/capacityModel';
import {
  type DeliveryCapacityQuery,
  type SaveDeliveryAvailabilityMutation,
  type DeliveryAvailabilityInput,
} from '~/generated-metadata/graphql';

type Availability =
  DeliveryCapacityQuery['deliveryCapacity']['availability'][number];
type DeliveryCapacityProps = {
  workspace: DeliveryWorkspace;
  onOpenTask: (id: string) => void;
};
export const DeliveryCapacity = (props: DeliveryCapacityProps) => {
  const access = useWorkflowAccess();
  return (
    <CapacityWorkspace
      key={access.scope}
      workspace={props.workspace}
      onOpenTask={props.onOpenTask}
    />
  );
};
type CapacityWorkspaceProps = DeliveryCapacityProps;
const CapacityWorkspace = ({
  workspace,
  onOpenTask,
}: CapacityWorkspaceProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const startDate =
    params.get('capacityFrom') ?? new Date().toLocaleDateString('en-CA');
  const dates = capacityDates(startDate);
  const [editor, setEditor] = useState<Availability | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery<DeliveryCapacityQuery>(GET_CAPACITY, {
    variables: { input: { startDate }, identity: access.scope },
    skip: !access.manager || dates.length === 0,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const [save] =
    useMutation<SaveDeliveryAvailabilityMutation>(SAVE_AVAILABILITY);
  const data =
    access.manager &&
    !query.error &&
    access.matches(query.data?.deliveryCapacity) &&
    query.data?.deliveryCapacity.startDate === startDate
      ? query.data.deliveryCapacity
      : null;
  const availability = (memberId: string, date: string): Availability =>
    data?.availability.find(
      (row) => row.memberId === memberId && row.date === date,
    ) ?? { memberId, date, minutes: null, revision: 0 };
  const saveAvailability = async (input: DeliveryAvailabilityInput) => {
    try {
      const result = await save({ variables: { input } });
      if (!result.data?.saveDeliveryAvailability) return false;
      setNotice(t`Availability saved.`);
      try {
        await query.refetch();
      } catch {
        setNotice(
          t`Availability saved. Refresh the page to update the capacity view.`,
        );
      }
      return true;
    } catch {
      try {
        await query.refetch();
      } catch {}
      return false;
    }
  };
  if (!access.manager) return null;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h2>
          <Trans>Team capacity</Trans>
        </h2>
        <p>
          <Trans>Plan production and review across all projects.</Trans>
        </p>
        <StyledDeliveryRow>
          <label>
            <Trans>Capacity start day</Trans>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value;
                requestAction(() => {
                  setEditor(null);
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    if (value) next.set('capacityFrom', value);
                    else next.delete('capacityFrom');
                    return next;
                  });
                });
              }}
            />
          </label>
          <span>
            {dates.length > 0
              ? t`Seven days through ${dates[6]}`
              : t`Choose a valid start day.`}
          </span>
        </StyledDeliveryRow>
        <details>
          <summary>
            <Trans>How capacity is calculated</Trans>
          </summary>
          <small>
            <Trans>
              Availability is working minutes available for delivery and review,
              after other commitments. Blank means unknown; zero means
              unavailable. Estimates do not measure time worked. Generation
              waiting is shown separately.
            </Trans>{' '}
            <Trans>
              Task filters below do not reduce these totals. Calendar days match
              the dates entered on tasks.
            </Trans>
          </small>
        </details>
        {notice && <p role="status">{notice}</p>}
        {query.error && (
          <div role="alert">
            <p>
              <Trans>
                Capacity could not be refreshed. Saved drafts are still here.
              </Trans>
            </p>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry capacity</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {!data && !query.error && dates.length > 0 && (
          <p role="status">
            <Trans>Loading capacity…</Trans>
          </p>
        )}
        {editor && (
          <AvailabilityEditor
            key={`${editor.memberId}:${editor.date}`}
            opened={editor}
            latest={data ? availability(editor.memberId, editor.date) : editor}
            memberName={
              workspace.members.find((member) => member.id === editor.memberId)
                ?.name ?? t`Teammate`
            }
            onSave={saveAvailability}
            onClose={() => setEditor(null)}
          />
        )}
        {data && (
          <StyledDeliveryStack>
            {workspace.members.map((member) => {
              const loads = capacityLoads(workspace.tasks, member.id);
              const unplanned = loads.filter(
                (load) => !load.date || load.date < dates[0],
              );
              const days = dates.map((date) => ({
                date,
                availability: availability(member.id, date),
                day: capacityDay(
                  loads,
                  date,
                  availability(member.id, date).minutes ?? null,
                ),
              }));
              const overloadDays = days.filter(
                ({ day }) => day.overloadMinutes > 0,
              ).length;
              const incompleteDays = days.filter(
                ({ day, availability: slot }) =>
                  day.unknownCount > 0 || !isDefined(slot.minutes),
              ).length;
              return (
                <details key={member.id}>
                  <summary>
                    <strong>{member.name}</strong> ·{' '}
                    {overloadDays > 0 ? (
                      <Plural
                        value={overloadDays}
                        one="# overloaded day"
                        other="# overloaded days"
                      />
                    ) : (
                      t`No known overload`
                    )}
                    {incompleteDays > 0
                      ? ` · ${t`${incompleteDays} days incomplete`}`
                      : ''}
                    {unplanned.length > 0
                      ? ` · ${t`${unplanned.length} assignments need dates`}`
                      : ''}
                  </summary>
                  <StyledDeliveryStack>
                    {unplanned.length > 0 && (
                      <div role="status">
                        <strong>
                          <Trans>Needs planning</Trans>
                        </strong>
                        <p>
                          <Trans>
                            Undated work and work before this range are not
                            included in daily totals. Open each task to schedule
                            it or update its estimate.
                          </Trans>
                        </p>
                        {unplanned.map((load) => (
                          <StyledDeliveryButton
                            key={`${load.task.id}:${load.kind}`}
                            onClick={() => onOpenTask(load.task.id)}
                          >
                            {load.task.title} ·{' '}
                            {load.kind === 'REVIEW' ? t`Review` : t`Production`}{' '}
                            · {load.date ?? t`No date`}
                          </StyledDeliveryButton>
                        ))}
                      </div>
                    )}
                    {days.map(({ date, availability: slot, day }) => (
                      <section
                        key={date}
                        aria-label={t`${member.name} · ${date}`}
                      >
                        <StyledDeliveryRow>
                          <strong>{date}</strong>
                          <StyledDeliveryBadge
                            data-state={
                              day.overloadMinutes > 0 ? 'BLOCKED' : undefined
                            }
                          >
                            {isDefined(slot.minutes)
                              ? t`${day.workMinutes} / ${slot.minutes} min`
                              : t`${day.workMinutes} estimated min · availability unknown`}
                          </StyledDeliveryBadge>
                          <StyledDeliveryButton
                            aria-label={t`Set availability for ${member.name} on ${date}`}
                            onClick={() =>
                              requestAction(() => {
                                setNotice('');
                                setEditor(slot);
                              })
                            }
                          >
                            <Trans>Set availability</Trans>
                          </StyledDeliveryButton>
                        </StyledDeliveryRow>
                        {day.overloadMinutes > 0 && (
                          <p role="status">{t`Over capacity by at least ${day.overloadMinutes} min.`}</p>
                        )}
                        {day.unknownCount > 0 && (
                          <p>{t`${day.unknownCount} estimates are incomplete; workload may be higher.`}</p>
                        )}
                        {day.loads.length > 0 ? (
                          <small>
                            {t`Production ${day.productionMinutes} · Revisions ${day.revisionMinutes} · Review ${day.reviewMinutes} min`}
                            {` · ${t`Generation waiting ${day.waitMinutes} min`}`}
                            {day.unknownWait
                              ? ` · ${t`Some waits are unknown`}`
                              : ''}
                          </small>
                        ) : (
                          <small>
                            <Trans>No dated work</Trans>
                          </small>
                        )}
                        <StyledDeliveryRow>
                          {day.loads.map((load) => (
                            <StyledDeliveryButton
                              key={`${load.task.id}:${load.kind}`}
                              onClick={() => onOpenTask(load.task.id)}
                            >
                              {load.task.title} ·{' '}
                              {load.kind === 'REVIEW'
                                ? t`Review`
                                : t`Production`}
                            </StyledDeliveryButton>
                          ))}
                        </StyledDeliveryRow>
                      </section>
                    ))}
                  </StyledDeliveryStack>
                </details>
              );
            })}
          </StyledDeliveryStack>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

type AvailabilityEditorProps = {
  opened: Availability;
  latest: Availability;
  memberName: string;
  onSave: (input: DeliveryAvailabilityInput) => Promise<boolean>;
  onClose: () => void;
};
export const AvailabilityEditor = ({
  opened,
  latest,
  memberName,
  onSave,
  onClose,
}: AvailabilityEditorProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [baseline, setBaseline] = useState(opened);
  const [minutes, setMinutes] = useState(
    isDefined(opened.minutes) ? String(opened.minutes) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stale = latest.revision !== baseline.revision;
  const focusInput = useCallback((element: HTMLInputElement | null) => {
    element?.focus();
  }, []);
  useDeliveryDraftStatus({
    dirty:
      minutes !== (isDefined(baseline.minutes) ? String(baseline.minutes) : ''),
    saving: busy,
  });
  return (
    <form
      aria-label={t`Daily availability`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || stale) return;
        setBusy(true);
        setError('');
        try {
          if (
            await onSave({
              memberId: baseline.memberId,
              date: baseline.date,
              minutes: minutes === '' ? null : Number(minutes),
              revision: baseline.revision,
            })
          )
            onClose();
          else
            setError(
              t`Availability was not saved. Your draft is preserved. Check for newer changes or try again.`,
            );
        } catch {
          setError(
            t`Availability was not saved. Your draft is preserved. Try again.`,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h3>{t`${memberName} · ${baseline.date}`}</h3>
        {stale && (
          <div role="alert">
            <p>
              <Trans>Availability changed while you were editing.</Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                requestAction(() => {
                  setBaseline(latest);
                  setMinutes(
                    isDefined(latest.minutes) ? String(latest.minutes) : '',
                  );
                  setError('');
                })
              }
            >
              <Trans>Reload latest availability</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <label>
          <Trans>Available working minutes</Trans>
          <input
            type="number"
            ref={focusInput}
            min={0}
            max={1440}
            step={1}
            value={minutes}
            disabled={busy}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <small>
          <Trans>
            Leave blank if unknown. Enter 0 for a day off. Include production
            and reviewing in the same allowance.
          </Trans>
        </small>
        {error && <p role="alert">{error}</p>}
        <StyledDeliveryRow>
          <StyledDeliveryButton type="submit" disabled={busy || stale}>
            <Trans>Save availability</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Cancel availability</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
