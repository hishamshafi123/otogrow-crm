import { Trans, useLingui } from '@lingui/react/macro';
import { useId } from 'react';
import { DeliveryFormRequirements } from '@/delivery/forms/DeliveryFormRequirements';
import { type ContentChoices } from '@/delivery/content/content.types';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryContentAccountSaveInput,
  type DeliveryContentPlanSaveInput,
} from '~/generated-metadata/graphql';

export const ContentAccountFields = ({
  value,
  update,
  editing,
}: {
  value: DeliveryContentAccountSaveInput;
  update: (value: DeliveryContentAccountSaveInput) => void;
  editing: boolean;
}) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          Store the account your team will post to manually. This does not
          connect a social account or grant publishing access.
        </Trans>
      </p>
      <StyledDeliveryGrid>
        <label>
          <Trans>Channel</Trans>
          <select
            required
            disabled={editing}
            value={value.platform}
            onChange={(event) =>
              update({ ...value, platform: event.currentTarget.value })
            }
          >
            {['X', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'].map((platform) => (
              <option key={platform} value={platform}>
                {labels.platform(platform)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>Account name</Trans>
          <input
            required
            maxLength={200}
            value={value.name}
            onChange={(event) =>
              update({ ...value, name: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <Trans>Account handle</Trans>
          <input
            required
            maxLength={200}
            disabled={editing}
            value={value.handle}
            onChange={(event) =>
              update({ ...value, handle: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <Trans>Public profile or page link</Trans>
          <input
            required
            type="url"
            pattern="https://.*"
            maxLength={2000}
            disabled={editing}
            placeholder={t`https://…`}
            value={value.profileUrl}
            onChange={(event) =>
              update({ ...value, profileUrl: event.currentTarget.value })
            }
          />
        </label>
      </StyledDeliveryGrid>
      {editing && (
        <>
          <p>
            <Trans>
              The channel and page identity stay fixed. Add a separate account
              to use another page.
            </Trans>
          </p>
          <label>
            <input
              type="checkbox"
              checked={value.archived}
              onChange={(event) =>
                update({ ...value, archived: event.currentTarget.checked })
              }
            />
            <Trans>Archive this account from new posting choices</Trans>
          </label>
          <p>
            <Trans>
              Account metadata changes require unpublished posts to be checked
              again. Existing publication evidence stays historical.
            </Trans>
          </p>
        </>
      )}
    </StyledDeliveryStack>
  );
};

export const contentPlanReady = (
  value: DeliveryContentPlanSaveInput,
  choices: ContentChoices,
) =>
  Boolean(
    value.title.trim() &&
    (!value.engagementId
      ? !value.service
      : choices.engagements.some(
          (engagement) =>
            engagement.id === value.engagementId &&
            engagement.services.includes(value.service ?? ''),
        )),
  );

export const ContentPlanFields = ({
  value,
  update,
  choices,
}: {
  value: DeliveryContentPlanSaveInput;
  update: (value: DeliveryContentPlanSaveInput) => void;
  choices: ContentChoices;
}) => {
  const { t } = useLingui();
  const prefix = useId();
  const engagement = choices.engagements.find(
    (item) => item.id === value.engagementId,
  );
  return (
    <StyledDeliveryStack>
      <label>
        <Trans>Plan title</Trans>
        <input
          required
          id={`${prefix}-title`}
          maxLength={200}
          value={value.title}
          onChange={(event) =>
            update({ ...value, title: event.currentTarget.value })
          }
        />
      </label>
      <label>
        <Trans>Objective and creative brief</Trans>
        <textarea
          rows={5}
          maxLength={6000}
          value={value.purpose}
          onChange={(event) =>
            update({ ...value, purpose: event.currentTarget.value })
          }
        />
      </label>
      <details>
        <summary>
          <Trans>Optional client service context</Trans>
        </summary>
        <StyledDeliveryGrid>
          <label>
            <Trans>Client engagement</Trans>
            <select
              id={`${prefix}-engagement`}
              value={engagement?.id ?? ''}
              onChange={(event) =>
                update({
                  ...value,
                  engagementId: event.currentTarget.value || null,
                  service: null,
                })
              }
            >
              <option value="">{t`Internal or project-level content`}</option>
              {choices.engagements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {engagement && (
            <label>
              <Trans>Service</Trans>
              <select
                required
                id={`${prefix}-service`}
                value={value.service ?? ''}
                onChange={(event) =>
                  update({
                    ...value,
                    service: event.currentTarget.value || null,
                  })
                }
              >
                <option value="">{t`Choose a service`}</option>
                {engagement.services.map((service) => (
                  <option key={service}>{service}</option>
                ))}
              </select>
            </label>
          )}
        </StyledDeliveryGrid>
      </details>
      <DeliveryFormRequirements
        requirements={[
          ...(!value.title.trim()
            ? [
                {
                  targetId: `${prefix}-title`,
                  message: t`Add a title for this content plan.`,
                },
              ]
            : []),
          ...(value.engagementId && !engagement
            ? [
                {
                  targetId: `${prefix}-engagement`,
                  message: t`The selected client service context is unavailable. Choose a current engagement or remove the link.`,
                },
              ]
            : []),
          ...(engagement && !engagement.services.includes(value.service ?? '')
            ? [
                {
                  targetId: `${prefix}-service`,
                  message: t`Choose a current service for this engagement.`,
                },
              ]
            : []),
        ]}
      />
      <p>
        <Trans>
          Each channel gets its own posting package and review. Creating this
          plan does not assign duplicate production tasks or fulfil a client
          commitment. Client service context is optional, including for
          Otogrow's own brand.
        </Trans>
      </p>
    </StyledDeliveryStack>
  );
};
