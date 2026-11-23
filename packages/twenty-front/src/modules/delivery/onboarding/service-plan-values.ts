import { useLingui } from '@lingui/react/macro';
import { type ClientEngagement } from '@/delivery/delivery-clients.types';
import { type ClientSetupPlan } from '@/delivery/onboarding/client-setup.types';

export type ServicePlanMember = { id: string; name: string; access: string };
export type ServicePlanValues = {
  projectId: string;
  name: string;
  services: string;
  billing: string;
  scope: string;
  allowance: string;
  contact: string;
  advertising: boolean;
  managerId: string;
  marketerId: string;
  advertisingCurrency: string;
  advertisingChannel: string;
  advertisingPeriod: string;
};
export type ServicePlanQuestion = {
  id: string;
  label: string;
  required: boolean;
};
export const isPerformanceMarketingService = (service: string) =>
  service.trim().toLowerCase().replace(/[_-]+/g, ' ') ===
  'performance marketing';
export const servicePlanServices = (value: string) =>
  value
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);
export const servicePlanValues = (
  initial:
    | (Pick<
        ClientEngagement,
        | 'projectId'
        | 'name'
        | 'services'
        | 'scope'
        | 'allowance'
        | 'contact'
        | 'advertising'
      > & { billing: string })
    | null,
): ServicePlanValues => ({
  projectId: initial?.projectId ?? '',
  name: initial?.name ?? '',
  services: initial?.services.join(', ') ?? '',
  billing: initial?.billing ?? 'RETAINER',
  scope: initial?.scope ?? '',
  allowance: initial?.allowance ?? '',
  contact: initial?.contact ?? '',
  advertising: Boolean(initial?.advertising),
  managerId: initial?.advertising?.managerId ?? '',
  marketerId: initial?.advertising?.marketerId ?? '',
  advertisingCurrency: initial?.advertising?.currency ?? 'USD',
  advertisingChannel: initial?.advertising?.channel ?? 'META',
  advertisingPeriod: initial?.advertising?.period ?? 'DAILY',
});
export const servicePlanInput = (
  values: ServicePlanValues,
  fields: ServicePlanQuestion[],
): ClientSetupPlan => ({
  name: values.name,
  services: servicePlanServices(values.services),
  billing: values.billing,
  scope: values.scope,
  allowance: values.allowance,
  contact: values.contact,
  fields,
  advertising: values.advertising
    ? {
        managerId: values.managerId,
        marketerId: values.marketerId,
        currency: values.advertisingCurrency,
        channel: values.advertisingChannel,
        period: values.advertisingPeriod,
      }
    : null,
});
export const useServicePlanRequirements = (
  values: ServicePlanValues,
  fields: ServicePlanQuestion[],
  members: ServicePlanMember[],
  projectMemberIds: string[],
) => {
  const { t } = useLingui();
  const services = servicePlanServices(values.services);
  return [
    ...(!values.name.trim() ? [t`Enter a service plan name.`] : []),
    ...(!services.length ||
    services.length > 20 ||
    services.some((service) => service.length > 100)
      ? [
          t`Enter one to twenty services, with at most 100 characters per service.`,
        ]
      : []),
    ...(!['RETAINER', 'ONE_TIME'].includes(values.billing)
      ? [t`Choose a billing arrangement.`]
      : []),
    ...(!values.scope.trim()
      ? [t`Describe the scope the client will see.`]
      : []),
    ...(fields.some((field) => !field.label.trim())
      ? [t`Name each onboarding question or remove it.`]
      : []),
    ...(values.advertising && !services.some(isPerformanceMarketingService)
      ? [
          t`Select Performance marketing in Client services or turn off advertising responsibilities.`,
        ]
      : []),
    ...(values.advertising &&
    !members.some(
      (member) =>
        member.id === values.managerId &&
        ['ADMIN', 'MANAGER'].includes(member.access),
    )
      ? [t`Choose an advertising project manager.`]
      : []),
    ...(values.advertising &&
    !members.some(
      (member) =>
        member.id === values.marketerId && projectMemberIds.includes(member.id),
    )
      ? [t`Choose a marketer who belongs to this project.`]
      : []),
    ...(values.advertising &&
    values.managerId &&
    values.managerId === values.marketerId
      ? [t`The project manager and marketer must be different people.`]
      : []),
  ];
};
