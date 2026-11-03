import { isCreativeSourceUnavailable } from '@/delivery/creative/production/creative-production-errors';
import {
  type CreativeProductionActor,
  type CreativeProductionTask,
} from '@/delivery/creative/production/creative-production.types';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { useLayoutEffect, useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { AtlasProductionTools } from '@/delivery/creative/atlas/AtlasProductionTools';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const GET_MODELS = gql`
  query DeliveryMediaModels($taskId: String!) {
    deliveryMediaModels(taskId: $taskId)
  }
`;
const CHANGE_MEDIA = gql`
  mutation ChangeDeliveryMedia($input: JSON!) {
    changeDeliveryMedia(input: $input)
  }
`;
type DeliveryMediaProps = {
  task: CreativeProductionTask;
  workspace?: DeliveryWorkspace;
  actor?: CreativeProductionActor;
  onAuthorityLost?: () => void;
  onChanged: () => Promise<unknown>;
};
export const DeliveryMedia = ({
  task,
  workspace,
  actor: currentActor,
  onAuthorityLost,
  onChanged,
}: DeliveryMediaProps) => {
  const { t } = useLingui();
  const actor = currentActor ?? workspace?.actor;
  const query = useQuery<{
    deliveryMediaModels: { id: string; kind: string; cost: null }[];
  }>(GET_MODELS, {
    variables: { taskId: task.id },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });
  useLayoutEffect(() => {
    if (isCreativeSourceUnavailable(query.error)) onAuthorityLost?.();
  }, [query.error, onAuthorityLost]);
  const [mutate, mutation] = useMutation(CHANGE_MEDIA);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = changing || mutation.loading;
  const initialInputs = {
    shotId: '',
    modelId: '',
    referenceIds: [] as string[],
    confirmed: false,
  };
  const draft = useDeliveryDraft({
    initialValues: initialInputs,
    revision: task.revision,
    busy,
  });
  const { shotId, modelId, referenceIds, confirmed } = draft.values;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [hasVerifiedModelSnapshot, setHasVerifiedModelSnapshot] =
    useState(false);
  const document = task.details.creative;
  if (!document) return null;
  const settings = document.mediaSettings;
  const modelsVerified =
    !query.loading && !query.error && isDefined(query.data);
  if (modelsVerified && !hasVerifiedModelSnapshot)
    setHasVerifiedModelSnapshot(true);
  const models = query.data?.deliveryMediaModels ?? [];
  const model = modelsVerified
    ? models.find((item) => item.id === modelId)
    : undefined;
  const shot = document.shots.find((item) => item.id === shotId);
  const role = actor?.isAdmin
    ? 'ADMIN'
    : actor?.isManager
      ? 'MANAGER'
      : 'MEMBER';
  const enabled = settings?.enabled === true && settings.roles.includes(role);
  const update = (values: typeof initialInputs) => {
    draft.update({ ...values, confirmed: false });
    setRequestId(crypto.randomUUID());
  };
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    const results = await Promise.allSettled([
      Promise.resolve().then(() => query.refetch()),
      Promise.resolve().then(onChanged),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      setError(
        t`Media status could not be fully refreshed. Your draft is kept. Retry before relying on updated models or run status.`,
      );
    setRefreshing(false);
  };
  const change = async (
    fields: Record<string, unknown>,
    revision = task.revision,
  ) => {
    if (fields.action !== 'cancel' && !modelsVerified) return false;
    setError('');
    setChanging(true);
    try {
      await mutate({
        variables: {
          input: { ...fields, taskId: task.id, revision },
        },
      });
    } catch (failure) {
      if (isCreativeSourceUnavailable(failure)) onAuthorityLost?.();
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to update generation.`,
      );
      setChanging(false);
      return false;
    }
    try {
      await onChanged();
    } catch {
      setError(
        t`Saved, but this page could not refresh. Refresh before making another change.`,
      );
    }
    setChanging(false);
    return true;
  };
  const statuses: Record<string, string> = {
    QUEUED: t`Queued`,
    RUNNING: t`Generating`,
    SUCCEEDED: t`Ready for media review`,
    FAILED: t`Failed — review before retrying`,
    CANCELLED: t`Cancelled`,
  };
  return (
    <StyledDeliveryStack>
      <AtlasProductionTools
        taskId={task.id}
        taskRevision={task.revision}
        onChanged={onChanged}
      />
      <StyledDeliveryRow>
        <h4>
          <Trans>Google still-image inspection</Trans>
        </h4>
        <StyledDeliveryButton
          disabled={refreshing || query.loading}
          onClick={() => void refresh()}
        >
          {refreshing ? t`Refreshing media status…` : t`Refresh media status`}
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {error && <p role="alert">{error}</p>}
      <p>
        <Trans>
          Selected still images can be inspected with a permitted Google model.
          These findings do not approve media; motion and audio require human
          review. Use Atlas above for supported image/video generation, or keep
          uploading assets created in your existing tools. Legacy Google
          generation remains unavailable here.
        </Trans>
      </p>
      {query.error ? (
        <div>
          <p role="alert">
            <Trans>
              Media model access could not be checked. Your draft is kept. Retry
              before changing generation settings or starting a request.
            </Trans>
          </p>
          <StyledDeliveryButton
            disabled={query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Retry media model check</Trans>
          </StyledDeliveryButton>
        </div>
      ) : !modelsVerified ? (
        <p role="status">
          <Trans>Checking media model access…</Trans>
        </p>
      ) : !models.length ? (
        <p>
          <Trans>
            No supported Google media models are configured. Upload assets made
            in your existing tools, or ask an administrator to configure a
            supported still-image inspection model.
          </Trans>
        </p>
      ) : null}
      {actor?.isAdmin && hasVerifiedModelSnapshot && (
        <details>
          <summary>{t`Generation access for this production`}</summary>
          <DeliveryGuardedForm
            revision={task.revision}
            busy={busy}
            disabled={!modelsVerified}
            onSave={(data, revision) =>
              change(
                {
                  action: 'configure',
                  enabled: data.get('enabled') === 'on',
                  modelIds: [
                    ...new Set([
                      ...data.getAll('modelIds'),
                      ...(settings?.modelIds.filter((id) =>
                        id.startsWith('atlascloud/'),
                      ) ?? []),
                    ]),
                  ],
                  roles: data.getAll('roles'),
                  dailyRunLimit: Number(data.get('dailyRunLimit')),
                  allowUnknownCost: false,
                },
                revision,
              )
            }
          >
            <fieldset
              hidden={!modelsVerified}
              disabled={busy || !modelsVerified}
            >
              <StyledDeliveryStack>
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={settings?.enabled ?? false}
                  />
                  {t`Enable generation`}
                </label>
                <label>
                  <Trans>Allowed models</Trans>
                  <select
                    name="modelIds"
                    multiple
                    defaultValue={settings?.modelIds ?? []}
                  >
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} ·{' '}
                        {item.kind === 'IMAGE'
                          ? t`Image`
                          : item.kind === 'INSPECTION'
                            ? item.id === 'google/gemini-3.5-flash-lite'
                              ? t`Image and video quality review`
                              : t`Image quality review`
                            : t`Video`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Allowed access levels</Trans>
                  <select
                    name="roles"
                    multiple
                    defaultValue={settings?.roles ?? ['ADMIN', 'MANAGER']}
                  >
                    <option value="ADMIN">{t`Admin`}</option>
                    <option value="MANAGER">{t`Manager`}</option>
                    <option value="MEMBER">{t`Assigned employee`}</option>
                  </select>
                </label>
                <label>
                  <Trans>Daily run limit for this production (UTC)</Trans>
                  <input
                    name="dailyRunLimit"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={settings?.dailyRunLimit ?? 3}
                  />
                </label>
                <p>
                  <Trans>
                    Paid requests require supported pricing and an available AI
                    budget. Unknown pricing cannot be bypassed here.
                  </Trans>
                </p>
                <small>
                  <Trans>
                    One output per request. Failed and cancelled requests count
                    toward the limit. Provider account billing controls remain
                    separate.
                  </Trans>
                </small>
                <StyledDeliveryButton type="submit">
                  <Trans>Save generation access</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </fieldset>
          </DeliveryGuardedForm>
        </details>
      )}
      <StyledDeliveryCard>
        {draft.stale && (
          <DeliveryDraftConflict onReload={draft.reload} busy={busy} />
        )}
        <fieldset
          hidden={!modelsVerified}
          disabled={busy || draft.stale || !modelsVerified}
        >
          <StyledDeliveryStack>
            <StyledDeliveryGrid>
              <label>
                <Trans>Shot</Trans>
                <select
                  value={shotId}
                  onChange={(event) => {
                    update({ ...draft.values, shotId: event.target.value });
                  }}
                >
                  <option value="">{t`Select shot`}</option>
                  {document.shots.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Model</Trans>
                <select
                  value={modelId}
                  onChange={(event) => {
                    update({
                      ...draft.values,
                      modelId: event.target.value,
                      referenceIds: [],
                    });
                  }}
                >
                  <option value="">{t`Select model`}</option>
                  {models
                    .filter((item) => settings?.modelIds.includes(item.id))
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.id}
                      </option>
                    ))}
                </select>
              </label>
              {(model?.kind === 'IMAGE' || model?.kind === 'INSPECTION') && (
                <label>
                  <Trans>Reference images — up to three, under 6 MB each</Trans>
                  <select
                    multiple
                    value={referenceIds}
                    onChange={(event) => {
                      update({
                        ...draft.values,
                        referenceIds: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value,
                        ),
                      });
                    }}
                  >
                    {document.assets
                      .filter(
                        (asset) =>
                          asset.storageState === 'READY' &&
                          asset.mimeType.startsWith('image/') &&
                          asset.size <= 6000000 &&
                          (model?.kind === 'INSPECTION' ||
                            asset.reviews.at(-1)?.decision === 'APPROVED'),
                      )
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </StyledDeliveryGrid>
            {shot && model && (
              <>
                <p>
                  <Trans>
                    This request sends the shot prompt, current approved brief
                    and selected references to the chosen provider.
                  </Trans>
                </p>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {model.kind === 'IMAGE'
                    ? shot.imagePrompt
                    : model.kind === 'INSPECTION'
                      ? t`Inspect selected still images against the approved brief. Cite visible issues and coverage limits.`
                      : shot.animationPrompt}
                </pre>
                <details>
                  <summary>{t`Review brief sent to provider`}</summary>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(document.brief, null, 2)}
                  </pre>
                </details>
                {model.kind === 'CLIP' && (
                  <small>
                    <Trans>
                      Video uses the shot’s selected approved image. Duration is
                      a prompt target, not a guaranteed output length.
                    </Trans>
                  </small>
                )}
                <p>
                  <Trans>
                    Paid requests are checked against configured pricing and AI
                    budgets before they start. Cancellation may still incur
                    provider charges.
                  </Trans>
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) =>
                      draft.update({
                        ...draft.values,
                        confirmed: event.target.checked,
                      })
                    }
                  />
                  {t`I reviewed these inputs and authorize this generation request`}
                </label>
              </>
            )}
            <StyledDeliveryButton
              disabled={
                !modelsVerified ||
                !enabled ||
                model?.kind === 'IMAGE' ||
                model?.kind === 'CLIP' ||
                !confirmed ||
                !shot ||
                !model ||
                busy ||
                ['APPROVED', 'IN_REVIEW'].includes(task.details.state)
              }
              onClick={async () => {
                if (
                  !modelsVerified ||
                  busy ||
                  draft.stale ||
                  !confirmed ||
                  !model ||
                  !shot ||
                  model.kind === 'IMAGE' ||
                  model.kind === 'CLIP'
                )
                  return;
                if (
                  await change(
                    {
                      action: 'generate',
                      shotId,
                      modelId,
                      kind: model?.kind,
                      referenceAssetIds: referenceIds,
                      confirm: true,
                      requestId,
                    },
                    draft.revision,
                  )
                ) {
                  draft.markSaved(initialInputs);
                  setRequestId(crypto.randomUUID());
                }
              }}
            >
              {model?.kind === 'INSPECTION'
                ? t`Inspect selected images`
                : model?.kind === 'IMAGE' || model?.kind === 'CLIP'
                  ? t`Generation unavailable`
                  : t`Select a model to continue`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryCard>
      {(document.mediaRuns ?? [])
        .filter((run) => run.kind !== 'VIDEO_QA')
        .slice()
        .reverse()
        .map((run) => (
          <StyledDeliveryCard key={run.id}>
            <StyledDeliveryStack>
              <strong>{statuses[run.status]}</strong>
              <small>
                {run.modelId} · {new Date(run.createdAt).toLocaleString()} ·{' '}
                {t`Cost unknown`}
              </small>
              {run.error && <p>{run.error}</p>}
              {run.inspection && (
                <>
                  <p>{run.inspection.summary}</p>
                  {run.inspection.findings.map((finding, index) => (
                    <div key={index}>
                      <strong>
                        {
                          task.details.creative?.assets.find(
                            (asset) => asset.id === finding.assetId,
                          )?.name
                        }
                      </strong>
                      <p>{finding.evidence}</p>
                      <p>{finding.correction}</p>
                    </div>
                  ))}
                  <small>{run.inspection.limitations}</small>
                  <p>
                    <Trans>
                      Findings only. Human approval is still required.
                    </Trans>
                  </p>
                </>
              )}
              {run.providerJobId && (
                <small>
                  {t`Provider request`}: {run.providerJobId}
                </small>
              )}
              {['QUEUED', 'RUNNING'].includes(run.status) && (
                <StyledDeliveryButton
                  disabled={busy}
                  onClick={() =>
                    void change({ action: 'cancel', runId: run.id })
                  }
                >
                  <Trans>Cancel this request</Trans>
                </StyledDeliveryButton>
              )}
              <details>
                <summary>{t`Saved request context`}</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{run.prompt}</pre>
              </details>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        ))}
    </StyledDeliveryStack>
  );
};
