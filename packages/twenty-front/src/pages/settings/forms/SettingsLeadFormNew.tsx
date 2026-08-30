import { SettingsLeadFormForm } from '@/settings/forms/components/SettingsLeadFormForm';
import { LeadFormFormMode } from '@/settings/forms/constants/LeadFormFormMode';

export const SettingsLeadFormNew = () => {
  return <SettingsLeadFormForm mode={LeadFormFormMode.Create} />;
};
