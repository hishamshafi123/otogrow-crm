import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
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
  task: DeliveryTask;
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
};
export const DeliveryMedia = ({
  task,
  workspace,
  onChanged,
}: DeliveryMediaProps) => {
  const { t } = useLingui();
  const query = useQuery<{
    deliveryMediaModels: { id: string; kind: string; cost: null }[];
  }>(GET_MODELS, {
    variables: { taskId: task.id },
    fetchPolicy: 'network-only',
  });
  const [mutate, mutation] = useMutation(CHANGE_MEDIA);
  const [error, setError] = useState('');
  const [shotId, setShotId] = useState('');
  const [modelId, setModelId] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const document = task.details.creative;
  if (!document) return null;
  const settings = document.mediaSettings;
  const models = query.data?.deliveryMediaModels ?? [];
  const model = models.find((item) => item.id === modelId);
  const shot = document.shots.find((item) => item.id === shotId);
  const role = workspace.actor.isAdmin
    ? 'ADMIN'
    : workspace.actor.isManager
      ? 'MANAGER'
      : 'MEMBER';
  const enabled = settings?.enabled === true && settings.roles.includes(role);
  const reset = () => {
    setConfirmed(false);
    setRequestId(crypto.randomUUID());
  };
  const change = async (fields: Record<string, unknown>) => {
    setError('');
    try {
      await mutate({
        variables: {
          input: { ...fields, taskId: task.id, revision: task.revision },
        },
      });
      await onChanged();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to update generation.`,
      );
      return false;
    }
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
      <StyledDeliveryRow>
        <h4>
          <Trans>Generate a shot</Trans>
        </h4>
        <StyledDeliveryButton onClick={() => void onChanged()}>
          <Trans>Refresh run status</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      {!models.length && (
        <p>
          <Trans>
            No supported media models are connected. Upload assets made in your
            existing tools, or configure an approved Google provider and media
            model in server settings. The earlier testing key was not saved.
          </Trans>
        </p>
      )}
      {workspace.actor.isAdmin && (
        <details>
          <summary>{t`Generation access for this production`}</summary>
          <form
            key={settings?.version ?? 0}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void change({
                action: 'configure',
                enabled: data.get('enabled') === 'on',
                modelIds: data.getAll('modelIds'),
                roles: data.getAll('roles'),
                dailyRunLimit: Number(data.get('dailyRunLimit')),
                allowUnknownCost: data.get('allowUnknownCost') === 'on',
              });
            }}
          >
            <fieldset disabled={mutation.loading}>
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
                            ? t`Image quality review`
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
                <label>
                  <input
                    type="checkbox"
                    name="allowUnknownCost"
                    defaultChecked={settings?.allowUnknownCost ?? false}
                  />
                  {t`Allow bounded runs when monetary pricing is unknown`}
                </label>
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
          </form>
        </details>
      )}
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <StyledDeliveryGrid>
            <label>
              <Trans>Shot</Trans>
              <select
                value={shotId}
                onChange={(event) => {
                  setShotId(event.target.value);
                  reset();
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
                  setModelId(event.target.value);
                  reset();
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
                    setReferenceIds(
                      Array.from(event.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    );
                    reset();
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
                  This request sends the shot prompt, current approved brief and
                  selected references to the chosen provider.
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
                    Video uses the shot’s selected approved image. Duration is a
                    prompt target, not a guaranteed output length.
                  </Trans>
                </small>
              )}
              <p>
                <Trans>
                  Estimated monetary cost: unknown. One output. Cancellation may
                  still incur provider charges.
                </Trans>
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {t`I reviewed these inputs and authorize this generation request`}
              </label>
            </>
          )}
          <StyledDeliveryButton
            disabled={
              !enabled ||
              !settings?.allowUnknownCost ||
              !confirmed ||
              !shot ||
              !model ||
              mutation.loading ||
              ['APPROVED', 'IN_REVIEW'].includes(task.details.state)
            }
            onClick={async () => {
              if (
                await change({
                  action: 'generate',
                  shotId,
                  modelId,
                  kind: model?.kind,
                  referenceAssetIds: referenceIds,
                  confirm: true,
                  requestId,
                })
              )
                reset();
            }}
          >
            {model?.kind === 'INSPECTION'
              ? t`Review selected images`
              : t`Generate one candidate`}
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
      {(document.mediaRuns ?? [])
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
                  disabled={mutation.loading}
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
