import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import { useSeoRead } from '@/delivery/seo-results/useSeoRead';
import {
  GET_SEO_CHOICES,
  GET_SEO_REPORTS,
} from '@/delivery/seo-results/delivery-seo-results.graphql';
import { type SeoBody } from '@/delivery/seo-results/seo-results.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliverySeoChoicesQuery,
  type DeliverySeoReportsQuery,
} from '~/generated-metadata/graphql';

export const SeoEvidenceChoices = ({
  access,
  projectId,
  body,
  update,
  onDenied,
  ownerName,
  taskNames,
}: {
  access: ReturnType<typeof useSeoAccess>;
  projectId: string;
  body: SeoBody;
  update: (body: SeoBody) => void;
  onDenied: () => void;
  ownerName?: string;
  taskNames?: Record<string, string>;
}) => {
  const { t } = useLingui();
  const [memberAfter, setMemberAfter] = useState<string | null>(null);
  const [taskAfter, setTaskAfter] = useState<string | null>(null);
  const [selectedNames, setSelectedNames] = useState(taskNames ?? {});
  const [selectedOwnerName, setSelectedOwnerName] = useState(ownerName);
  const query = useQuery<DeliverySeoChoicesQuery>(GET_SEO_CHOICES, {
    variables: {
      input: { projectId, afterMemberId: memberAfter, afterTaskId: taskAfter },
    },
    fetchPolicy: 'no-cache',
    skip: !access.permission.ready,
  });
  const read = useSeoRead({
    access,
    value: query.data?.deliverySeoChoices,
    query,
    scope: `choices:${projectId}:${memberAfter}:${taskAfter}`,
    onDenied,
  });
  return (
    <StyledDeliveryStack>
      {!read.data && (
        <p role={query.error ? 'alert' : 'status'}>
          <Trans>Checking current owners and approved SEO work…</Trans>
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch()}
          >
            <Trans>Retry available work</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <label>
        <Trans>Report owner</Trans>
        <select
          aria-label={t`Report owner`}
          value={body.ownerId}
          required
          disabled={!read.data}
          onChange={(event) => {
            setSelectedOwnerName(
              read.data?.members.find(
                (member) => member.id === event.currentTarget.value,
              )?.name,
            );
            update({ ...body, ownerId: event.currentTarget.value });
          }}
        >
          <option value="">{t`Choose an owner`}</option>
          {body.ownerId &&
            !read.data?.members.some(
              (member) => member.id === body.ownerId,
            ) && (
              <option value={body.ownerId}>
                {selectedOwnerName ?? t`Previously selected owner`}
              </option>
            )}
          {read.data?.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      {(memberAfter || read.data?.nextMemberId) && (
        <div>
          {memberAfter && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setMemberAfter(null)}
            >
              <Trans>First owners</Trans>
            </StyledDeliveryButton>
          )}
          {read.data?.nextMemberId && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setMemberAfter(read.data?.nextMemberId ?? null)}
            >
              <Trans>More owners</Trans>
            </StyledDeliveryButton>
          )}
        </div>
      )}
      <details>
        <summary>
          <Trans>Link completed SEO work</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Only currently approved SEO tasks can be linked. Task approval and
              public backlink checks do not prove indexing, rankings, traffic or
              conversions.
            </Trans>
          </p>
          {body.tasks.length > 0 && (
            <p>{t`${body.tasks.length} tasks selected`}</p>
          )}
          {body.tasks
            .filter(
              (selected) =>
                !read.data?.tasks.some(
                  (task) => task.taskId === selected.taskId,
                ),
            )
            .map((selected) => (
              <label key={selected.taskId}>
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    update({
                      ...body,
                      tasks: body.tasks.filter(
                        (task) => task.taskId !== selected.taskId,
                      ),
                    })
                  }
                />
                {selectedNames[selected.taskId] ??
                  t`Previously selected completed task`}
              </label>
            ))}
          {read.data?.tasks.map((task) => (
            <label key={task.taskId}>
              <input
                type="checkbox"
                checked={body.tasks.some(
                  (selected) => selected.taskId === task.taskId,
                )}
                disabled={
                  body.tasks.length >= 30 &&
                  !body.tasks.some(
                    (selected) => selected.taskId === task.taskId,
                  )
                }
                onChange={(event) => {
                  if (event.currentTarget.checked)
                    setSelectedNames((previous) => ({
                      ...previous,
                      [task.taskId]: task.title,
                    }));
                  update({
                    ...body,
                    tasks: event.currentTarget.checked
                      ? [
                          ...body.tasks,
                          { taskId: task.taskId, revision: task.revision },
                        ]
                      : body.tasks.filter(
                          (selected) => selected.taskId !== task.taskId,
                        ),
                  });
                }}
              />
              {task.title}
            </label>
          ))}
          {read.data?.tasks.length === 0 && (
            <p>
              <Trans>
                No approved SEO tasks on this page. Describe completed work or
                add documented evidence instead.
              </Trans>
            </p>
          )}
          {taskAfter && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setTaskAfter(null)}
            >
              <Trans>First completed tasks</Trans>
            </StyledDeliveryButton>
          )}
          {read.data?.nextTaskId && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setTaskAfter(read.data?.nextTaskId ?? null)}
            >
              <Trans>More completed tasks</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryStack>
      </details>
      <SeoComparisonChoice
        access={access}
        projectId={projectId}
        body={body}
        update={update}
        onDenied={onDenied}
      />
    </StyledDeliveryStack>
  );
};
const SeoComparisonChoice = ({
  access,
  projectId,
  body,
  update,
  onDenied,
}: {
  access: ReturnType<typeof useSeoAccess>;
  projectId: string;
  body: SeoBody;
  update: (body: SeoBody) => void;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const [after, setAfter] = useState<string | null>(null);
  const query = useQuery<DeliverySeoReportsQuery>(GET_SEO_REPORTS, {
    variables: { input: { projectId, status: 'APPROVED', afterId: after } },
    fetchPolicy: 'no-cache',
    skip: !access.permission.ready,
  });
  const read = useSeoRead({
    access,
    value: query.data?.deliverySeoReports,
    query,
    scope: `comparison:${projectId}:${after}`,
    matches: (value) => value.project.id === projectId,
    onDenied,
  });
  return (
    <details>
      <summary>
        <Trans>Compare with an approved period</Trans>
      </summary>
      <StyledDeliveryStack>
        <p>
          <Trans>
            Choose a completed earlier period. Only matching sources,
            properties, segments, definitions, units and reporting time zones
            are compared. Differences do not establish cause.
          </Trans>
        </p>
        <label>
          <Trans>Approved comparison report</Trans>
          <select
            aria-label={t`Approved comparison report`}
            value={body.comparisonId ?? ''}
            disabled={!read.data}
            onChange={(event) => {
              const report = read.data?.items.find(
                (item) => item.id === event.currentTarget.value,
              );
              update({
                ...body,
                comparisonId: report?.id ?? null,
                comparisonVersion: report?.approvedVersion ?? null,
              });
            }}
          >
            <option value="">{t`No comparison`}</option>
            {body.comparisonId &&
              !read.data?.items.some(
                (item) => item.id === body.comparisonId,
              ) && (
                <option
                  value={body.comparisonId}
                >{t`Selected approved version ${body.comparisonVersion}`}</option>
              )}
            {read.data?.items
              .filter((item) => item.periodEnd < body.periodStart)
              .map((report) => (
                <option key={report.id} value={report.id}>
                  {report.title} · {report.periodStart} – {report.periodEnd}
                </option>
              ))}
          </select>
        </label>
        {after && (
          <StyledDeliveryButton type="button" onClick={() => setAfter(null)}>
            <Trans>First comparison reports</Trans>
          </StyledDeliveryButton>
        )}
        {read.data?.nextId && (
          <StyledDeliveryButton
            type="button"
            onClick={() => setAfter(read.data?.nextId ?? null)}
          >
            <Trans>More comparison reports</Trans>
          </StyledDeliveryButton>
        )}
        {query.error && (
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch()}
          >
            <Trans>Retry comparison reports</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </details>
  );
};
