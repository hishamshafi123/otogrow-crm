import { useParams } from 'react-router-dom';

import { SettingsLeadFormForm } from '@/settings/forms/components/SettingsLeadFormForm';
import { LeadFormFormMode } from '@/settings/forms/constants/LeadFormFormMode';

export const SettingsLeadFormDetail = () => {
  const { formId } = useParams();

  return <SettingsLeadFormForm mode={LeadFormFormMode.Edit} formId={formId} />;
};
