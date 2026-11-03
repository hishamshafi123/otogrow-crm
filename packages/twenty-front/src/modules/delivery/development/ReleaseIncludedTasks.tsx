import { Trans, useLingui } from '@lingui/react/macro';
import {
  type ReleaseBody,
  type ReleaseTask,
} from '@/delivery/development/release.types';
import { releaseDependencyWouldCycle } from '@/delivery/development/release-body';
import { StyledReleaseItem } from '@/delivery/development/releaseStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryReleaseChoicesQuery } from '~/generated-metadata/graphql';

type ReleaseIncludedTasksProps = {
  body: ReleaseBody;
  update: (body: ReleaseBody) => void;
  tasks: ReleaseTask[];
  choices: DeliveryReleaseChoicesQuery['deliveryReleaseChoices'] | null;
  searchDraft: string;
  setSearchDraft: (value: string) => void;
  afterId: string | null;
  setAfterId: (value: string | null) => void;
  setSearch: (value: string) => void;
};
export const ReleaseIncludedTasks = ({
  body,
  update,
  tasks,
  choices,
  searchDraft,
  setSearchDraft,
  afterId,
  setAfterId,
  setSearch,
}: ReleaseIncludedTasksProps) => {
  const { t } = useLingui();
  const selectedIds = body.work.map((work) => work.taskId);
  const snapshot = (id: string) =>
    choices?.selectedTasks.find((task) => task.taskId === id) ??
    tasks.find((task) => task.taskId === id);
  const updateWork = (
    id: string,
    changes: Partial<ReleaseBody['work'][number]>,
  ) =>
    update({
      ...body,
      work: body.work.map((work) =>
        work.taskId === id ? { ...work, ...changes } : work,
      ),
    });
  const remove = (id: string) =>
    update({
      ...body,
      work: body.work
        .filter((work) => work.taskId !== id)
        .map((work) => ({
          ...work,
          blockedByTaskIds: work.blockedByTaskIds.filter(
            (dependency) => dependency !== id,
          ),
        })),
    });
  return (
    <>
      <h3>
        <Trans>Included tasks and dependencies</Trans>
      </h3>
      <p>
        <Trans>
          Use the tasks already on your board. Removing a task also removes its
          dependency links. A release can include up to 30 tasks.
        </Trans>
      </p>
      {body.work.map((work) => (
        <StyledReleaseItem key={work.taskId}>
          <StyledDeliveryStack>
            <strong>
              {snapshot(work.taskId)?.title ??
                t`Selected task title unavailable`}
            </strong>
            <span>
              {t`Task revision ${work.revision}`} ·{' '}
              {snapshot(work.taskId)?.approved
                ? t`Independently approved`
                : t`Still needs independent approval`}
            </span>
            {choices &&
              choices.selectedTasks.find((task) => task.taskId === work.taskId)
                ?.revision !== work.revision && (
                <div role="alert">
                  <p>
                    <Trans>
                      This task changed. Check its current work before updating
                      the reference.
                    </Trans>
                  </p>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => {
                      const current = choices?.selectedTasks.find(
                        (task) => task.taskId === work.taskId,
                      );
                      if (current)
                        updateWork(work.taskId, {
                          revision: current.revision,
                        });
                    }}
                  >
                    <Trans>Use current task evidence</Trans>
                  </StyledDeliveryButton>
                </div>
              )}
            <StyledDeliveryGrid>
              <label>
                <Trans>Existing issue or Jira link</Trans>
                <input
                  aria-label={t`Existing issue or Jira link for ${snapshot(work.taskId)?.title ?? t`selected task`}`}
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  value={work.issueUrl}
                  onChange={(event) =>
                    updateWork(work.taskId, {
                      issueUrl: event.currentTarget.value,
                    })
                  }
                />
              </label>
              <label>
                <Trans>Pull request link</Trans>
                <input
                  aria-label={t`Pull request link for ${snapshot(work.taskId)?.title ?? t`selected task`}`}
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  value={work.pullRequestUrl}
                  onChange={(event) =>
                    updateWork(work.taskId, {
                      pullRequestUrl: event.currentTarget.value,
                    })
                  }
                />
              </label>
            </StyledDeliveryGrid>
            <details>
              <summary>{t`Dependencies (${work.blockedByTaskIds.length})`}</summary>
              <StyledDeliveryStack>
                {body.work
                  .filter((candidate) => candidate.taskId !== work.taskId)
                  .map((candidate) => {
                    const checked = work.blockedByTaskIds.includes(
                      candidate.taskId,
                    );
                    const cycle =
                      !checked &&
                      releaseDependencyWouldCycle(
                        body,
                        work.taskId,
                        candidate.taskId,
                      );
                    return (
                      <label key={candidate.taskId}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={cycle}
                          onChange={(event) =>
                            updateWork(work.taskId, {
                              blockedByTaskIds: event.currentTarget.checked
                                ? [...work.blockedByTaskIds, candidate.taskId]
                                : work.blockedByTaskIds.filter(
                                    (id) => id !== candidate.taskId,
                                  ),
                            })
                          }
                        />
                        {snapshot(candidate.taskId)?.title ??
                          t`Task title unavailable`}
                        {cycle && (
                          <span>
                            {' '}
                            · <Trans>Would create a cycle</Trans>
                          </span>
                        )}
                      </label>
                    );
                  })}
                {body.work.length < 2 && (
                  <p>
                    <Trans>Add another task to choose a dependency.</Trans>
                  </p>
                )}
              </StyledDeliveryStack>
            </details>
            <StyledDeliveryButton
              type="button"
              onClick={() => remove(work.taskId)}
            >
              <Trans>Remove task from release</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledReleaseItem>
      ))}
      <details>
        <summary>
          <Trans>Add existing tasks</Trans>
        </summary>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <label>
              <Trans>Find project tasks</Trans>
              <input
                aria-label={t`Find project tasks`}
                maxLength={200}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.currentTarget.value)}
              />
            </label>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setSearch(searchDraft.trim());
                setAfterId(null);
              }}
            >
              <Trans>Search tasks</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
          {choices && <p>{t`${choices.totalCount} accessible tasks match`}</p>}
          {choices?.tasks.map((task) => (
            <StyledReleaseItem key={task.taskId}>
              <StyledDeliveryStack>
                <span>
                  {task.title} ·{' '}
                  {task.approved ? t`Approved` : t`Work in progress`}
                </span>
                <StyledDeliveryButton
                  type="button"
                  disabled={
                    body.work.length >= 30 || selectedIds.includes(task.taskId)
                  }
                  onClick={() =>
                    update({
                      ...body,
                      work: [
                        ...body.work,
                        {
                          taskId: task.taskId,
                          revision: task.revision,
                          issueUrl: '',
                          pullRequestUrl: '',
                          blockedByTaskIds: [],
                        },
                      ],
                    })
                  }
                >
                  {selectedIds.includes(task.taskId)
                    ? t`Included`
                    : t`Include task`}
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </StyledReleaseItem>
          ))}
          <StyledDeliveryRow>
            {afterId && (
              <StyledDeliveryButton
                type="button"
                onClick={() => setAfterId(null)}
              >
                <Trans>First tasks</Trans>
              </StyledDeliveryButton>
            )}
            {choices?.nextTaskId && (
              <StyledDeliveryButton
                type="button"
                onClick={() => setAfterId(choices.nextTaskId ?? null)}
              >
                <Trans>More tasks</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </details>
    </>
  );
};
