import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { OtogrowTeamRoles } from '@/otogrow-access/OtogrowTeamRoles';
import { useId, useState } from 'react';
import { isNonEmptyString } from '@sniptt/guards';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryCommandRunner,
  type DeliveryProject,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTeamProps = {
  workspace: DeliveryWorkspace;
  run: DeliveryCommandRunner;
  busy: boolean;
  onChanged?: () => Promise<unknown>;
};
export const DeliveryTeam = ({
  workspace,
  run,
  busy,
  onChanged,
}: DeliveryTeamProps) => (
  <StyledDeliveryStack>
    <h2>
      <Trans>Projects and access</Trans>
    </h2>
    <p>
      <Trans>
        Add teammates to a project to give them access to its work. Managers can
        plan and review all projects.
      </Trans>
    </p>
    <ClientSetupLink>
      <Trans>Set up client work with a project and service plan</Trans>
    </ClientSetupLink>
    <DeliveryProjectForm
      workspace={workspace}
      run={run}
      busy={busy}
      onChanged={onChanged}
    />
    {workspace.projects.map((project) => (
      <DeliveryProjectForm
        key={project.id}
        project={project}
        workspace={workspace}
        run={run}
        busy={busy}
        onChanged={onChanged}
      />
    ))}
    {workspace.actor.isAdmin && (
      <OtogrowTeamRoles onChanged={onChanged ?? (async () => undefined)} />
    )}
  </StyledDeliveryStack>
);

const DeliveryProjectForm = ({
  workspace,
  run,
  busy,
  project,
  onChanged,
}: DeliveryTeamProps & { project?: DeliveryProject }) => {
  const { t } = useLingui();
  const [name, setName] = useState(project?.name ?? '');
  const nameHelpId = useId();
  const clientHelpId = useId();
  const validName = isNonEmptyString(name.trim());
  const [companyId, setCompanyId] = useState(project?.companyId ?? '');
  const [memberIds, setMemberIds] = useState(project?.memberIds ?? []);
  const { requestAction } = useDeliveryDraftGuard();
  const [saving, setSaving] = useState(false);
  const [openedRevision, setOpenedRevision] = useState(project?.revision);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const currentProject = {
    name: project?.name ?? '',
    companyId: project?.companyId ?? '',
    memberIds: project?.memberIds ?? [],
  };
  const [openedProject, setOpenedProject] = useState(() =>
    JSON.stringify(currentProject),
  );
  const draft = useDeliveryNativeDraft({
    extraValues: { name, companyId, memberIds },
    busy: busy || saving,
  });
  const stale = Boolean(
    project &&
    (project.revision !== openedRevision ||
      JSON.stringify(currentProject) !== openedProject),
  );
  const reload = () =>
    requestAction(() => {
      setName(currentProject.name);
      setCompanyId(currentProject.companyId);
      setMemberIds(currentProject.memberIds);
      setOpenedProject(JSON.stringify(currentProject));
      setOpenedRevision(project?.revision);
      setRefreshFailed(false);
      draft.markSaved(currentProject);
    });
  return (
    <StyledDeliveryCard>
      <details>
        <summary>
          {project ? (
            <>
              <strong>{project.name}</strong>
              {' · '}
              {project.companyId
                ? (workspace.companies.find(
                    (company) => company.id === project.companyId,
                  )?.name ?? t`Client unavailable`)
                : t`Internal work`}
              {' · '}
              <Plural
                value={project.memberIds.length}
                one="# team member"
                other="# team members"
              />
            </>
          ) : (
            <Trans>Create project</Trans>
          )}
          {draft.dirty && (
            <>
              {' · '}
              <Trans>Unsaved changes</Trans>
            </>
          )}
          {(stale || refreshFailed) && (
            <>
              {' · '}
              <Trans>Check latest version</Trans>
            </>
          )}
        </summary>
        <form
          aria-label={
            project ? t`Edit project ${project.name}` : t`Create a project`
          }
          ref={draft.formRef}
          onChange={draft.onChange}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || saving || stale || !draft.dirty || !validName) return;
            setSaving(true);
            setRefreshFailed(false);
            const savedProject = { name: name.trim(), companyId, memberIds };
            try {
              if (
                await run({
                  action: 'project',
                  ...(project
                    ? { id: project.id, revision: openedRevision }
                    : {}),
                  name: savedProject.name,
                  companyId: companyId || null,
                  memberIds,
                })
              ) {
                if (project) {
                  setOpenedRevision(project.revision + 1);
                  setName(savedProject.name);
                  setOpenedProject(JSON.stringify(savedProject));
                  draft.markSaved(savedProject);
                } else {
                  setName('');
                  setCompanyId('');
                  setMemberIds([]);
                  draft.markSaved({ name: '', companyId: '', memberIds: [] });
                }
              } else if (project && onChanged) {
                try {
                  await onChanged();
                } catch {
                  setRefreshFailed(true);
                }
              }
            } finally {
              setSaving(false);
            }
          }}
        >
          {stale && (
            <DeliveryDraftConflict onReload={reload} busy={busy || saving} />
          )}
          {refreshFailed && (
            <p role="alert">
              <Trans>
                Your draft is preserved. Use Refresh page to check the latest
                project before retrying.
              </Trans>
            </p>
          )}
          <fieldset disabled={busy || saving}>
            <StyledDeliveryStack>
              <h3>{project ? project.name : t`Create a project`}</h3>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Project name</Trans>
                  <input
                    required
                    maxLength={200}
                    aria-invalid={(draft.dirty && !validName) || undefined}
                    aria-describedby={!validName ? nameHelpId : undefined}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div>
                  <label>
                    <Trans>Client</Trans>
                    <select
                      aria-describedby={clientHelpId}
                      value={companyId}
                      onChange={(event) => setCompanyId(event.target.value)}
                    >
                      <option value="">{t`Internal work`}</option>
                      {workspace.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small id={clientHelpId}>
                    <Trans>
                      Only companies marked as clients in Clients appear here.
                    </Trans>
                  </small>
                </div>
              </StyledDeliveryGrid>
              {!validName && (
                <p id={nameHelpId} role="status">
                  <Trans>Add a project name before saving.</Trans>
                </p>
              )}
              <strong>
                <Trans>Project members</Trans>
              </strong>
              <StyledDeliveryGrid>
                {workspace.members.map((member) => (
                  <label key={member.id} style={{ flexDirection: 'row' }}>
                    <input
                      type="checkbox"
                      checked={memberIds.includes(member.id)}
                      onChange={(event) =>
                        setMemberIds(
                          event.target.checked
                            ? [...memberIds, member.id]
                            : memberIds.filter((id) => id !== member.id),
                        )
                      }
                    />
                    {member.name}
                  </label>
                ))}
              </StyledDeliveryGrid>
              <StyledDeliveryButton
                disabled={busy || saving || stale || !draft.dirty || !validName}
                type="submit"
              >
                {project ? t`Save project access` : t`Create project`}
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </fieldset>
        </form>
      </details>
    </StyledDeliveryCard>
  );
};
