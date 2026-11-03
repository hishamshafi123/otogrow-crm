import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { OtogrowTeamRoles } from '@/otogrow-access/OtogrowTeamRoles';
import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
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
      <form
        aria-label={
          project ? t`Edit project ${project.name}` : t`Create a project`
        }
        ref={draft.formRef}
        onChange={draft.onChange}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || saving || stale || !draft.dirty) return;
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
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <Trans>Client</Trans>
                <select
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
            </StyledDeliveryGrid>
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
              disabled={busy || saving || stale || !draft.dirty}
              type="submit"
            >
              {project ? t`Save project access` : t`Create project`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
      </form>
    </StyledDeliveryCard>
  );
};
