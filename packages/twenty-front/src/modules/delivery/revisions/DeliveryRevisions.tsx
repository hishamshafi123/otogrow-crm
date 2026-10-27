import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryTask } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  GET_REVISIONS,
  SAVE_REVISION,
} from '@/delivery/revisions/delivery-revisions.graphql';
import { RevisionEditor } from '@/delivery/revisions/RevisionEditor';
import { useRevisionLabels } from '@/delivery/revisions/useRevisionLabels';
import {
  type DeliveryRevisionsQuery,
  type SaveDeliveryRevisionMutation,
  type DeliveryRevisionSaveInput,
} from '~/generated-metadata/graphql';
type RevisionRound =
  DeliveryRevisionsQuery['deliveryRevisions']['rounds'][number];
type DeliveryRevisionsProps = { task: DeliveryTask };
export const DeliveryRevisions = ({ task }: DeliveryRevisionsProps) => {
  const access = useWorkflowAccess();
  return <RevisionHistory key={`${access.scope}:${task.id}`} task={task} />;
};
type RevisionHistoryProps = DeliveryRevisionsProps;
const RevisionHistory = ({ task }: RevisionHistoryProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const { label, money } = useRevisionLabels();
  const [beforeRound, setBeforeRound] = useState<number | null>(null);
  const [editing, setEditing] = useState<RevisionRound | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery<DeliveryRevisionsQuery>(GET_REVISIONS, {
    variables: {
      input: { taskId: task.id, beforeRound },
      identity: access.scope,
      taskRevision: task.revision,
    },
    skip: !access.ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const [save] = useMutation<SaveDeliveryRevisionMutation>(SAVE_REVISION);
  const candidate = query.data?.deliveryRevisions;
  const data =
    !query.error && access.matches(candidate) && candidate?.taskId === task.id
      ? candidate
      : null;
  const saveRound = async (input: DeliveryRevisionSaveInput) => {
    if (!data || !access.ready) return false;
    try {
      const result = await save({ variables: { input } });
      if (!result.data?.saveDeliveryRevision) return false;
      setNotice(t`Revision details saved.`);
      try {
        await query.refetch();
      } catch {
        setNotice(
          t`Revision saved. Refresh the page to load its latest details.`,
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
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Revision rounds</Trans>
        </h3>
        <small>
          <Trans>
            Tracked from review and reopening decisions. Earlier work remains in
            submission history; missing reasons and costs are not assumed.
          </Trans>
        </small>
        {query.error && (
          <div role="alert">
            <p>
              <Trans>Revision details could not be refreshed.</Trans>
            </p>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry revision history</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {!data && !query.error && (
          <p role="status">
            <Trans>Loading revision history…</Trans>
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {editing && (
          <div hidden={!data}>
            <RevisionEditor
              key={editing.id}
              taskId={task.id}
              initial={editing}
              latest={data?.rounds.find((round) => round.id === editing.id)}
              canManage={Boolean(data?.canManage)}
              canManageFinance={Boolean(data?.canManageFinance)}
              onSave={saveRound}
              onClose={() => setEditing(null)}
            />
          </div>
        )}
        {data && (
          <>
            {data.rounds.length === 0 && (
              <p>
                <Trans>No tracked revision rounds.</Trans>
              </p>
            )}
            {data.rounds.map((round) => (
              <section
                key={round.id}
                aria-label={t`Revision round ${round.round}`}
              >
                <StyledDeliveryStack>
                  <StyledDeliveryRow>
                    <strong>
                      {t`Round ${round.round}`} · {label(round.cause)}
                    </strong>
                    <small>{new Date(round.createdAt).toLocaleString()}</small>
                  </StyledDeliveryRow>
                  <small>
                    {label(round.source)} ·{' '}
                    {round.submissionVersion
                      ? t`Submission ${round.submissionVersion}`
                      : t`Before first submission`}
                  </small>
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    {round.reason || t`No reason recorded.`}
                  </p>
                  <p>
                    {round.effortMinutes === null ||
                    round.effortMinutes === undefined
                      ? t`Revision effort not recorded`
                      : t`Recorded effort: ${round.effortMinutes} min`}
                  </p>
                  {data.canReadFinance && (
                    <p>{t`Recorded cost: ${money(round.internalCost, round.currency)} · Proposed charge: ${money(round.proposedCharge, round.currency)}`}</p>
                  )}
                  {(data.canManage || data.canManageFinance) && (
                    <StyledDeliveryButton
                      onClick={() =>
                        requestAction(() => {
                          setNotice('');
                          setEditing(round);
                        })
                      }
                    >{t`Edit round ${round.round}`}</StyledDeliveryButton>
                  )}
                </StyledDeliveryStack>
              </section>
            ))}
            <StyledDeliveryRow>
              {beforeRound && (
                <StyledDeliveryButton
                  onClick={() =>
                    requestAction(() => {
                      setEditing(null);
                      setBeforeRound(null);
                    })
                  }
                >
                  <Trans>Newest rounds</Trans>
                </StyledDeliveryButton>
              )}
              {data.nextBeforeRound && (
                <StyledDeliveryButton
                  onClick={() =>
                    requestAction(() => {
                      setEditing(null);
                      setBeforeRound(data.nextBeforeRound ?? null);
                    })
                  }
                >
                  <Trans>Older rounds</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
