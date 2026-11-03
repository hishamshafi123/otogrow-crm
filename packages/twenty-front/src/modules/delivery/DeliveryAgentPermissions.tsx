import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryAgentConfiguration } from '@/delivery/delivery-agent.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  hasOtogrowCapability,
  type OtogrowRoleDirectory,
} from '@/otogrow-access/otogrow-access.types';

const StyledList = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  max-height: 280px;
  overflow-wrap: anywhere;
  overflow-y: auto;
  padding: 8px;
  label {
    display: block;
    padding: 6px 0;
  }
  ul {
    padding-inline-start: 20px;
  }
`;
type DeliveryAgentPermissionsProps = {
  configuration: DeliveryAgentConfiguration;
  directory?: OtogrowRoleDirectory;
  workspace?: Pick<DeliveryWorkspace, 'projects'>;
  projects?: { id: string; name: string; memberIds?: string[] }[];
  update: (value: Partial<DeliveryAgentConfiguration>) => void;
};
export const DeliveryAgentPermissions = ({
  configuration,
  directory,
  workspace,
  projects,
  update,
}: DeliveryAgentPermissionsProps) => {
  const { t } = useLingui();
  const roleIds = configuration.roleIds;
  const namedRoles = isDefined(roleIds);
  const activity = configuration.kind === 'ACTIVITY';
  const availableProjects = projects ?? workspace?.projects ?? [];
  return (
    <fieldset>
      <legend>
        <Trans>Who can use this assistant</Trans>
      </legend>
      <StyledDeliveryStack>
        {!directory ? (
          <p role="status">
            <Trans>
              Team access could not be verified. Refresh before saving. Your
              edits are kept.
            </Trans>
          </p>
        ) : (
          <>
            {namedRoles ? (
              <>
                <p>
                  {activity ? (
                    <Trans>
                      Choose at least one additional team role. A person must
                      also have current administrator access to run this
                      assistant.
                    </Trans>
                  ) : (
                    <Trans>
                      Choose at least one team role. Current and future members
                      of any selected role can use this assistant within its
                      allowed projects.
                    </Trans>
                  )}
                </p>
                <StyledList>
                  {directory.roles.map((role) => (
                    <label key={role.id}>
                      <input
                        type="checkbox"
                        checked={roleIds.includes(role.id)}
                        onChange={(event) =>
                          update({
                            roleIds: event.target.checked
                              ? [...roleIds, role.id]
                              : roleIds.filter((id) => id !== role.id),
                          })
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                </StyledList>
                {roleIds.some(
                  (id) => !directory.roles.some((role) => role.id === id),
                ) && (
                  <p role="alert">
                    <Trans>
                      A selected role is no longer available. Reload the
                      assistant before saving.
                    </Trans>
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  <Trans>
                    This assistant uses existing access groups. Keep them or
                    switch to specific team roles.
                  </Trans>
                </p>
                {(activity
                  ? (['ADMIN'] as const)
                  : (['ADMIN', 'MANAGER', 'MEMBER'] as const)
                ).map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
                      disabled={activity}
                      checked={configuration.roles.includes(role)}
                      onChange={(event) =>
                        update({
                          roles: event.target.checked
                            ? [...configuration.roles, role]
                            : configuration.roles.filter(
                                (value) => value !== role,
                              ),
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
                <StyledDeliveryButton
                  type="button"
                  onClick={() => update({ roleIds: [] })}
                >
                  <Trans>Choose specific team roles</Trans>
                </StyledDeliveryButton>
              </>
            )}
            <details>
              <summary>
                <Trans>Preview team access</Trans>
              </summary>
              <p>
                {activity ? (
                  <Trans>
                    Company activity requires current administrator access and
                    the selected role restriction. Project membership cannot
                    grant access. Spending limits are checked separately.
                  </Trans>
                ) : (
                  <Trans>
                    Admins can configure assistants. Running one requires an
                    allowed role and project access. Conversation access and
                    spending limits are checked separately.
                  </Trans>
                )}
              </p>
              <StyledList>
                <ul aria-label={t`Assistant access by person`}>
                  {directory.members.map((member) => {
                    const admin = hasOtogrowCapability(
                      member.access.capabilities,
                      'workspace.admin',
                    );
                    const manager = hasOtogrowCapability(
                      member.access.capabilities,
                      'delivery.manage',
                    );
                    const matching = directory.roles.filter(
                      (role) =>
                        roleIds?.includes(role.id) &&
                        member.roleIds.includes(role.id),
                    );
                    const allowed =
                      (!activity || admin) &&
                      (namedRoles
                        ? matching.length > 0
                        : configuration.roles.includes(
                            admin ? 'ADMIN' : manager ? 'MANAGER' : 'MEMBER',
                          ));
                    const permittedProjects = availableProjects.filter(
                      (project) =>
                        configuration.projectIds.includes(project.id) &&
                        (manager ||
                          (project.memberIds?.includes(member.memberId) ??
                            member.projectMemberships.some(
                              (membership) => membership.id === project.id,
                            ))),
                    );
                    return (
                      <li key={member.memberId} aria-label={member.name}>
                        <strong>{member.name}</strong>
                        <p>
                          {!configuration.enabled
                            ? t`Assistant is disabled`
                            : activity && !admin
                              ? t`Requires current administrator access`
                              : !allowed
                                ? t`No allowed role`
                                : activity
                                  ? t`Can use for company activity`
                                  : !permittedProjects.length
                                    ? t`No allowed project access`
                                    : t`Can use in: ${permittedProjects.map((project) => project.name).join(', ')}`}
                        </p>
                        {allowed && namedRoles && (
                          <p>{t`Allowed through: ${matching.map((role) => role.name).join(', ')}`}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </StyledList>
            </details>
          </>
        )}
      </StyledDeliveryStack>
    </fieldset>
  );
};
