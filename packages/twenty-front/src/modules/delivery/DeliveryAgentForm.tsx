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
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryAgentFormProps = {
  agent?: DeliveryAgent;
  duplicate?: boolean;
  workspace: DeliveryWorkspace;
  models: DeliveryAgentsSnapshot['models'];
  busy: boolean;
  save: (input: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
};
export const DeliveryAgentForm = ({
  agent,
  duplicate,
  workspace,
  models,
  busy,
  save,
  close,
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
  const update = (patch: Partial<DeliveryAgentConfiguration>) =>
    setConfiguration((current) => ({ ...current, ...patch }));
  return (
    <StyledDeliveryCard>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
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
        }}
      >
        <StyledDeliveryStack>
          <h3>{agent && !duplicate ? t`Edit agent` : t`Create agent`}</h3>
          {!agent && (
            <label>
              <Trans>Starter workflow</Trans>
              <select
                value={configuration.kind}
                onChange={(event) =>
                  setConfiguration(
                    starter(
                      event.target.value as DeliveryAgentConfiguration['kind'],
                    ),
                  )
                }
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
          <label>
            <Trans>Purpose</Trans>
            <textarea
              required
              maxLength={1000}
              value={configuration.purpose}
              onChange={(event) => update({ purpose: event.target.value })}
            />
          </label>
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
              <fieldset>
                <legend>
                  <Trans>Required inputs</Trans>
                </legend>
                {(['brief', 'copy', 'requirements'] as const).map((field) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={configuration.requiredInputs.includes(field)}
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
                ))}
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
                    update({ maxOutputTokens: Number(event.target.value) })
                  }
                />
              </label>
            </>
          ) : (
            <p>
              <Trans>
                Tool: public page check. Checks fetched HTML, exact link
                destination and optional anchor without an AI model. Custom
                instructions do not alter this deterministic check. No indexing
                or visual inspection claims.
              </Trans>
            </p>
          )}
          <fieldset>
            <legend>
              <Trans>Allowed projects — choose at least one</Trans>
            </legend>
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
          <fieldset>
            <legend>
              <Trans>Allowed access levels</Trans>
            </legend>
            {(['ADMIN', 'MANAGER', 'MEMBER'] as const).map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={configuration.roles.includes(role)}
                  onChange={(event) =>
                    update({
                      roles: event.target.checked
                        ? [...configuration.roles, role]
                        : configuration.roles.filter((value) => value !== role),
                    })
                  }
                />
                {role === 'ADMIN'
                  ? t`Admin`
                  : role === 'MANAGER'
                    ? t`Manager`
                    : t`Team member`}
              </label>
            ))}
          </fieldset>
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
                !configuration.projectIds.length ||
                !configuration.roles.length
              }
            >
              <Trans>Save agent</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={close}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryCard>
  );
};
