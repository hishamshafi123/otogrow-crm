import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryCommandRunner,
  type DeliveryMember,
  type DeliveryProject,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTeamProps = {
  workspace: DeliveryWorkspace;
  run: DeliveryCommandRunner;
  busy: boolean;
};
export const DeliveryTeam = ({ workspace, run, busy }: DeliveryTeamProps) => (
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
    <DeliveryProjectForm workspace={workspace} run={run} busy={busy} />
    {workspace.projects.map((project) => (
      <DeliveryProjectForm
        key={project.id}
        project={project}
        workspace={workspace}
        run={run}
        busy={busy}
      />
    ))}
    {workspace.actor.isAdmin && (
      <>
        <h2>
          <Trans>Team roles</Trans>
        </h2>
        <p>
          <Trans>
            Administrators have full delivery access and can manage roles.
            Managers can assign and review work. Members work within their
            assigned projects.
          </Trans>
        </p>
        {workspace.members.map((member) => (
          <DeliveryMemberForm
            key={`${member.id}:${member.access}:${member.roleLabel}`}
            member={member}
            workspace={workspace}
            run={run}
            busy={busy}
          />
        ))}
      </>
    )}
  </StyledDeliveryStack>
);

const DeliveryProjectForm = ({
  workspace,
  run,
  busy,
  project,
}: DeliveryTeamProps & { project?: DeliveryProject }) => {
  const { t } = useLingui();
  const [name, setName] = useState(project?.name ?? '');
  const [companyId, setCompanyId] = useState(project?.companyId ?? '');
  const [memberIds, setMemberIds] = useState(project?.memberIds ?? []);
  return (
    <StyledDeliveryCard>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            (await run({
              action: 'project',
              ...(project ? { id: project.id } : {}),
              name,
              companyId: companyId || null,
              memberIds,
            })) &&
            !project
          ) {
            setName('');
            setMemberIds([]);
          }
        }}
      >
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
          <StyledDeliveryButton disabled={busy} type="submit">
            {project ? t`Save project access` : t`Create project`}
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryCard>
  );
};

const DeliveryMemberForm = ({
  member,
  workspace,
  run,
  busy,
}: DeliveryTeamProps & { member: DeliveryMember }) => {
  const { t } = useLingui();
  const [access, setAccess] = useState(member.access);
  const [roleLabel, setRoleLabel] = useState(member.roleLabel);
  return (
    <StyledDeliveryCard>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run({
            action: 'member',
            workspaceMemberId: member.id,
            access,
            roleLabel,
          });
        }}
      >
        <StyledDeliveryStack>
          <h3>{member.name}</h3>
          <StyledDeliveryRow>
            <label>
              <Trans>Role label</Trans>
              <input
                maxLength={100}
                placeholder={t`Editor, SEO specialist…`}
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
              />
            </label>
            <label>
              <Trans>Delivery access</Trans>
              <select
                disabled={member.id === workspace.actor.memberId}
                value={access}
                onChange={(event) =>
                  setAccess(event.target.value as DeliveryMember['access'])
                }
              >
                <option value="MEMBER">{t`Member`}</option>
                <option value="MANAGER">{t`Manager`}</option>
                <option value="ADMIN">{t`Administrator`}</option>
              </select>
            </label>
            <StyledDeliveryButton
              disabled={busy || member.id === workspace.actor.memberId}
              type="submit"
            >
              <Trans>Save role</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryCard>
  );
};
