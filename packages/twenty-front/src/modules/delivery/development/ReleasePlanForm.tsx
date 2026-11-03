import { ReleaseIncludedTasks } from '@/delivery/development/ReleaseIncludedTasks';
import { ReleaseChecksForm } from '@/delivery/development/ReleaseChecksForm';
import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { type useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import { useReleaseRead } from '@/delivery/development/useReleaseRead';
import { GET_RELEASE_CHOICES } from '@/delivery/development/delivery-release.graphql';
import {
  type ReleaseBody,
  type ReleaseTask,
} from '@/delivery/development/release.types';
import { StyledReleaseBoundary } from '@/delivery/development/releaseStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryReleaseChoicesQuery } from '~/generated-metadata/graphql';

type ReleasePlanFormProps = {
  access: ReturnType<typeof useReleaseAccess>;
  projectId: string;
  body: ReleaseBody;
  update: (body: ReleaseBody) => void;
  tasks: ReleaseTask[];
  onTasks: (tasks: ReleaseTask[]) => void;
  onDenied: () => void;
  enabled: boolean;
  locked: boolean;
  onSubmit: () => void;
  onReady: (scope: string | null) => void;
};
export const ReleasePlanForm = ({
  access,
  projectId,
  body,
  update,
  tasks,
  onTasks,
  onDenied,
  enabled,
  locked,
  onSubmit,
  onReady,
}: ReleasePlanFormProps) => {
  const { t } = useLingui();
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [afterId, setAfterId] = useState<string | null>(null);
  const selectedIds = body.work.map((work) => work.taskId);
  const query = useQuery<DeliveryReleaseChoicesQuery>(GET_RELEASE_CHOICES, {
    variables: {
      input: {
        projectId,
        search,
        afterTaskId: afterId,
        selectedTaskIds: selectedIds,
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const read = useReleaseRead({
    value: query.data?.deliveryReleaseChoices,
    access,
    scope: `choices:${projectId}:${search}:${afterId}:${selectedIds.join(',')}`,
    query,
    matches: (value) =>
      value.project.id === projectId &&
      value.selectedTasks.length === selectedIds.length &&
      selectedIds.every((id) =>
        value.selectedTasks.some((task) => task.taskId === id),
      ),
    onDenied,
  });
  const data = enabled ? read.data : null;
  const [verifiedChoices, setVerifiedChoices] = useState(data);
  if (data && !fastDeepEqual(verifiedChoices, data)) {
    setVerifiedChoices(data);
  }
  const display = enabled && !query.error ? (data ?? verifiedChoices) : null;
  const ownerValid = Boolean(
    data?.owners.some((owner) => owner.id === body.ownerId),
  );
  const selectionCurrent = Boolean(
    data &&
    body.work.every((work) =>
      data.selectedTasks.some(
        (task) =>
          task.taskId === work.taskId && task.revision === work.revision,
      ),
    ),
  );
  const ready = Boolean(data && ownerValid && selectionCurrent);
  const verifiedScope = ready && data ? data.scope : null;
  useLayoutEffect(() => onReady(verifiedScope), [verifiedScope, onReady]);
  useLayoutEffect(() => {
    if (data) onTasks(data.selectedTasks);
  }, [data, onTasks]);
  return (
    <StyledDeliveryStack>
      {!data && (
        <div role={query.error ? 'alert' : 'status'}>
          <p>
            {query.error ? (
              <Trans>
                Current owners and task access could not be checked. Private
                preparation is hidden and retained while you reconnect.
              </Trans>
            ) : (
              <Trans>Checking current owners and task access…</Trans>
            )}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check plan access</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledReleaseBoundary
        hidden={!display}
        disabled={!display || locked}
        inert={!display || undefined}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !locked) onSubmit();
          }}
        >
          <StyledDeliveryStack>
            <p>
              <Trans>
                Save a plan while work is in progress. Submission requires
                approved tasks and completed release checks. Saving does not
                deploy code or contact a client.
              </Trans>
            </p>
            <StyledDeliveryGrid>
              <label>
                <Trans>Release title</Trans>
                <input
                  aria-label={t`Release title`}
                  required
                  maxLength={200}
                  value={body.title}
                  onChange={(event) =>
                    update({ ...body, title: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <Trans>Release owner</Trans>
                <select
                  aria-label={t`Release owner`}
                  required
                  value={
                    display?.owners.some((owner) => owner.id === body.ownerId)
                      ? body.ownerId
                      : ''
                  }
                  onChange={(event) =>
                    update({ ...body, ownerId: event.currentTarget.value })
                  }
                >
                  <option value="">{t`Choose an owner`}</option>
                  {display?.owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Target release date</Trans>
                <input
                  aria-label={t`Target release date`}
                  type="date"
                  required
                  value={body.targetDate}
                  onChange={(event) =>
                    update({ ...body, targetDate: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <Trans>Repository link</Trans>
                <input
                  aria-label={t`Repository link`}
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  required
                  placeholder="https://github.com/your-team/your-project"
                  value={body.repositoryUrl}
                  onChange={(event) =>
                    update({
                      ...body,
                      repositoryUrl: event.currentTarget.value,
                    })
                  }
                />
              </label>
            </StyledDeliveryGrid>
            <label>
              <Trans>Full commit identity</Trans>
              <input
                aria-label={t`Full commit identity`}
                maxLength={64}
                pattern="(?:[a-f0-9]{40}|[a-f0-9]{64})?"
                value={body.commitSha}
                onChange={(event) =>
                  update({ ...body, commitSha: event.currentTarget.value })
                }
              />
              <span>
                <Trans>
                  Optional during planning; use the full 40 or 64 character
                  commit before review.
                </Trans>
              </span>
            </label>
            <label>
              <Trans>What changes in this release?</Trans>
              <textarea
                aria-label={t`What changes in this release?`}
                maxLength={6000}
                rows={3}
                value={body.summary}
                onChange={(event) =>
                  update({ ...body, summary: event.currentTarget.value })
                }
              />
            </label>
            <label>
              <Trans>Client acceptance criteria</Trans>
              <textarea
                aria-label={t`Client acceptance criteria`}
                maxLength={6000}
                rows={3}
                value={body.acceptanceCriteria}
                onChange={(event) =>
                  update({
                    ...body,
                    acceptanceCriteria: event.currentTarget.value,
                  })
                }
              />
            </label>
            <ReleaseIncludedTasks
              body={body}
              update={update}
              tasks={tasks}
              choices={data}
              searchDraft={searchDraft}
              setSearchDraft={setSearchDraft}
              afterId={afterId}
              setAfterId={setAfterId}
              setSearch={setSearch}
            />
            <ReleaseChecksForm body={body} update={update} />
            <label>
              <Trans>Rollback plan</Trans>
              <textarea
                aria-label={t`Rollback plan`}
                maxLength={6000}
                rows={3}
                value={body.rollbackPlan}
                onChange={(event) =>
                  update({ ...body, rollbackPlan: event.currentTarget.value })
                }
              />
            </label>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!ready || locked}
            >
              <Trans>Review plan before saving</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </form>
      </StyledReleaseBoundary>
    </StyledDeliveryStack>
  );
};
