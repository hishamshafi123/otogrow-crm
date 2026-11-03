import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import {
  type ServicePlanValues,
  type ServicePlanQuestion,
  type ServicePlanMember,
  isPerformanceMarketingService,
  servicePlanServices,
} from '@/delivery/onboarding/service-plan-values';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
const StyledClientServiceChoices = styled.div`
  display: grid;
  gap: 4px 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
  margin-bottom: 12px;
  > label {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 8px;
    min-height: 44px;
  }
  input[type='checkbox'] {
    flex: 0 0 auto;
    margin: 0;
  }
`;
const StyledServicePlanFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  fieldset {
    min-inline-size: 0;
  }
`;

type ServicePlanFieldsProps = {
  values: ServicePlanValues;
  setValues: (value: ServicePlanValues) => void;
  fields: ServicePlanQuestion[];
  setFields: (value: ServicePlanQuestion[]) => void;
  members: ServicePlanMember[];
  projectMemberIds: string[];
};
export const ServicePlanFields = ({
  values,
  setValues,
  fields,
  setFields,
  members,
  projectMemberIds,
}: ServicePlanFieldsProps) => {
  const { t } = useLingui();
  const services = servicePlanServices(values.services);
  const performanceMarketing = services.some(isPerformanceMarketingService);
  const managers = members.filter((member) =>
    ['ADMIN', 'MANAGER'].includes(member.access),
  );
  const marketers = members.filter((member) =>
    projectMemberIds.includes(member.id),
  );
  const changeServices = (nextServices: string) =>
    setValues({
      ...values,
      services: nextServices,
      advertising:
        values.advertising &&
        nextServices.split(',').some(isPerformanceMarketingService),
    });
  return (
    <StyledServicePlanFields>
      {' '}
      <StyledDeliveryGrid>
        <fieldset>
          <legend>
            <Trans>Client services</Trans>
          </legend>
          <StyledClientServiceChoices>
            {[
              ['AI video', t`AI video`],
              ['Static ads', t`Static ads`],
              ['Performance marketing', t`Performance marketing`],
              ['SEO', t`SEO`],
              ['Website', t`Website`],
              ['SaaS', t`SaaS`],
              ['Mobile app', t`Mobile app`],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={services.some(
                    (service) =>
                      service.toLowerCase().replace(/[_-]+/g, ' ') ===
                      value.toLowerCase(),
                  )}
                  onChange={(event) =>
                    changeServices(
                      (event.target.checked
                        ? [...services, value]
                        : services.filter(
                            (service) =>
                              service.toLowerCase().replace(/[_-]+/g, ' ') !==
                              value.toLowerCase(),
                          )
                      ).join(', '),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </StyledClientServiceChoices>
          <label>
            <Trans>Services, separated by commas</Trans>
            <input
              name="services"
              required
              value={values.services}
              onChange={(event) => changeServices(event.target.value)}
            />
          </label>
        </fieldset>
        <label>
          <Trans>Billing arrangement</Trans>
          <select
            name="billing"
            value={values.billing}
            onChange={(event) =>
              setValues({ ...values, billing: event.target.value })
            }
          >
            <option value="">{t`Choose a billing arrangement`}</option>
            <option value="RETAINER">{t`Retainer`}</option>
            <option value="ONE_TIME">{t`One-time`}</option>
          </select>
        </label>
      </StyledDeliveryGrid>
      <label>
        <Trans>Client-visible scope</Trans>
        <textarea
          name="scope"
          required
          maxLength={6000}
          value={values.scope}
          onChange={(event) =>
            setValues({ ...values, scope: event.target.value })
          }
        />
      </label>
      <StyledDeliveryGrid>
        <label>
          <Trans>Deliverable allowance</Trans>
          <input
            name="allowance"
            maxLength={2000}
            value={values.allowance}
            onChange={(event) =>
              setValues({ ...values, allowance: event.target.value })
            }
          />
        </label>
        <label>
          <Trans>Client contact and account owner</Trans>
          <input
            name="contact"
            maxLength={500}
            value={values.contact}
            onChange={(event) =>
              setValues({ ...values, contact: event.target.value })
            }
          />
        </label>
      </StyledDeliveryGrid>
      <fieldset>
        <legend>
          <Trans>Performance marketing responsibilities</Trans>
        </legend>
        <label>
          <input
            type="checkbox"
            name="advertising"
            disabled={!performanceMarketing && !values.advertising}
            checked={values.advertising}
            onChange={(event) =>
              setValues({ ...values, advertising: event.target.checked })
            }
          />
          <Trans>Configure the PM, marketer and client budget requests</Trans>
        </label>
        {!performanceMarketing && (
          <p>{t`Select Performance marketing above to configure advertising responsibilities. Removing that service turns off this setup and the client’s budget controls when saved.`}</p>
        )}
        <p>
          <Trans>
            These assignments are reused by linked performance reports. Select
            Performance marketing in Client services to make this service plan
            available for reporting. Client budget requests change advertising
            spend, not the agency retainer.
          </Trans>
        </p>
        <fieldset hidden={!values.advertising} disabled={!values.advertising}>
          <StyledDeliveryGrid>
            <label>
              <Trans>Advertising project manager</Trans>
              <select
                name="advertisingManager"
                required
                value={values.managerId}
                onChange={(event) =>
                  setValues({ ...values, managerId: event.target.value })
                }
              >
                <option value="">{t`Choose a manager`}</option>
                {managers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Assigned marketer</Trans>
              <select
                name="advertisingMarketer"
                required
                value={values.marketerId}
                onChange={(event) =>
                  setValues({ ...values, marketerId: event.target.value })
                }
              >
                <option value="">{t`Choose a project member`}</option>
                {marketers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </StyledDeliveryGrid>
          <StyledDeliveryGrid>
            <label>
              <Trans>Advertising currency</Trans>
              <select
                name="advertisingCurrency"
                value={values.advertisingCurrency}
                onChange={(event) =>
                  setValues({
                    ...values,
                    advertisingCurrency: event.target.value,
                  })
                }
              >
                {['USD', 'AED', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              <Trans>Advertising platform</Trans>
              <select
                name="advertisingChannel"
                value={values.advertisingChannel}
                onChange={(event) =>
                  setValues({
                    ...values,
                    advertisingChannel: event.target.value,
                  })
                }
              >
                {['META', 'X', 'TIKTOK', 'CHATGPT'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Budget period</Trans>
              <select
                name="advertisingPeriod"
                value={values.advertisingPeriod}
                onChange={(event) =>
                  setValues({
                    ...values,
                    advertisingPeriod: event.target.value,
                  })
                }
              >
                <option value="DAILY">{t`Daily`}</option>
                <option value="MONTHLY">{t`Monthly`}</option>
                <option value="LIFETIME">{t`Lifetime`}</option>
              </select>
            </label>
          </StyledDeliveryGrid>
        </fieldset>
      </fieldset>
      <details>
        <summary>
          <Trans>Onboarding questions</Trans>: {fields.length} ·{' '}
          <Trans>Required</Trans>:{' '}
          {fields.filter((field) => field.required).length}
          {fields.some((field) => !field.label.trim()) && (
            <>
              {' '}
              · <Trans>Incomplete question</Trans>
            </>
          )}
        </summary>
        <StyledDeliveryStack>
          {fields.map((field, index) => (
            <StyledDeliveryRow key={field.id}>
              <label>
                <Trans>Question</Trans>
                <input
                  required
                  maxLength={200}
                  value={field.label}
                  onChange={(event) =>
                    setFields(
                      fields.map((item) =>
                        item.id === field.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    setFields(
                      fields.map((item) =>
                        item.id === field.id
                          ? { ...item, required: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                <Trans>Required</Trans>
              </label>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setFields(fields.filter((_, position) => position !== index))
                }
              >
                <Trans>Remove question</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          ))}
          <StyledDeliveryButton
            type="button"
            disabled={fields.length >= 30}
            onClick={() =>
              setFields([
                ...fields,
                { id: crypto.randomUUID(), label: '', required: false },
              ])
            }
          >
            <Trans>Add question</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </details>
    </StyledServicePlanFields>
  );
};
