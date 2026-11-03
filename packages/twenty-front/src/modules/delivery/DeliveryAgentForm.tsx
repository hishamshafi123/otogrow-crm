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
} from '@/delivery/delivery-agent.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type DeliveryAgentFormInput = {
  type: 'save';
  id?: string;
  version?: number;
  configuration: DeliveryAgentConfiguration;
};
type DeliveryAgentFormProps = {
  agent?: DeliveryAgent;
  duplicate?: boolean;
  workspace?: Pick<DeliveryWorkspace, 'projects'>;
  projects?: { id: string; name: string; memberIds?: string[] }[];
  models: { id: string; provider: string }[];
  busy: boolean;
  readOnly?: boolean;
  directory?: OtogrowRoleDirectory;
  save: (input: DeliveryAgentFormInput) => Promise<boolean>;
  close: () => void;
  onSaved?: () => void;
  latestVersion?: number;
  onReload?: () => void;
};
export const DeliveryAgentForm = ({
  agent,
  duplicate,
  workspace,
  projects,
  models,
  directory,
  busy,
  readOnly = false,
  save,
  close,
  onSaved,
  latestVersion,
  onReload,
}: DeliveryAgentFormProps) => {
  const { t } = useLingui();
  const availableProjects = projects ?? workspace?.projects ?? [];
  const starter = (
    kind: DeliveryAgentConfiguration['kind'],
  ): DeliveryAgentConfiguration => ({
    name:
      kind === 'BRIEF'
        ? t`Brief checker`
        : kind === 'COPY'
          ? t`Copy and submission checker`
          : kind === 'ADVERTISING'
            ? t`Advertising recommendations`
            : kind === 'ACTIVITY'
              ? t`Team activity analysis`
              : t`SEO evidence verifier`,
    purpose:
      kind === 'BRIEF'
        ? t`Find missing requirements before production.`
        : kind === 'COPY'
          ? t`Check submitted copy against the brief.`
          : kind === 'ADVERTISING'
            ? t`Prepare evidence-backed recommendations from an exact account report for manager review.`
            : kind === 'ACTIVITY'
              ? t`Answer administrators' questions using bounded recorded activity and cited evidence.`
              : t`Verify a public backlink and destination.`,
    kind,
    enabled: kind === 'SEO',
    instructions:
      kind === 'SEO'
        ? t`Check the supplied public source, exact destination and optional anchor. Report observed evidence and limitations.`
        : kind === 'ADVERTISING'
          ? t`Use only the selected report evidence and additional requirements. Keep missing outcomes unknown, cite evidence, and propose work for manager review. Never claim to change an ad account or assign work.`
          : kind === 'ACTIVITY'
            ? t`Answer only from the selected recorded evidence. Cite every factual claim, distinguish actors from affected people, and explain missing history. Do not infer working hours, productivity, employee ratings or current blockers from historical clicks.`
            : t`Use the brief and brand requirements. Quote evidence for every mismatch and distinguish suggestions from verified facts.`,
    requiredInputs:
      kind === 'BRIEF'
        ? ['brief']
        : kind === 'COPY'
          ? ['brief', 'copy']
          : kind === 'ADVERTISING'
            ? ['report']
            : kind === 'ACTIVITY'
              ? ['activity', 'question']
              : [],
    outputFormat:
      kind === 'SEO'
        ? 'findings'
        : kind === 'ADVERTISING'
          ? 'recommendations'
          : kind === 'ACTIVITY'
            ? 'analysis'
            : 'findings_and_edits',
    tools: kind === 'SEO' ? ['public_page_check'] : [],
    modelId: null,
    projectIds: [],
    roles: kind === 'ACTIVITY' ? ['ADMIN'] : ['ADMIN', 'MANAGER', 'MEMBER'],
    roleIds: kind === 'ACTIVITY' ? null : [],
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
  const modelUnavailable =
    configuration.kind !== 'SEO' &&
    configuration.enabled &&
    !models.some((model) => model.id === configuration.modelId);
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
          if (
            busy ||
            saving ||
            readOnly ||
            stale ||
            !accessValid ||
            modelUnavailable
          )
            return;
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
              (onSaved ?? close)();
          } finally {
            setSaving(false);
          }
        }}
      >
        {stale && onReload && (
          <DeliveryDraftConflict onReload={onReload} busy={busy || saving} />
        )}
        <fieldset disabled={busy || saving || readOnly}>
          <StyledDeliveryStack>
            <h3>
              {agent && !duplicate ? t`Edit assistant` : t`Create assistant`}
            </h3>
            <StyledDeliveryGrid>
              {!agent && (
                <label>
                  <Trans>Starter workflow</Trans>
                  <select
                    aria-label={t`Starter workflow`}
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
                    <option value="ADVERTISING">{t`Advertising recommendations`}</option>
                    <option value="ACTIVITY">{t`Team activity analysis`}</option>
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
            {configuration.kind === 'ADVERTISING' && (
              <p>
                <Trans>
                  Run this assistant from an exact report in Advertising.
                  Recommendations stay in draft until a manager reviews them;
                  this assistant cannot change ads or assign tasks.
                </Trans>
              </p>
            )}
            {configuration.kind === 'ACTIVITY' && (
              <p>
                <Trans>
                  Run this assistant in Team activity with an explicit question
                  and reviewed evidence. Current administrator access is always
                  required; selected team roles add a restriction. Answers
                  cannot assign work, change records or rate employees.
                </Trans>
              </p>
            )}
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
                    aria-label={t`Model`}
                    required={configuration.enabled}
                    value={configuration.modelId ?? ''}
                    onChange={(event) =>
                      update({ modelId: event.target.value || null })
                    }
                  >
                    <option value="">{t`Choose a permitted model`}</option>
                    {configuration.modelId !== null &&
                      !models.some(
                        (model) => model.id === configuration.modelId,
                      ) && (
                        <option
                          value={configuration.modelId}
                        >{t`Selected model unavailable`}</option>
                      )}
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
                      No permitted model is available. An admin can review the
                      provider and model settings. You can save a disabled
                      assistant now.
                    </Trans>
                  </p>
                )}
                {modelUnavailable && (
                  <p role="status">
                    <Trans>
                      Choose a permitted model or disable new runs before
                      saving. The previous model selection is kept.
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
              {configuration.kind === 'ACTIVITY' ? (
                <p>
                  <Trans>
                    Workspace scope: this assistant uses permitted company
                    activity. It does not require a project or grant anyone
                    access to activity records.
                  </Trans>
                </p>
              ) : (
                <fieldset>
                  <legend>
                    <Trans>Allowed projects — choose at least one</Trans>
                  </legend>
                  {!availableProjects.length && (
                    <p>
                      <Trans>
                        Create a project before saving an assistant.
                      </Trans>{' '}
                      <Link to="/delivery?view=team">
                        <Trans>Set up a project</Trans>
                      </Link>
                    </p>
                  )}
                  {availableProjects.map((project) => (
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
              )}
              <DeliveryAgentPermissions
                configuration={configuration}
                directory={directory}
                projects={availableProjects}
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
                      {(configuration.kind === 'ACTIVITY'
                        ? (['activity', 'question'] as const)
                        : configuration.kind === 'ADVERTISING'
                          ? (['report', 'requirements'] as const)
                          : (['brief', 'copy', 'requirements'] as const)
                      ).map((field) => (
                        <label key={field}>
                          <input
                            type="checkbox"
                            disabled={[
                              'report',
                              'activity',
                              'question',
                            ].includes(field)}
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
                          {field === 'activity'
                            ? t`Activity evidence (required)`
                            : field === 'question'
                              ? t`Question (required)`
                              : field === 'report'
                                ? t`Report evidence (required)`
                                : field === 'brief'
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
                        aria-label={t`Output`}
                        disabled={['ADVERTISING', 'ACTIVITY'].includes(
                          configuration.kind,
                        )}
                        value={configuration.outputFormat}
                        onChange={(event) =>
                          update({
                            outputFormat: event.target
                              .value as DeliveryAgentConfiguration['outputFormat'],
                          })
                        }
                      >
                        {configuration.kind === 'ACTIVITY' ? (
                          <option value="analysis">{t`Evidence-linked analysis`}</option>
                        ) : configuration.kind === 'ADVERTISING' ? (
                          <option value="recommendations">{t`Recommendations for manager review`}</option>
                        ) : (
                          <>
                            <option value="findings">{t`Findings only`}</option>
                            <option value="findings_and_edits">{t`Findings and proposed edits`}</option>
                          </>
                        )}
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
                  readOnly ||
                  modelUnavailable ||
                  stale ||
                  (configuration.kind !== 'ACTIVITY' &&
                    !configuration.projectIds.length) ||
                  !accessValid
                }
              >
                <Trans>Save assistant</Trans>
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
