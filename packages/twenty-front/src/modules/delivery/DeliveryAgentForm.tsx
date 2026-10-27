import { Link } from 'react-router-dom';
import { DeliveryAgentPermissions } from '@/delivery/DeliveryAgentPermissions';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryAgent,
  type DeliveryAgentConfiguration,
  type DeliveryAgentsSnapshot,
} from '@/delivery/delivery-agent.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryAgentFormProps = {
  agent?: DeliveryAgent;
  duplicate?: boolean;
  workspace: DeliveryWorkspace;
  models: DeliveryAgentsSnapshot['models'];
  busy: boolean;
  directory?: OtogrowRoleDirectory;
  save: (input: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
  latestVersion?: number;
  onReload?: () => void;
};
export const DeliveryAgentForm = ({
  agent,
  duplicate,
  workspace,
  models,
  directory,
  busy,
  save,
  close,
  latestVersion,
  onReload,
}: DeliveryAgentFormProps) => {
  const { t } = useLingui();
  const starter = (
    kind: DeliveryAgentConfiguration['kind'],
  ): DeliveryAgentConfiguration => ({
    name:
      kind === 'BRIEF'
        ? t`Brief checker`
        : kind === 'COPY'
          ? t`Copy and submission checker`
          : t`SEO evidence verifier`,
    purpose:
      kind === 'BRIEF'
        ? t`Find missing requirements before production.`
        : kind === 'COPY'
          ? t`Check submitted copy against the brief.`
          : t`Verify a public backlink and destination.`,
    kind,
    enabled: kind === 'SEO',
    instructions:
      kind === 'SEO'
        ? t`Check the supplied public source, exact destination and optional anchor. Report observed evidence and limitations.`
        : t`Use the brief and brand requirements. Quote evidence for every mismatch and distinguish suggestions from verified facts.`,
    requiredInputs:
      kind === 'BRIEF' ? ['brief'] : kind === 'COPY' ? ['brief', 'copy'] : [],
    outputFormat: kind === 'SEO' ? 'findings' : 'findings_and_edits',
    tools: kind === 'SEO' ? ['public_page_check'] : [],
    modelId: null,
    projectIds: [],
    roles: ['ADMIN', 'MANAGER', 'MEMBER'],
    roleIds: [],
    dailyRunLimit: 20,
    maxOutputTokens: 2048,
    humanConfirmation: true,
  });
  const [configuration, setConfiguration] =
    useState<DeliveryAgentConfiguration>(
      agent
        ? {
            ...agent.configuration,
            name: duplicate
              ? `${agent.configuration.name} (${t`copy`})`
              : agent.configuration.name,
          }
        : starter('BRIEF'),
    );
  const [baseline] = useState(() => JSON.stringify(configuration));
  const accessValid =
    Boolean(directory) &&
    (configuration.roleIds
      ? configuration.roleIds.length > 0 &&
        configuration.roleIds.every((id) =>
          directory?.roles.some((role) => role.id === id),
        )
      : configuration.roles.length > 0);
  const [saving, setSaving] = useState(false);
  const { requestAction } = useDeliveryDraftGuard();
  const dirty = JSON.stringify(configuration) !== baseline;
  const stale = Boolean(
    agent &&
    !duplicate &&
    latestVersion !== undefined &&
    latestVersion !== agent.version,
  );
  useDeliveryDraftStatus({ dirty, saving: busy || saving });
  const update = (patch: Partial<DeliveryAgentConfiguration>) =>
    setConfiguration((current) => ({ ...current, ...patch }));
  return (
    <StyledDeliveryCard>
      <form
        onInvalidCapture={(event) => {
          if (event.target instanceof HTMLElement) {
            const section = event.target.closest('details');
            if (section) section.open = true;
          }
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || saving || stale || !accessValid) return;
          setSaving(true);
          try {
            if (
              await save({
                type: 'save',
                ...(agent && !duplicate
                  ? { id: agent.id, version: agent.version }
                  : {}),
                configuration,
              })
            )
              close();
          } finally {
            setSaving(false);
          }
        }}
      >
        {stale && onReload && (
          <DeliveryDraftConflict onReload={onReload} busy={busy || saving} />
        )}
        <fieldset disabled={busy || saving}>
          <StyledDeliveryStack>
            <h3>{agent && !duplicate ? t`Edit agent` : t`Create agent`}</h3>
            <StyledDeliveryGrid>
              {!agent && (
                <label>
                  <Trans>Starter workflow</Trans>
                  <select
                    value={configuration.kind}
                    onChange={(event) => {
                      const kind = event.target
                        .value as DeliveryAgentConfiguration['kind'];
                      requestAction(() => setConfiguration(starter(kind)));
                    }}
                  >
                    <option value="BRIEF">{t`Brief checker`}</option>
                    <option value="COPY">{t`Copy and submission checker`}</option>
                    <option value="SEO">{t`SEO evidence verifier`}</option>
                  </select>
                </label>
              )}
              <label>
                <Trans>Name</Trans>
                <input
                  required
                  maxLength={100}
                  value={configuration.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </label>
            </StyledDeliveryGrid>
            <StyledDeliveryGrid>
              <label>
                <Trans>Purpose</Trans>
                <textarea
                  required
                  maxLength={1000}
                  value={configuration.purpose}
                  onChange={(event) => update({ purpose: event.target.value })}
                />
              </label>
              {configuration.kind !== 'SEO' && (
                <label>
                  <Trans>Instructions</Trans>
                  <textarea
                    required
                    maxLength={8000}
                    rows={4}
                    value={configuration.instructions}
                    onChange={(event) =>
                      update({ instructions: event.target.value })
                    }
                  />
                </label>
              )}
            </StyledDeliveryGrid>
            <label>
              <input
                type="checkbox"
                checked={configuration.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              <Trans>Enabled for new runs</Trans>
            </label>
            {configuration.kind !== 'SEO' ? (
              <>
                <label>
                  <Trans>Model</Trans>
                  <select
                    value={configuration.modelId ?? ''}
                    onChange={(event) =>
                      update({ modelId: event.target.value || null })
                    }
                  >
                    <option value="">{t`Select a connected model`}</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.provider} · {model.id}
                      </option>
                    ))}
                  </select>
                </label>
                {!models.length && (
                  <p role="status">
                    <Trans>
                      No enabled model connection is available. An admin must
                      configure a provider and enable its model in AI settings.
                      You can save a disabled agent now.
                    </Trans>
                  </p>
                )}
              </>
            ) : (
              <p>
                <Trans>
                  Tool: public page check. Checks fetched HTML, exact link
                  destination and optional anchor without an AI model. Custom
                  instructions do not alter this deterministic check. No
                  indexing or visual inspection claims.
                </Trans>
              </p>
            )}
            <StyledDeliveryGrid>
              <fieldset>
                <legend>
                  <Trans>Allowed projects — choose at least one</Trans>
                </legend>
                {!workspace.projects.length && (
                  <p>
                    <Trans>Create a project before saving an assistant.</Trans>{' '}
                    <Link to="/delivery?view=team">
                      <Trans>Set up a project</Trans>
                    </Link>
                  </p>
                )}
                {workspace.projects.map((project) => (
                  <label key={project.id}>
                    <input
                      type="checkbox"
                      checked={configuration.projectIds.includes(project.id)}
                      onChange={(event) =>
                        update({
                          projectIds: event.target.checked
                            ? [...configuration.projectIds, project.id]
                            : configuration.projectIds.filter(
                                (id) => id !== project.id,
                              ),
                        })
                      }
                    />
                    {project.name}
                  </label>
                ))}
              </fieldset>
              <DeliveryAgentPermissions
                configuration={configuration}
                directory={directory}
                workspace={workspace}
                update={update}
              />
            </StyledDeliveryGrid>
            <details>
              <summary>
                <Trans>Run settings</Trans> · {configuration.dailyRunLimit}{' '}
                <Trans>runs per day</Trans>
                {configuration.kind !== 'SEO' && (
                  <>
                    {' '}
                    · {configuration.maxOutputTokens}{' '}
                    <Trans>output tokens per run</Trans>
                  </>
                )}
              </summary>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Runs per day, shared across the team (UTC)</Trans>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={configuration.dailyRunLimit}
                    onChange={(event) =>
                      update({ dailyRunLimit: Number(event.target.value) })
                    }
                  />
                </label>
                {configuration.kind !== 'SEO' && (
                  <>
                    <fieldset>
                      <legend>
                        <Trans>Required inputs</Trans>
                      </legend>
                      {(['brief', 'copy', 'requirements'] as const).map(
                        (field) => (
                          <label key={field}>
                            <input
                              type="checkbox"
                              checked={configuration.requiredInputs.includes(
                                field,
                              )}
                              onChange={(event) =>
                                update({
                                  requiredInputs: event.target.checked
                                    ? [...configuration.requiredInputs, field]
                                    : configuration.requiredInputs.filter(
                                        (value) => value !== field,
                                      ),
                                })
                              }
                            />
                            {field === 'brief'
                              ? t`Brief`
                              : field === 'copy'
                                ? t`Copy`
                                : t`Brand requirements`}
                          </label>
                        ),
                      )}
                    </fieldset>
                    <label>
                      <Trans>Output</Trans>
                      <select
                        value={configuration.outputFormat}
                        onChange={(event) =>
                          update({
                            outputFormat: event.target
                              .value as DeliveryAgentConfiguration['outputFormat'],
                          })
                        }
                      >
                        <option value="findings">{t`Findings only`}</option>
                        <option value="findings_and_edits">{t`Findings and proposed edits`}</option>
                      </select>
                    </label>
                    <label>
                      <Trans>Maximum output tokens per run</Trans>
                      <input
                        type="number"
                        min={256}
                        max={4096}
                        required
                        value={configuration.maxOutputTokens}
                        onChange={(event) =>
                          update({
                            maxOutputTokens: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </StyledDeliveryGrid>
            </details>
            <p>
              <Trans>
                Human confirmation is required for every proposed edit. Agents
                cannot approve delivery work or contact clients. Failed and
                cancelled runs count toward the daily limit.
              </Trans>
            </p>
            <StyledDeliveryRow>
              <StyledDeliveryButton
                type="submit"
                disabled={
                  busy ||
                  saving ||
                  stale ||
                  !configuration.projectIds.length ||
                  !accessValid
                }
              >
                <Trans>Save agent</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() => requestAction(close)}
              >
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </fieldset>
      </form>
    </StyledDeliveryCard>
  );
};
