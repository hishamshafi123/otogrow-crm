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
  workspace: DeliveryWorkspace;
  update: (value: Partial<DeliveryAgentConfiguration>) => void;
};
export const DeliveryAgentPermissions = ({
  configuration,
  directory,
  workspace,
  update,
}: DeliveryAgentPermissionsProps) => {
  const { t } = useLingui();
  const roleIds = configuration.roleIds;
  const namedRoles = isDefined(roleIds);
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
                  <Trans>
                    Choose at least one team role. Current and future members of
                    any selected role can use this assistant within its allowed
                    projects.
                  </Trans>
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
                {(['ADMIN', 'MANAGER', 'MEMBER'] as const).map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
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
                <Trans>
                  Admins can configure assistants. Running one requires an
                  allowed role and project access. Conversation access and
                  spending limits are checked separately.
                </Trans>
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
                    const allowed = namedRoles
                      ? matching.length > 0
                      : configuration.roles.includes(
                          admin ? 'ADMIN' : manager ? 'MANAGER' : 'MEMBER',
                        );
                    const projects = workspace.projects.filter(
                      (project) =>
                        configuration.projectIds.includes(project.id) &&
                        (manager ||
                          project.memberIds.includes(member.memberId)),
                    );
                    return (
                      <li key={member.memberId} aria-label={member.name}>
                        <strong>{member.name}</strong>
                        <p>
                          {!configuration.enabled
                            ? t`Assistant is disabled`
                            : !allowed
                              ? t`No allowed role`
                              : !projects.length
                                ? t`No allowed project access`
                                : t`Can use in: ${projects.map((project) => project.name).join(', ')}`}
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
