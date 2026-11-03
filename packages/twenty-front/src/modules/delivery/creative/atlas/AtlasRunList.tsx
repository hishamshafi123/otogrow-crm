import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAtlasRuns } from '@/delivery/creative/atlas/useAtlasRuns';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';
import { StyledAtlasPrompt } from '@/delivery/creative/atlas/atlasStyles';
import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';
import { creativeReviewDestination } from '@/delivery/creative/review/creative-review-navigation';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type AtlasRunListProps = { taskId: string; enabled: boolean };
export const AtlasRunList = ({ taskId, enabled }: AtlasRunListProps) => {
  const { t } = useLingui();
  const labels = useAtlasLabels();
  const [params] = useSearchParams();
  const state = useAtlasRuns(taskId, params.get('atlasRunsBefore'), enabled);
  const parameterLabels: Record<string, string> = {
    resolution: t`Resolution`,
    size: t`Image size`,
    aspectRatio: t`Aspect ratio`,
    duration: t`Duration in seconds`,
    generateAudio: t`Generate audio`,
    quality: t`Quality`,
    seed: t`Seed`,
  };
  const assetDestination = (assetId: string) =>
    creativeReviewDestination(params, {
      ...deliveryTaskSelection(taskId, 'creative'),
      view: 'creative',
      creativeAsset: assetId,
    });
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h3>
          <Trans>Saved Atlas requests</Trans>
        </h3>
        <StyledDeliveryButton
          disabled={
            !state.permission.ready || state.query.loading || !state.validCursor
          }
          onClick={() => void state.query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh saved requests</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      {!state.data && (
        <p role={state.query.error || !state.validCursor ? 'alert' : 'status'}>
          {state.query.loading && !state.query.error
            ? t`Loading saved Atlas requests…`
            : t`Saved requests could not be verified. Earlier model, prompt and cost details are hidden; refresh or return to the latest requests.`}
        </p>
      )}
      {state.data && (
        <>
          {state.refreshing && (
            <small>
              <Trans>Refreshing saved request status…</Trans>
            </small>
          )}
          {!state.data.items.length && (
            <p>
              <Trans>
                No saved Atlas requests on this page. Preparation, generation,
                media approval and final submission are separate steps.
              </Trans>
            </p>
          )}
          {state.data.items.map((run) => (
            <StyledDeliveryCard
              key={run.id}
              aria-label={`${run.modelLabel} · ${labels.status(run.status)}`}
            >
              <StyledDeliveryStack>
                <strong>{labels.status(run.status)}</strong>
                <p>
                  {run.modelLabel} · {labels.operation(run.operation)}
                </p>
                <small>
                  {new Date(run.createdAt).toLocaleString(undefined, {
                    timeZone: 'UTC',
                  })}{' '}
                  UTC
                </small>
                <p>
                  {t`Atlas estimate at request`}: USD{' '}
                  {formatAiAmount(run.quotedCostUsd)}
                </p>
                <p>
                  {t`Maximum OS reservation at request`}: USD{' '}
                  {formatAiAmount(run.maximumCostUsd)}
                </p>
                <p>
                  {run.actualCostUsd == null
                    ? t`Actual provider charge: unconfirmed.`
                    : t`Recorded actual provider charge: USD ${formatAiAmount(run.actualCostUsd)}`}
                </p>
                <p>
                  {t`Current spending status`}: {labels.cost(run.costState)}
                </p>
                {run.publicationCancelled && (
                  <p role="status">
                    <Trans>
                      Publication is cancelled locally. This does not promise
                      that the provider stopped or refunded the request.
                    </Trans>
                  </p>
                )}
                {run.status === 'UNCERTAIN' && (
                  <p role="status">
                    <Trans>
                      Do not submit this generation again blindly. Keep the
                      saved prediction and reservation for status recovery or
                      administrator reconciliation.
                    </Trans>
                  </p>
                )}
                {run.error && <p role="alert">{run.error}</p>}
                <StyledDeliveryRow>
                  {run.assetId && (
                    <Link to={assetDestination(run.assetId)}>
                      <Trans>Review this exact output</Trans>
                    </Link>
                  )}
                  {run.canResume && run.providerPredictionId && (
                    <StyledDeliveryButton
                      disabled={state.busy}
                      onClick={() => void state.action(run, 'resume')}
                    >
                      <Trans>Check known Atlas job</Trans>
                    </StyledDeliveryButton>
                  )}
                  {run.canCancel && (
                    <StyledDeliveryButton
                      disabled={state.busy}
                      onClick={() => void state.action(run, 'cancel')}
                    >
                      <Trans>Stop local publication</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledDeliveryRow>
                <details>
                  <summary>
                    <Trans>Recorded model, inputs and source versions</Trans>
                  </summary>
                  <p>
                    {t`Exact model operation`}: {run.profileId} ·{' '}
                    {t`Schema version`}: {run.schemaRevision}
                  </p>
                  <p>
                    {t`Task version`}: {run.taskRevision} ·{' '}
                    {t`Approved brief version`}: {run.briefVersion} ·{' '}
                    {t`Production access version`}: {run.settingsVersion} ·{' '}
                    {t`Workspace configuration version`}:{' '}
                    {run.configurationRevision}
                  </p>
                  <p>
                    {run.target === 'BRIEF'
                      ? t`Static image from the approved brief`
                      : t`Recorded production shot version: ${run.shotVersion ?? '—'}`}
                  </p>
                  <StyledAtlasPrompt>{run.prompt}</StyledAtlasPrompt>
                  {Object.entries(run.parameters)
                    .filter(
                      ([name, value]) => name !== '__typename' && value != null,
                    )
                    .map(([name, value]) => (
                      <p key={name}>
                        {parameterLabels[name] ?? t`Recorded setting`}:{' '}
                        {typeof value === 'boolean'
                          ? value
                            ? t`Yes`
                            : t`No`
                          : String(value)}
                      </p>
                    ))}
                  {run.referenceAssetIds.map((assetId, index) => (
                    <p key={assetId}>
                      <Link
                        to={assetDestination(assetId)}
                      >{t`Review exact reference image ${index + 1}`}</Link>
                    </p>
                  ))}
                  <p>
                    {t`Saved request`}: {run.id} · {t`Request identity`}:{' '}
                    {run.requestId}
                  </p>
                  {run.providerPredictionId && (
                    <p>
                      {t`Atlas prediction`}: {run.providerPredictionId}
                    </p>
                  )}
                  {run.providerStatus && (
                    <p>
                      {t`Atlas recorded status`}: {run.providerStatus}
                    </p>
                  )}
                  <p>
                    {t`Recorded cost state`}: {labels.cost(run.costState)}
                  </p>
                  <p>
                    <Trans>
                      The estimate is not an invoice. The configured OS
                      reservation is not a guaranteed provider billing ceiling.
                      Successful output may still have an unresolved charge.
                    </Trans>
                  </p>
                </details>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
        </>
      )}
      <nav aria-label={t`Atlas request pages`}>
        <StyledDeliveryRow>
          {(params.has('atlasRunsBefore') || state.query.error) && (
            <Link to={taskPageDestination(params, { atlasRunsBefore: null })}>
              <Trans>Latest saved requests</Trans>
            </Link>
          )}
          {state.data?.nextBeforeId && (
            <Link
              to={taskPageDestination(params, {
                atlasRunsBefore: state.data.nextBeforeId,
              })}
            >
              <Trans>Earlier saved requests</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </nav>
    </StyledDeliveryStack>
  );
};
