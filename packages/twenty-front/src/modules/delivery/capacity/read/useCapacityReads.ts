import { useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  type DeliveryCapacitySummaryInput,
  type DeliveryCapacityAssignmentsInput,
  type DeliveryCapacitySummaryQuery,
  type DeliveryCapacityAssignmentsQuery,
  type DeliveryAvailabilityInput,
  type SaveDeliveryAvailabilityMutation,
} from '~/generated-metadata/graphql';
import {
  GET_CAPACITY_SUMMARY,
  GET_CAPACITY_ASSIGNMENTS,
} from '@/delivery/capacity/read/delivery-capacity-read.graphql';
import { SAVE_AVAILABILITY } from '@/delivery/capacity/delivery-capacity.graphql';
import {
  type CapacitySummary,
  type CapacityAssignments,
} from '@/delivery/capacity/read/capacity-read.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
export const useCapacityReads = ({
  summaryInput,
  assignmentsInput,
  enabled,
  scope,
}: {
  summaryInput: DeliveryCapacitySummaryInput | null;
  assignmentsInput: DeliveryCapacityAssignmentsInput | null;
  enabled: boolean;
  scope: string;
}) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const authorized = enabled && permission.ready && permission.manager;
  const summaryKey = `${scope}:${JSON.stringify(summaryInput)}`;
  const assignmentKey = `${scope}:${JSON.stringify(assignmentsInput)}`;
  const query = useQuery<DeliveryCapacitySummaryQuery>(GET_CAPACITY_SUMMARY, {
    variables: { input: summaryInput, identity: scope },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !authorized || !summaryInput,
  });
  const assignmentQuery = useQuery<DeliveryCapacityAssignmentsQuery>(
    GET_CAPACITY_ASSIGNMENTS,
    {
      variables: { input: assignmentsInput, identity: scope },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized || !assignmentsInput,
    },
  );
  const [knownSlot, setKnownSlot] = useState<{
    scope: string;
    row: SaveDeliveryAvailabilityMutation['saveDeliveryAvailability'];
  } | null>(null);
  const candidate = query.data?.deliveryCapacitySummary;
  const summaryTrusted =
    authorized &&
    summaryInput &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.startDate === summaryInput.startDate &&
    candidate.timezone === summaryInput.timezone &&
    (!knownSlot ||
      knownSlot.scope !== scope ||
      !candidate.members.some(
        (member) =>
          member.memberId === knownSlot.row.memberId &&
          member.days.some(
            (day) =>
              day.date === knownSlot.row.date &&
              day.availabilityRevision < knownSlot.row.revision,
          ),
      ));
  const [summaryEvidence, setSummaryEvidence] = useState<{
    key: string;
    data: CapacitySummary;
  } | null>(null);
  const fresh = summaryTrusted && !query.loading ? candidate : null;
  if (
    fresh &&
    (summaryEvidence?.key !== summaryKey ||
      !fastDeepEqual(fresh, summaryEvidence.data))
  )
    setSummaryEvidence({ key: summaryKey, data: fresh });
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const data =
    fresh ??
    (summaryTrusted && refreshing && summaryEvidence?.key === summaryKey
      ? summaryEvidence.data
      : null);
  const assignmentCandidate = assignmentQuery.data?.deliveryCapacityAssignments;
  const assignmentTrusted =
    authorized &&
    assignmentsInput &&
    !assignmentQuery.error &&
    permission.matches(assignmentCandidate) &&
    assignmentCandidate?.startDate === assignmentsInput.startDate &&
    assignmentCandidate.timezone === assignmentsInput.timezone &&
    assignmentCandidate.bucket === assignmentsInput.bucket &&
    (assignmentCandidate.selectedMemberId ?? null) ===
      assignmentsInput.memberId &&
    (assignmentCandidate.date ?? null) === assignmentsInput.date;
  const [assignmentEvidence, setAssignmentEvidence] = useState<{
    key: string;
    data: CapacityAssignments;
  } | null>(null);
  const freshAssignments =
    assignmentTrusted && !assignmentQuery.loading ? assignmentCandidate : null;
  if (
    freshAssignments &&
    (assignmentEvidence?.key !== assignmentKey ||
      !fastDeepEqual(freshAssignments, assignmentEvidence.data))
  )
    setAssignmentEvidence({ key: assignmentKey, data: freshAssignments });
  const refreshingAssignments =
    assignmentQuery.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(
      assignmentQuery.networkStatus,
    );
  const assignments =
    freshAssignments ??
    (assignmentTrusted &&
    refreshingAssignments &&
    assignmentEvidence?.key === assignmentKey
      ? assignmentEvidence.data
      : null);
  const [mutate] =
    useMutation<SaveDeliveryAvailabilityMutation>(SAVE_AVAILABILITY);
  const [message, setMessage] = useState({ source: summaryKey, text: '' });
  if (message.source !== summaryKey)
    setMessage({ source: summaryKey, text: '' });
  const setNotice = (text: string) =>
    setMessage((current) =>
      current.source === summaryKey ? { source: summaryKey, text } : current,
    );
  const notice = message.source === summaryKey ? message.text : '';
  // oxlint-disable-next-line twenty/no-state-useref -- A late availability response cannot publish another scope's private planning figures.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [scope, authorized, summaryKey]);
  const refresh = async () => {
    const results = await Promise.allSettled([
      ...(summaryInput ? [query.refetch()] : []),
      ...(assignmentsInput ? [assignmentQuery.refetch()] : []),
    ]);
    return results.every((result) => result.status === 'fulfilled');
  };
  const saveAvailability = async (input: DeliveryAvailabilityInput) => {
    if (
      !authorized ||
      !data?.members.some(
        (member) =>
          member.memberId === input.memberId &&
          member.days.some(
            (day) =>
              day.date === input.date &&
              day.availabilityRevision === input.revision,
          ),
      )
    )
      return false;
    const started = epoch.current;
    try {
      const row = (await mutate({ variables: { input } })).data
        ?.saveDeliveryAvailability;
      if (
        !row ||
        row.memberId !== input.memberId ||
        row.date !== input.date ||
        row.revision <= input.revision
      )
        return false;
      if (started !== epoch.current) return true;
      setKnownSlot({ scope, row });
      setNotice(t`Availability saved.`);
      if (!(await refresh()) && started === epoch.current)
        setNotice(
          t`Availability saved. Refresh capacity to verify the updated totals.`,
        );
      return true;
    } catch {
      await refresh();
      return false;
    }
  };
  return {
    data,
    retained: summaryEvidence?.key === summaryKey ? summaryEvidence.data : null,
    assignments,
    query,
    assignmentQuery,
    notice,
    refresh,
    saveAvailability,
    refreshing,
    refreshingAssignments,
  };
};
