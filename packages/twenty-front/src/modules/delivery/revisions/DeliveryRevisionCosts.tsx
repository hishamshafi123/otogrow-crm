import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { GET_REVISION_COSTS } from '@/delivery/revisions/delivery-revisions.graphql';
import { useRevisionLabels } from '@/delivery/revisions/useRevisionLabels';
import { type DeliveryRevisionCostsQuery } from '~/generated-metadata/graphql';
type DeliveryRevisionCostsProps = { workspace: DeliveryWorkspace };
export const DeliveryRevisionCosts = ({
  workspace,
}: DeliveryRevisionCostsProps) => {
  const access = useWorkflowAccess();
  return <RevisionCosts key={access.scope} workspace={workspace} />;
};
type RevisionCostsProps = DeliveryRevisionCostsProps;
const RevisionCosts = ({ workspace }: RevisionCostsProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { label, money } = useRevisionLabels();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today.slice(0, 8) + '01');
  const [endDate, setEndDate] = useState(today);
  const [projectId, setProjectId] = useState('');
  const canRead =
    access.ready &&
    (access.access?.capabilities.includes('finance.read') === true ||
      access.access?.capabilities.includes('workspace.admin') === true ||
      access.access?.capabilities.includes('finance.manage') === true);
  const valid = Boolean(
    startDate &&
    endDate &&
    startDate <= endDate &&
    (Date.parse(endDate) - Date.parse(startDate)) / 86400000 <= 366,
  );
  const query = useQuery<DeliveryRevisionCostsQuery>(GET_REVISION_COSTS, {
    variables: {
      input: { startDate, endDate, projectId: projectId || null },
      identity: access.scope,
    },
    skip: !canRead || !valid,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const data =
    canRead &&
    valid &&
    !query.error &&
    !query.loading &&
    access.matches(query.data?.deliveryRevisionCosts) &&
    query.data?.deliveryRevisionCosts.startDate === startDate &&
    query.data.deliveryRevisionCosts.endDate === endDate &&
    query.data.deliveryRevisionCosts.projectId === (projectId || null)
      ? query.data?.deliveryRevisionCosts
      : null;
  if (!canRead) return null;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Revision costs by cause</Trans>
        </h3>
        <p>
          <Trans>
            Recorded internal revision costs and proposed client charges,
            separated by currency. These are not cash, invoices or full
            profitability. Unknown costs remain unrecorded.
          </Trans>
        </p>
        <StyledDeliveryRow>
          <label>
            <Trans>Rounds opened from (UTC)</Trans>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <Trans>Through (UTC)</Trans>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label>
            <Trans>Revision project</Trans>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">{t`All projects`}</option>
              {workspace.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </StyledDeliveryRow>
        {!valid && (
          <p role="alert">
            <Trans>Choose a valid date range of at most 366 days.</Trans>
          </p>
        )}
        {query.error && (
          <div role="alert">
            <p>
              <Trans>
                Revision costs could not be refreshed. Retry to load the current
                totals.
              </Trans>
            </p>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry revision costs</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {valid && !data && !query.error && (
          <p role="status">
            <Trans>Loading revision costs…</Trans>
          </p>
        )}
        {data?.groups.length === 0 && (
          <p>
            <Trans>No tracked rounds opened in this range.</Trans>
          </p>
        )}
        {data?.groups.map((group) => {
          const recordedCost =
            group.missingCostCount === group.rounds
              ? t`Not recorded`
              : money(group.recordedCost, group.currency);
          return (
            <section
              key={`${group.projectId}:${group.cause}:${group.currency}`}
              aria-label={`${group.projectName} · ${label(group.cause)}`}
            >
              <strong>
                {group.projectName} · {label(group.cause)} ·{' '}
                {group.currency ?? t`No currency recorded`}
              </strong>
              <p>{t`Tracked rounds: ${group.rounds} · Recorded cost ${recordedCost} · Proposed charges ${money(group.proposedCharges, group.currency)}`}</p>
              <p>{t`${group.missingCostCount} costs unrecorded · ${group.recordedEffortMinutes} recorded minutes · ${group.missingEffortCount} effort entries missing`}</p>
              {workspace.projects.some(
                (project) => project.id === group.projectId,
              ) && (
                <Link
                  to={`/delivery?view=planner&project=${group.projectId}`}
                >{t`Open ${group.projectName} tasks`}</Link>
              )}
            </section>
          );
        })}
        <small>
          <Trans>
            Use these figures to investigate rework. Reconcile costs with
            salary, generation and expense allocations before adding them to
            profitability reports.
          </Trans>
        </small>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
